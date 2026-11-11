(function () {
  const visible = element => !!element && element.getClientRects().length > 0;
  function findControl(doc) {
    const label = Array.from(doc.querySelectorAll('span,p,label'))
      .find(element => visible(element) && /^Pokaż na stronie\s*:?$/.test(element.textContent.trim()));
    let parent = label?.parentElement;
    for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
      const controls = Array.from(parent.querySelectorAll('[role="combobox"]')).filter(visible);
      if (controls.length === 1) return controls[0];
      if (controls.length > 1) break;
    }
    return null;
  }
  async function ensure50({ document: doc = document, waitFor, waitForReload, allowMissing = false }) {
    const control = await waitFor(() => findControl(doc), 5000);
    if (!control) {
      if (allowMissing) return false;
      throw new Error('Nie znalazłem pola „Pokaż na stronie” przed pobieraniem PDF.');
    }
    if (control.textContent.trim() === '50') return false;
    if (control.getAttribute('aria-disabled') === 'true') throw new Error('Pole „Pokaż na stronie” jest nieaktywne.');
    control.scrollIntoView?.({ block: 'center' });
    control.click();
    const option = await waitFor(() => {
      const list = doc.getElementById(control.getAttribute('aria-controls'));
      if (!visible(list)) return null;
      return Array.from(list.querySelectorAll('[data-testid="dropdown-child"]'))
        .find(element => visible(element) && element.textContent.trim() === '50');
    }, 5000);
    if (!option) throw new Error('Nie znalazłem opcji 50 w polu „Pokaż na stronie”.');
    // DropdownListOption's container owns hover; its inner span owns click.
    const target = option.querySelector('span');
    if (!target) throw new Error('Nie znalazłem aktywnej opcji 50.');
    const mark = Date.now();
    target.click();
    if (!(await waitFor(() => findControl(doc)?.textContent.trim() === '50', 5000))) {
      throw new Error('Symfonia nie ustawiła liczby 50 na stronie.');
    }
    if (!(await waitForReload(mark))) throw new Error('Lista nie odświeżyła się po ustawieniu 50 faktur na stronie.');
    return true;
  }
  globalThis.KsefPageSize = { findControl, ensure50 };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefPageSize;
})();
