importScripts('auto-update.js');
importScripts('run-alerts.js');
// Drives a run: one company and one list (purchase, then sales) at a time.
// State lives in chrome.storage.local so a run survives the service worker
// going to sleep; each page asks for its task when it loads.
const BASE = 'https://app.symfonia.pl/earchive/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getState() { return (await chrome.storage.local.get('run')).run || null; }
async function setState(run) { await chrome.storage.local.set({ run }); }
async function log(text, level) {
  const run = await getState();
  if (!run) return;
  run.log.push({ t: new Date().toLocaleTimeString('pl-PL'), text, level: level || 'info' });
  if (run.log.length > 400) run.log = run.log.slice(-400);
  await setState(run);
}

function pad(n) { return String(n).padStart(2, '0'); }
function monthRange(ym) { // 'YYYY-MM' -> dd-mm-yyyy from/to
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: '01-' + pad(m) + '-' + y, to: pad(last) + '-' + pad(m) + '-' + y };
}
// Plain ASCII names: Chrome may silently refuse a suggested name it cannot write.
const PL = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z', 'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z' };
function safe(s) { return String(s).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL[c]).normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, 80) || 'firma'; }
function taskUrl(t) { return BASE + t.tenantId + '/company/' + t.companyId + '/documents/' + (t.kind === 'purchase' ? 'purchase' : 'sales'); }

function buildTasks(companies, opts) {
  const { from, to } = monthRange(opts.month);
  const kinds = [];
  if (opts.purchase) kinds.push('purchase');
  if (opts.sales) kinds.push('sales');
  const formats = opts.format === 'both' ? ['PDF', 'XML'] : [opts.format];
  const tasks = [];
  companies.forEach((c) => kinds.forEach((kind) => tasks.push({
    id: c.id + ':' + kind, companyId: c.id, tenantId: c.tenantId, nip: c.nip, name: c.name, kind,
    from, to, report: !!opts.report, formats: opts.invoices ? formats : []
  })));
  return tasks;
}

async function startRun(companies, opts, tabId) {
  const tasks = buildTasks(companies, opts);
  if (!tasks.length) return { ok: false, error: 'Nic do zrobienia – zaznacz firmy i co pobrać.' };
  const run = { active: true, paused: false, tabId, month: opts.month, tasks, idx: 0, running: null, results: {}, log: [], started: Date.now() };
  await setState(run);
  void chrome.action.setBadgeText({ text: '' }).catch(() => {});
  await log('Start: ' + companies.length + ' firm, miesiąc ' + opts.month + '.');
  await goToCurrent();
  return { ok: true };
}

async function goToCurrent() {
  const run = await getState();
  if (!run || !run.active || run.paused) return;
  if (run.idx >= run.tasks.length) {
    run.active = false;
    run.finished = Date.now();
    await setState(run);
    await log('Gotowe. Pliki są w folderze Pobrane\\KSeF\\' + run.month + '.', 'ok');
    await notifyKsefRun('complete', 'Zakończono pobieranie za ' + run.month + '. Pliki są w Pobrane\\KSeF\\' + run.month + '.');
    return;
  }
  const t = run.tasks[run.idx];
  run.running = null;
  await setState(run);
  try { await chrome.tabs.update(run.tabId, { url: taskUrl(t) }); }
  catch (e) { await pause('Karta z Symfonią została zamknięta. Otwórz Symfonię i kliknij „Wznów”.'); }
}

async function pause(reason, detail) {
  const run = await getState();
  if (!run) return;
  const wasPaused = run.paused;
  run.paused = true;
  await setState(run);
  await log(reason, 'warn');
  if (!wasPaused) await notifyKsefRun('error', detail || reason);
}

// ---- downloads: give each file a clear name in Downloads\KSeF\<month>\ ----
const pending = []; // {name, task, resolve, timer}
let currentTask = null;

function fileNameFor(label, task, run, original) {
  const kind = task.kind === 'purchase' ? 'Zakupowe' : 'Sprzedazowe';
  const base = 'KSeF/' + run.month + '/' + safe(task.name) + ' (' + task.nip + ') - ';
  if (label === 'report') {
    const ext = (original.match(/\.(xlsx?|csv)$/i) || ['.xlsx'])[0].toLowerCase();
    return base + 'Raport_Faktury_' + kind + ext;
  }
  const [, fmt, page] = label.split('|');
  const invoiceBase = fmt === 'PDF'
    ? 'KSeF/' + run.month + '/' + safe(task.name) + '/' + safe(task.name) + ' (' + task.nip + ') - '
    : base;
  return invoiceBase + 'Faktury_' + kind + '_' + fmt + (page !== '1' ? '_str' + page : '') + '.zip';
}

const isSymfonia = (item) => /^blob:https:\/\/app\.symfonia\.pl\//.test(item.url || '') || /app\.symfonia\.pl/.test(item.referrer || '');
function claim(item) {
  let p = pending.find((x) => x.id === item.id);
  if (!p && isSymfonia(item)) { p = pending.find((x) => !x.id); if (p) p.id = item.id; }
  return p;
}
// onCreated catches the file even when Chrome does not let us rename it.
chrome.downloads.onCreated.addListener((item) => { claim(item); });
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const p = claim(item);
  if (!p) { suggest(); return; }
  suggest({ filename: p.filename(item.filename || ''), conflictAction: 'uniquify' });
});

chrome.downloads.onChanged.addListener((d) => {
  const i = pending.findIndex((x) => x.id === d.id);
  if (i < 0 || !d.state) return;
  if (d.state.current === 'complete' || d.state.current === 'interrupted') {
    const p = pending.splice(i, 1)[0];
    clearTimeout(p.timer);
    p.resolve(d.state.current === 'complete' ? { ok: true } : { ok: false, error: 'pobieranie przerwane' });
  }
});

// ---- messages ----
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === 'ksef-audio') return false;
  (async () => {
    if (msg.type === 'testAlert') return reply(await notifyKsefRun('complete', 'To jest test powiadomienia i dźwięku wtyczki KSeF.', true));
    if (msg.type === 'checkUpdate') return reply(await checkKsefUpdate());
    if (msg.type === 'progress') {
      const run = await getState();
      if (run?.active && !run.paused && sender.tab?.id === run.tabId && run.tasks[run.idx]?.id === msg.taskId) {
        await log(String(msg.text || '').slice(0, 180));
      }
      return reply(true);
    }
    if (globalThis.ksefUpdateBusy && ['start', 'resume', 'skip'].includes(msg.type)) {
      return reply({ ok: false, error: 'Trwa aktualizacja wtyczki. Sprobuj ponownie za chwile.' });
    }
    if (msg.type === 'companies') {
      await chrome.storage.local.set({ companies: msg.companies, companiesAt: Date.now() });
      return reply(true);
    }
    if (msg.type === 'learnCompany') {
      const { learned = {} } = await chrome.storage.local.get('learned');
      learned[msg.company.id] = msg.company;
      await chrome.storage.local.set({ learned });
      return reply(true);
    }
    if (msg.type === 'start') return reply(await startRun(msg.companies, msg.opts, msg.tabId));
    if (msg.type === 'stop') {
      const run = await getState();
      if (run) { run.active = false; await setState(run); await log('Zatrzymano.', 'warn'); }
      return reply(true);
    }
    if (msg.type === 'resume') {
      const run = await getState();
      if (run && run.paused) {
        run.paused = false;
        run.active = true;
        if (msg.tabId) run.tabId = msg.tabId;
        await setState(run);
        await log('Wznowiono.');
        await goToCurrent();
      }
      return reply(true);
    }
    if (msg.type === 'getTask') {
      const run = await getState();
      if (!run || !run.active || run.paused || !sender.tab || sender.tab.id !== run.tabId) return reply(null);
      const t = run.tasks[run.idx];
      if (!t || run.running === t.id || !msg.url.startsWith(taskUrl(t))) return reply(null);
      run.running = t.id;
      await setState(run);
      currentTask = t;
      await log((t.kind === 'purchase' ? 'Zakupy' : 'Sprzedaż') + ': ' + t.name + '…');
      return reply(t);
    }
    if (msg.type === 'expectDownload') {
      const run = await getState();
      const t = currentTask || (run && run.tasks[run.idx]);
      if (!run || !t) return reply({ ok: false, error: 'brak aktywnego zadania' });
      const res = await new Promise((resolve) => {
        const entry = { name: msg.name, resolve, filename: (orig) => fileNameFor(msg.name, t, run, orig) };
        entry.timer = setTimeout(() => {
          const i = pending.indexOf(entry);
          if (i >= 0) pending.splice(i, 1);
          resolve({ ok: false, error: 'plik nie pojawił się w ciągu ' + Math.round(msg.timeout / 1000) + ' s' });
        }, msg.timeout || 120000);
        pending.push(entry);
      });
      return reply(res);
    }
    if (msg.type === 'taskDone') {
      const run = await getState();
      if (!run || !run.active) return reply(true);
      const t = run.tasks[run.idx];
      if (!t || t.id !== msg.taskId) return reply(true);
      const r = msg.result || {};
      run.results[t.id] = r;
      await setState(run);
      const who = (t.kind === 'purchase' ? 'Zakupy' : 'Sprzedaż') + ': ' + t.name;
      if (!r.ok) {
        await log(who + ' – błąd: ' + r.error, 'err');
        await pause('Wstrzymano. Sprawdź stronę w Symfonii i kliknij „Wznów”, żeby spróbować jeszcze raz, albo „Pomiń”.', r.error);
        return reply(true);
      }
      if (r.empty) await log(who + ' – brak faktur w tym miesiącu.', 'muted');
      else {
        const miss = typeof r.expected === 'number' && r.invoices && r.invoices !== r.expected;
        await log(who + ' – ' + (r.reportOk ? 'raport XLS, ' : '') + (r.invoices ? r.invoices + ' faktur w ' + r.zips + ' ZIP' : 'bez faktur') + (miss ? ' (lista podaje ' + r.expected + '!)' : '') + '.', miss ? 'warn' : 'ok');
      }
      const run2 = await getState();
      run2.idx++;
      await setState(run2);
      await sleep(1500 + Math.random() * 1500);
      await goToCurrent();
      return reply(true);
    }
    if (msg.type === 'skip') {
      const run = await getState();
      if (run) {
        const t = run.tasks[run.idx];
        if (t) await log('Pominięto: ' + t.name + ' (' + (t.kind === 'purchase' ? 'zakupy' : 'sprzedaż') + ').', 'warn');
        run.idx++;
        run.paused = false;
        run.active = true;
        await setState(run);
        await goToCurrent();
      }
      return reply(true);
    }
    reply(null);
  })();
  return true;
});

// Leaving Symfonia (e.g. the login page) during a run pauses it.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const run = await getState();
  if (!run || !run.active || run.paused || tabId !== run.tabId) return;
  if (info.status === 'loading') {
    if (run.running) { run.running = null; await setState(run); } // a reload restarts the current step
    if (tab.url && /identity\.symfonia\.pl|login/i.test(tab.url)) await pause('Symfonia wylogowała. Zaloguj się w tej karcie i kliknij „Wznów”.');
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const run = await getState();
  if (run && run.active && !run.paused && tabId === run.tabId) await pause('Karta z Symfonią została zamknięta. Otwórz Symfonię i kliknij „Wznów”.');
});
