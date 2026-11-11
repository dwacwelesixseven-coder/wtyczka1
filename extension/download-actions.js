(function () {
  const visible = element => !!element && element.getClientRects().length > 0;
  function clickTarget(element) {
    if (element.matches?.('button,[role="button"],a,input[type="button"]')) return element;
    // TableGroupAction places its test ID on a wrapper DIV. Its nested
    // ButtonUtility owns onClick. A click on the DIV never reaches that child.
    return element.querySelector?.('button,[role="button"]') || element;
  }
  const enabled = element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  function selectedCount(doc = document) {
    const rows = Array.from(doc.querySelectorAll('table[data-testid^="invoices-table-"] tbody input[type="checkbox"]'))
      .filter(input => !input.disabled && visible(input.closest('tr') || input));
    return rows.length > 0 && rows.every(input => input.checked) ? rows.length : 0;
  }
  async function openMenu(format, options = {}) {
    const doc = options.document || document;
    const waitFor = options.waitFor;
    if (!['PDF', 'XML'].includes(format)) throw new Error('Nieobsługiwany format faktur.');
    if (!waitFor) throw new Error('Brak obsługi oczekiwania na menu pobierania.');
    const optionId = format === 'XML' ? 'downloadInvoiceXMLMultipleAction' : 'downloadInvoicePDFMultipleAction';
    const option = () => Array.from(doc.querySelectorAll('[data-testid="' + optionId + '"]'))
      .filter(enabled).map(clickTarget).find(enabled);
    // A menu may already be open; clicking its trigger again would close it.
    if (option()) return option();
    const action = await waitFor(() => Array.from(doc.querySelectorAll('[data-testid="downloadInvoiceMultipleAction"]'))
      .filter(enabled).map(clickTarget).find(enabled), 10000);
    if (!action) throw new Error('Nie znalazłem aktywnej ikony „Pobierz” dla zaznaczonych faktur.');
    // Support both TableGroupAction's nested button and legacy icon spans.
    // Never identify it by the arrow shared with the send-to-KSeF action.
    action.click();
    const item = await waitFor(option, 5000);
    if (!item) throw new Error('Nie otworzyło się menu „Pobierz fakturę (' + format + ')”.');
    return item;
  }
  globalThis.KsefDownload = { selectedCount, openMenu };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefDownload;
})();
