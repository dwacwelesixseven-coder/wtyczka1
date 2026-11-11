(function () {
  const visible = element => !!element && element.getClientRects().length > 0;
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
      .find(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
    // A menu may already be open; clicking its trigger again would close it.
    if (option()) return option();
    const action = await waitFor(() => Array.from(doc.querySelectorAll('[data-testid="downloadInvoiceMultipleAction"]'))
      .find(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true'), 10000);
    if (!action) throw new Error('Nie znalazłem aktywnej ikony „Pobierz” dla zaznaczonych faktur.');
    // This element is an icon span in Symfonia, not a <button>. Do not identify
    // it by the publish arrow shared with the separate send-to-KSeF action.
    action.click();
    const item = await waitFor(option, 5000);
    if (!item) throw new Error('Nie otworzyło się menu „Pobierz fakturę (' + format + ')”.');
    return item;
  }
  globalThis.KsefDownload = { selectedCount, openMenu };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefDownload;
})();
