(function () {
  function visible(element) {
    if (!element || element.isConnected === false || !element.getClientRects().length) return false;
    if (typeof getComputedStyle === 'function') {
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
    }
    return true;
  }
  function findExportButton(doc = document) {
    const dialogs = Array.from(doc.querySelectorAll('[data-test-element="modal"],[role="dialog"],[data-testid="modal"]'));
    for (const dialog of dialogs.reverse()) {
      if (!visible(dialog) || !/Eksport raportu do pliku\s+XLSX?\b/i.test(dialog.textContent || '')) continue;
      const button = Array.from(dialog.querySelectorAll('button,[role="button"]')).find(element =>
        visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true' &&
        (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() === 'Eksportuj');
      if (button) return button;
    }
    return null;
  }
  globalThis.KsefReport = { findExportButton };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefReport;
})();
