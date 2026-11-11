(function () {
  const visible = element => {
    if (!element || element.isConnected === false || !element.getClientRects().length) return false;
    if (typeof getComputedStyle === 'function') {
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
    }
    return true;
  };
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
    const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    if (!['PDF', 'XML'].includes(format)) throw new Error('Nieobsługiwany format faktur.');
    if (!waitFor) throw new Error('Brak obsługi oczekiwania na menu pobierania.');
    const optionId = format === 'XML' ? 'downloadInvoiceXMLMultipleAction' : 'downloadInvoicePDFMultipleAction';
    const option = () => Array.from(doc.querySelectorAll('[data-testid="' + optionId + '"]'))
      .filter(enabled).map(clickTarget).find(enabled);
    // A menu may already be open; clicking its trigger again would close it.
    if (option()) return option();
    const findAction = () => Array.from(doc.querySelectorAll('[data-testid="downloadInvoiceMultipleAction"]'))
      .filter(enabled).map(clickTarget).find(enabled);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const existing = option();
      if (existing) return existing;
      if (!(await waitFor(findAction, 10000))) throw new Error('Nie znalazłem aktywnej ikony „Pobierz” dla zaznaczonych faktur.');
      // Re-read after awaiting: changing selection or receiving a list refresh
      // may have replaced the action returned by waitFor.
      const action = findAction();
      if (action) {
        action.scrollIntoView?.({ block: 'center' });
        // Only the download action, never the shared send-to-KSeF arrow.
        action.click();
        const item = await waitFor(option, 10000);
        if (item) return item;
      }
      // If the menu is open but this format is missing, don't toggle it closed.
      const anyItem = Array.from(doc.querySelectorAll('[data-testid="downloadInvoicePDFMultipleAction"],[data-testid="downloadInvoiceXMLMultipleAction"]')).some(enabled);
      if (anyItem) throw new Error('Menu „Pobierz” jest otwarte, ale opcja ' + format + ' jest nieaktywna lub niedostępna.');
      if (attempt < 3) {
        await options.onRetry?.(attempt + 1);
        await sleep(500);
      }
    }
    const actionCount = Array.from(doc.querySelectorAll('[data-testid="downloadInvoiceMultipleAction"]')).filter(visible).length;
    throw new Error('Nie otworzyło się menu „Pobierz fakturę (' + format + ')” po 3 próbach. Widoczne akcje Pobierz: ' + actionCount + '.');
  }
  globalThis.KsefDownload = { selectedCount, openMenu };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefDownload;
})();
