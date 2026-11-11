const $ = (id) => document.getElementById(id);
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
let companies = [];

function prevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(ym) { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + ' ' + y; }

async function loadCompanies() {
  const st = await chrome.storage.local.get(['companies', 'learned', 'excluded']);
  const map = {};
  (st.companies || []).forEach((c) => { if (!c.demo) map[c.id] = c; });
  Object.values(st.learned || {}).forEach((c) => { if (!map[c.id]) map[c.id] = c; });
  companies = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const excluded = st.excluded || null; // null = first time: everything but the office itself
  const list = $('list');
  list.textContent = '';
  if (!companies.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Otwórz Symfonię KSeF (Lista firm) w tej karcie i otwórz wtyczkę ponownie – lista firm pojawi się tutaj.';
    list.appendChild(e);
    return;
  }
  companies.forEach((c) => {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = c.id; cb.id = 'c-' + c.id;
    cb.checked = excluded ? !excluded.includes(c.id) : !c.main;
    cb.addEventListener('change', saveExcluded);
    const n = document.createElement('span'); n.className = 'cname'; n.textContent = c.name;
    const nip = document.createElement('span'); nip.className = 'nip'; nip.textContent = c.nip;
    l.append(cb, n, nip);
    list.appendChild(l);
  });
  applySearch();
}
async function saveExcluded() {
  const excluded = Array.from(document.querySelectorAll('#list input')).filter((x) => !x.checked).map((x) => x.value);
  await chrome.storage.local.set({ excluded });
  hint();
}
// Search ignores case and Polish letters: "plonka" finds "PŁONKA".
const fold = (s) => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
function applySearch() {
  const q = fold($('search').value.trim());
  let shown = 0;
  companies.forEach((c) => {
    const cb = $('c-' + c.id);
    if (!cb) return;
    const hit = !q || fold(c.name).includes(q) || c.nip.includes(q.replace(/\D/g, '') || '\u0000');
    cb.parentElement.hidden = !hit;
    if (hit) shown++;
  });
  let none = $('noHits');
  if (!shown && companies.length) {
    if (!none) { none = document.createElement('div'); none.id = 'noHits'; none.className = 'empty'; $('list').appendChild(none); }
    none.textContent = 'Brak firmy pasującej do „' + $('search').value.trim() + '”.';
  } else if (none) none.remove();
}
const visibleBoxes = () => Array.from(document.querySelectorAll('#list input')).filter((x) => !x.parentElement.hidden);
function selected() { return companies.filter((c) => { const cb = $('c-' + c.id); return cb && cb.checked; }); }
function hint() { $('hint').textContent = companies.length ? 'Firm: ' + selected().length + ' z ' + companies.length : ''; }

async function saveOpts() {
  const o = { purchase: $('purchase').checked, sales: $('sales').checked, report: $('report').checked, invoices: $('invoices').checked, format: $('format').value };
  await chrome.storage.local.set({ opts: o });
}

async function symfoniaTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && /^https:\/\/app\.symfonia\.pl\/earchive/.test(tab.url || '')) return tab;
  const tabs = await chrome.tabs.query({ url: 'https://app.symfonia.pl/earchive*' });
  return tabs[0] || null;
}

async function start() {
  const tab = await symfoniaTab();
  if (!tab) { $('hint').textContent = 'Najpierw otwórz Symfonię KSeF i zaloguj się.'; return; }
  const sel = selected();
  if (!sel.length) { $('hint').textContent = 'Zaznacz przynajmniej jedną firmę.'; return; }
  const opts = { month: $('month').value || prevMonth(), purchase: $('purchase').checked, sales: $('sales').checked, report: $('report').checked, invoices: $('invoices').checked, format: $('format').value };
  if (!opts.purchase && !opts.sales) { $('hint').textContent = 'Zaznacz zakupy lub sprzedaż.'; return; }
  if (!opts.report && !opts.invoices) { $('hint').textContent = 'Zaznacz raport XLS lub faktury.'; return; }
  const res = await chrome.runtime.sendMessage({ type: 'start', companies: sel, opts, tabId: tab.id });
  if (!res || !res.ok) $('hint').textContent = (res && res.error) || 'Nie udało się rozpocząć.';
  render();
}

async function render() {
  const { run } = await chrome.storage.local.get('run');
  const busy = run && (run.active || run.paused);
  ['setup', 'setup2', 'setup3', 'actions'].forEach((id) => { $(id).hidden = !!busy; });
  $('prog').hidden = !run;
  if (!run) return;
  const total = run.tasks.length, done = Math.min(run.idx, total);
  $('progTitle').textContent = run.paused ? 'Wstrzymane' : run.active ? 'Pobieranie – ' + monthLabel(run.month) : 'Zakończone – ' + monthLabel(run.month);
  $('progCount').textContent = done + ' / ' + total;
  $('bar').style.width = (total ? (done / total) * 100 : 0) + '%';
  $('stop').hidden = !run.active;
  $('resume').hidden = !run.paused;
  $('skip').hidden = !run.paused;
  $('newRun').hidden = !!busy;
  const log = $('log');
  log.textContent = '';
  run.log.slice(-60).forEach((l) => {
    const d = document.createElement('div');
    d.className = l.level;
    d.textContent = l.t + '  ' + l.text;
    log.appendChild(d);
  });
  log.scrollTop = log.scrollHeight;
}

(async function init() {
  const pm = prevMonth();
  $('month').value = pm;
  $('monthNote').textContent = 'domyślnie poprzedni: ' + monthLabel(pm);
  const { opts } = await chrome.storage.local.get('opts');
  if (opts) ['purchase', 'sales', 'report', 'invoices'].forEach((k) => { $(k).checked = !!opts[k]; });
  if (opts && opts.format) $('format').value = opts.format;
  ['purchase', 'sales', 'report', 'invoices', 'format'].forEach((k) => $(k).addEventListener('change', saveOpts));
  await loadCompanies();
  hint();
  // with a search typed in, these act only on the companies shown
  $('all').addEventListener('click', () => { visibleBoxes().forEach((x) => { x.checked = true; }); saveExcluded(); });
  $('none').addEventListener('click', () => { visibleBoxes().forEach((x) => { x.checked = false; }); saveExcluded(); });
  $('search').addEventListener('input', applySearch);
  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'stop' }); render(); });
  $('resume').addEventListener('click', async () => { const t = await symfoniaTab(); await chrome.runtime.sendMessage({ type: 'resume', tabId: t && t.id }); render(); });
  $('skip').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'skip' }); render(); });
  $('newRun').addEventListener('click', async () => { await chrome.storage.local.remove('run'); render(); });
  chrome.storage.onChanged.addListener((ch) => { if (ch.run) render(); if (ch.companies || ch.learned) loadCompanies().then(hint); });
  render();
})();
