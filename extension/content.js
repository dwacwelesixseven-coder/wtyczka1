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
  const selCounter = () => { const m = document.body.innerText.match(/\n\s*(\d+) z (\d+)\s*\n/); return m ? [+m[1], +m[2]] : null; };

  function headCheckbox() { return qs('[data-testid$="-head-selectExpandPin"] input[type=checkbox]'); }
  function rowsChecked() { return qsa('table[data-testid^="invoices-table-"] tbody input[type=checkbox]:checked').length; }
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

  async function setRange(from, to) {
    const fromIn = await waitFor(() => qs('[data-testid$="DateOfIssue-DateFrom"] input'), 30000);
    const toIn = qs('[data-testid$="DateOfIssue-DateTo"] input');
    if (!fromIn || !toIn) throw new Error('Nie znalazłem pól z datą wystawienia.');
    await sleep(1500); // let the default list load first
    const confirmed = () => KsefCalendar.rangeConfirmed(fromIn, toIn, from, to,
      invoiceEvents, location.pathname, byText('button', 'Zastosuj'));
    const existing = confirmed();
    if (existing) return existing;
    // When the new start is after the current end, set the end first (keeps the range valid).
    if (iso(from) > iso(toIn.value || '0000')) {
      await KsefCalendar.selectDate(toIn, to);
      await KsefCalendar.selectDate(fromIn, from);
    } else {
      await KsefCalendar.selectDate(fromIn, from);
      await KsefCalendar.selectDate(toIn, to);
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

  async function exportXls(label) {
    const ctl = await waitFor(() => qs('[data-testid$="-table-control"]'), 10000);
    if (!ctl) throw new Error('Nie znalazłem menu ⋮ listy.');
    ctl.click();
    const item = await waitFor(() => qs('[data-testid="invoices-export-xls"]'), 5000);
    if (!item) throw new Error('Nie znalazłem „Eksportuj listę XLS”.');
    await pace();
    item.click();
    const ok = await waitFor(() => byText('button', 'Eksportuj', qs('[data-testid="modal"]') || document), 8000);
    if (!ok) throw new Error('Nie pojawiło się okno eksportu.');
    const done = expectDownload(label, 90000);
    await pace();
    ok.click();
    const res = await done;
    if (!res || !res.ok) throw new Error('Eksport XLS się nie pobrał (' + ((res && res.error) || 'brak pliku') + ').');
    return res;
  }

  // The selection bar has icon-only buttons. On the sales list the same arrow icon is used
  // for "send to KSeF" and for "Pobierz", so the button is chosen ONLY by its tooltip text.
  function tooltipTexts() {
    return qsa('[role=tooltip],[data-testid*="ooltip"],[class*="ooltip"]').map((e) => e.innerText.trim()).filter(Boolean);
  }
  function hover(el, on) {
    const r = el.getBoundingClientRect();
    const types = on ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
    [el.parentElement, el].forEach((t) => types.forEach((ty) => t.dispatchEvent(new (ty.startsWith('pointer') ? PointerEvent : MouseEvent)(ty, { bubbles: !/enter|leave/.test(ty), clientX: r.x + 4, clientY: r.y + 4 }))));
  }
  async function findDownloadButton() {
    const candidates = qsa('button').filter((b) => !b.disabled && !b.closest('tbody') && b.querySelector('svg[data-icon]') && b.getAttribute('data-test-element') === 'utility-button');
    for (const b of candidates) {
      // start from a clean state so an old tooltip cannot be mistaken for this button's
      if (!(await waitFor(() => tooltipTexts().length === 0, 1500, 100))) continue;
      hover(b, true);
      const tips = (await waitFor(() => { const t = tooltipTexts(); return t.length ? t : null; }, 1200, 100)) || [];
      hover(b, false);
      await waitFor(() => tooltipTexts().length === 0, 1500, 100);
      if (tips.some((t) => /ksef|wysł|wysl|wyśl/i.test(t))) continue;
      if (tips.length && tips.every((t) => t === 'Pobierz')) return b;
    }
    return null;
  }

  async function downloadPage(format, label) {
    const head = headCheckbox();
    if (!head) throw new Error('Nie znalazłem pola „zaznacz wszystkie”.');
    if (!head.checked) realClick(head.parentElement);
    const sel = await waitFor(() => { const c = selCounter(); return c && c[0] > 0 && c[0] === c[1] ? c : null; }, 8000);
    if (!sel) throw new Error('Nie udało się zaznaczyć wszystkich faktur na stronie.');
    await pace();
    const pub = await findDownloadButton();
    if (!pub) throw new Error('Nie znalazłem przycisku „Pobierz” (sprawdzam po podpisie, żeby nie kliknąć „Wyślij do KSeF”).');
    pub.click();
    const tid = format === 'XML' ? 'downloadInvoiceXMLMultipleAction' : 'downloadInvoicePDFMultipleAction';
    const opt = await waitFor(() => qs('[data-testid="' + tid + '"]'), 5000);
    if (!opt) throw new Error('Nie pojawiło się menu „Pobierz fakturę (' + format + ')”.');
    const done = expectDownload(label, 180000);
    await pace();
    opt.click();
    const res = await done;
    // leave the page as it was: clear the selection
    const h2 = headCheckbox();
    if (h2 && h2.checked) { realClick(h2.parentElement); await sleep(400); }
    if (!res || !res.ok) throw new Error('Faktury (' + format + ') się nie pobrały (' + ((res && res.error) || 'brak pliku') + ').');
    return sel[0];
  }

  async function runTask(task) {
    const kindLabel = task.kind === 'purchase' ? 'Zakupowe' : 'Sprzedazowe';
    const result = { reportOk: false, invoices: 0, zips: 0, empty: false };
    const ev = await setRange(task.from, task.to);
    await pace();
    await waitFor(() => emptyList() || qs('table[data-testid^="invoices-table-"] tbody tr input[type=checkbox]'), 15000);
    if ((ev && ev.count === 0) || emptyList()) {
      result.empty = true;
      return result;
    }
    if (task.report) {
      await exportXls('report');
      result.reportOk = true;
      await pace();
    }
    if (task.formats && task.formats.length) {
      // "Pobierz" takes at most one page (up to 50 invoices), so go through every page with "›".
      const firstRow = () => ((qs('table[data-testid^="invoices-table-"] tbody tr') || {}).innerText || '').trim();
      for (let n = 1; n <= 100; n++) {
        for (const f of task.formats) {
          const count = await downloadPage(f, 'zip|' + f + '|' + n);
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
