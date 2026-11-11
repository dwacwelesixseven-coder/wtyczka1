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
    const normalize = value => (value || '').replace(/[\u200b-\u200f\ufeff\u00ad]/g, '').replace(/\s+/g, ' ').trim();
    const isExport = element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true' &&
      normalize(element.innerText || element.textContent) === 'Eksportuj';
    const hasTitle = element => /Eksport raportu do pliku\s*XLSX?\b/i.test(normalize(element.textContent));
    const dialogs = Array.from(doc.querySelectorAll('[data-test-element="modal"],[role="dialog"],[data-testid="modal"]'));
    for (const dialog of dialogs.reverse()) {
      if (!visible(dialog) || !hasTitle(dialog)) continue;
      const button = Array.from(dialog.querySelectorAll('button,[role="button"]')).find(isExport);
      if (button) return button;
    }
    // Some Symfonia modal variants have no dialog/test attributes, or use a
    // display:contents wrapper with no rectangle. Find the visible button
    // itself and verify its nearby container's XLS report title instead.
    for (const button of Array.from(doc.querySelectorAll('button,[role="button"]'))) {
      if (!isExport(button)) continue;
      let parent = button.parentElement;
      for (let depth = 0; parent && depth < 10; depth++, parent = parent.parentElement) {
        if (parent === doc.body || parent === doc.documentElement) break;
        if (hasTitle(parent)) return button;
      }
    }
    return null;
  }
  function diagnostics(doc = document) {
    const buttons = Array.from(doc.querySelectorAll('button,[role="button"]')).filter(element =>
      (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() === 'Eksportuj');
    return 'Eksportuj: ' + buttons.length + ', widoczne: ' + buttons.filter(visible).length +
      ', aktywne: ' + buttons.filter(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true').length + '.';
  }
  globalThis.KsefReport = { findExportButton, diagnostics };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefReport;
})();
