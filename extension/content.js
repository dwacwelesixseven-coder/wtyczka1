// Works on one invoice list page at a time (purchase or sales of one company),
// doing what a person does by hand: set the issue-date range, export the list
// to XLS, then on every page select all invoices and click "Pobierz".
// It never clicks "Pobierz z KSeF" (that would use up package operations).
(function () {
  if (window.__ksefContent) return;
  window.__ksefContent = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pace = () => sleep(900 + Math.random() * 900); // human-like pause between steps
  const qs = (s, root) => (root || document).querySelector(s);
  const qsa = (s, root) => Array.from((root || document).querySelectorAll(s));
  const byText = (sel, text, root) => qsa(sel, root).find((e) => e.innerText && e.innerText.trim() === text);

  // ---- messages from hook.js (page world) ----
  const invoiceEvents = [];
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !m || !m.__ksef) return;
    if (m.type === 'companies') chrome.runtime.sendMessage({ type: 'companies', companies: m.data });
    if (m.type === 'invoices' && m.data.path === location.pathname) {
      invoiceEvents.push(Object.assign({ at: Date.now() }, m.data));
      if (invoiceEvents.length > 60) invoiceEvents.splice(0, invoiceEvents.length - 60);
    }
  });
  window.postMessage({ __ksefSnapshotRequest: true }, location.origin);

  // Learn the company of the page we are on, in case the company list was not captured.
  function learnCompany() {
    const m = location.pathname.match(/\/earchive\/([0-9a-f-]{36})\/company\/([0-9a-f-]{36})\//);
    if (!m) return;
    const combo = qsa('[role=combobox]').map((c) => c.innerText.trim()).find((t) => /^\d{10} - /.test(t));
    if (!combo) return;
    const nip = combo.slice(0, 10), name = combo.slice(13).trim();
    chrome.runtime.sendMessage({ type: 'learnCompany', company: { id: m[2], tenantId: m[1], nip, name } });
  }

  async function waitFor(fn, timeout, step) {
    const end = Date.now() + (timeout || 20000);
    while (Date.now() < end) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await sleep(step || 250);
    }
    return null;
  }

  function realClick(el) {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    [['pointerdown', PointerEvent], ['mousedown', MouseEvent], ['pointerup', PointerEvent], ['mouseup', MouseEvent], ['click', MouseEvent]]
      .forEach(([t, T]) => el.dispatchEvent(new T(t, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, o))));
  }

  const iso = (d) => d.split('-').reverse().join('-'); // dd-mm-yyyy -> yyyy-mm-dd

  function headCheckbox() { return qs('[data-testid$="-head-selectExpandPin"] input[type=checkbox]'); }
  function pagination() { return qs('[data-test-element="pagination"]'); }
  function nextPageButton() {
    const p = pagination();
    const icon = p && qs('svg[data-icon="chevronRight"]', p);
    return icon && icon.closest('button');
  }
  const emptyList = () => /Brak wyników/.test((qs('table[data-testid^="invoices-table-"] tbody') || {}).innerText || '');

  async function expectDownload(name, timeout) {
    return chrome.runtime.sendMessage({ type: 'expectDownload', name, timeout: timeout || 120000 });
  }

  async function setRange(from, to, taskId) {
    const fromIn = () => qs('[data-testid$="DateOfIssue-DateFrom"] input');
    const toIn = () => qs('[data-testid$="DateOfIssue-DateTo"] input');
    if (!(await waitFor(() => fromIn() && toIn(), 30000))) throw new Error('Nie znalazłem pól z datą wystawienia.');
    await sleep(1500); // let the default list load first
    const confirmed = () => KsefCalendar.rangeConfirmed(fromIn(), toIn(), from, to,
      invoiceEvents, location.pathname, byText('button', 'Zastosuj'));
    const existing = confirmed();
    if (existing) return existing;
    const calendarOptions = fieldName => ({ fieldName, onRetry: attempt => chrome.runtime.sendMessage({
      type: 'progress', taskId, text: 'Ponowne otwieranie kalendarza „' + fieldName + '” (' + attempt + '/3)…'
    }) });
    // When the new start is after the current end, set the end first (keeps the range valid).
    if (iso(from) > iso(toIn()?.value || '0000')) {
      await KsefCalendar.selectDate(toIn, to, calendarOptions('do'));
      await KsefCalendar.selectDate(fromIn, from, calendarOptions('od'));
    } else {
      await KsefCalendar.selectDate(fromIn, from, calendarOptions('od'));
      await KsefCalendar.selectDate(toIn, to, calendarOptions('do'));
    }
    await pace();
    const apply = byText('button', 'Zastosuj');
    if (apply && !apply.disabled) apply.click();
    window.postMessage({ __ksefSnapshotRequest: true }, location.origin);
    const ev = await waitFor(confirmed, 30000);
    if (!ev) {
      throw new Error('Nie udało się potwierdzić zakresu dat ' + from + ' – ' + to + '. Odśwież stronę Symfonii i spróbuj ponownie.');
    }
    return ev;
  }

  async function exportXls(label, taskId) {
    const exportButton = () => KsefReport.findExportButton();
    if (!exportButton()) {
      const ctl = await waitFor(() => qs('[data-testid$="-table-control"]'), 10000);
      if (!ctl) throw new Error('Nie znalazłem menu ⋮ listy.');
      ctl.click();
      const item = await waitFor(() => qs('[data-testid="invoices-export-xls"]'), 5000);
      if (!item) throw new Error('Nie znalazłem „Eksportuj listę XLS”.');
      await pace();
      item.click();
    }
    await chrome.runtime.sendMessage({ type: 'progress', taskId, text: 'Oczekiwanie na aktywny przycisk Eksportuj w oknie XLS…' });
    if (!(await waitFor(exportButton, 25000))) throw new Error('Nie znalazłem aktywnego przycisku „Eksportuj” w oknie XLS (25 s). ' + KsefReport.diagnostics());
    await pace();
    // The modal can be re-rendered while the report is prepared.
    const ok = await waitFor(exportButton, 5000);
    if (!ok) throw new Error('Okno raportu XLS zostało zamknięte lub przycisk „Eksportuj” jest nieaktywny.');
    const done = expectDownload(label, 90000);
    await sleep(200); // allow the worker to register the expected download
    await chrome.runtime.sendMessage({ type: 'progress', taskId, text: 'Eksportowanie raportu XLS…' });
    ok.click();
    const res = await done;
    if (!res || !res.ok) throw new Error('Eksport XLS się nie pobrał (' + ((res && res.error) || 'brak pliku') + ').');
    return res;
  }

  async function downloadPage(format, label, taskId) {
    const progress = text => chrome.runtime.sendMessage({ type: 'progress', taskId, text });
    await progress('Zaznaczanie faktur na stronie…');
    const head = headCheckbox();
    if (!head) throw new Error('Nie znalazłem pola „zaznacz wszystkie”.');
    if (!head.checked) realClick(head.parentElement);
    const count = await waitFor(() => KsefDownload.selectedCount(), 8000);
    if (!count) throw new Error('Nie udało się zaznaczyć wszystkich faktur na stronie.');
    await pace();
    await progress('Otwieranie menu Pobierz (' + format + ')…');
    const opt = await KsefDownload.openMenu(format, { waitFor,
      onRetry: attempt => progress('Ponowne otwieranie menu Pobierz (' + format + ', próba ' + attempt + '/3)…')
    });
    const done = expectDownload(label, 180000);
    await pace();
    await progress('Oczekiwanie na plik ZIP z fakturami ' + format + '…');
    opt.click();
    const res = await done;
    // leave the page as it was: clear the selection
    const h2 = headCheckbox();
    if (h2 && h2.checked) { realClick(h2.parentElement); await sleep(400); }
    if (!res || !res.ok) throw new Error('Faktury (' + format + ') się nie pobrały (' + ((res && res.error) || 'brak pliku') + ').');
    return count;
  }

  async function runTask(task) {
    const kindLabel = task.kind === 'purchase' ? 'Zakupowe' : 'Sprzedazowe';
    const result = { reportOk: false, invoices: 0, zips: 0, empty: false };
    const ev = await setRange(task.from, task.to, task.id);
    await pace();
    await waitFor(() => emptyList() || qs('table[data-testid^="invoices-table-"] tbody tr input[type=checkbox]'), 15000);
    if ((ev && ev.count === 0) || emptyList()) {
      result.empty = true;
      return result;
    }
    if (task.report) {
      await exportXls('report', task.id);
      result.reportOk = true;
      await pace();
    }
    if (task.formats && task.formats.length) {
      if (task.formats.includes('PDF')) {
        await chrome.runtime.sendMessage({ type: 'progress', taskId: task.id, text: 'Ustawianie „Pokaż na stronie” na 50 dla PDF…' });
        await KsefPageSize.ensure50({
          waitFor,
          allowMissing: !!ev && typeof ev.count === 'number' && ev.count <= 50,
          waitForReload: mark => waitFor(() => invoiceEvents.find(event => event.at >= mark &&
            event.path === location.pathname && event.take === 50 && event.skip === 0 &&
            KsefCalendar.normalizeDate(event.from) === iso(task.from) &&
            KsefCalendar.normalizeDate(event.to) === iso(task.to)), 30000)
        });
        await pace();
      }
      // "Pobierz" takes at most one page (up to 50 invoices), so go through every page with "›".
      const firstRow = () => ((qs('table[data-testid^="invoices-table-"] tbody tr') || {}).innerText || '').trim();
      for (let n = 1; n <= 100; n++) {
        for (const f of task.formats) {
          const count = await downloadPage(f, 'zip|' + f + '|' + n, task.id);
          if (f === task.formats[0]) result.invoices += count;
          result.zips++;
          await pace();
        }
        const next = nextPageButton();
        if (!next || next.disabled) break;
        const before = firstRow();
        next.click();
        const changed = await waitFor(() => firstRow() && firstRow() !== before, 20000);
        if (!changed) throw new Error('Nie udało się przejść na stronę ' + (n + 1) + ' listy.');
        await sleep(1500);
      }
    }
    if (ev && typeof ev.count === 'number') {
      result.expected = ev.count;
      if (task.formats && task.formats.length && result.invoices !== ev.count) {
        throw new Error('Pobrano ' + result.invoices + ' faktur, a lista podaje ' + ev.count + '. Sprawdź tę firmę ręcznie.');
      }
    }
    return result;
  }

  async function main() {
    learnCompany();
    const onDocs = /\/company\/[0-9a-f-]{36}\/documents\/(purchase|sales)/.test(location.pathname);
    if (!onDocs) return;
    const task = await chrome.runtime.sendMessage({ type: 'getTask', url: location.href });
    if (!task) return;
    let result;
    try { result = await runTask(task); result.ok = true; }
    catch (e) { result = { ok: false, error: e.message || String(e) }; }
    chrome.runtime.sendMessage({ type: 'taskDone', taskId: task.id, result });
  }

  // The app is a single-page app: run again when its address changes.
  let last = '';
  setInterval(() => { if (location.href !== last) { last = location.href; setTimeout(main, 1200); } }, 700);
})();
