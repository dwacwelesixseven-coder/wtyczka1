// Use the public DOM of Symfonia's InputDate calendar; never write masked input values.
(function () {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function parseDate(value) {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '');
    if (!match) return null;
    const [, day, month, year] = match.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function normalizeDate(value) {
    if (typeof value !== 'string') return '';
    const iso = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value);
    if (iso) return iso[1];
    return parseDate(value) ? value.split('-').reverse().join('-') : '';
  }
  function monthOfCalendar(calendar) {
    // CalendarCore writes Date.toLocaleDateString() into each day's data-date.
    // Decode it using the same locale rather than assuming DD/MM or MM/DD.
    const middle = Array.from(calendar.querySelectorAll('[data-date]'));
    const value = middle[Math.floor(middle.length / 2)]?.getAttribute('data-date');
    if (!value) throw new Error('Nie udało się odczytać miesiąca kalendarza.');
    const types = new Intl.DateTimeFormat().formatToParts(new Date(2006, 10, 22))
      .filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => part.type);
    const digits = value.match(/\d+/g)?.map(Number);
    if (!digits || digits.length !== types.length) throw new Error('Nieobsługiwany format kalendarza: ' + value);
    const fields = Object.fromEntries(types.map((type, index) => [type, digits[index]]));
    return fields.year * 12 + fields.month - 1;
  }
  async function selectDate(field, value, options = {}) {
    const doc = options.document || document;
    const sleep = options.sleep || pause;
    const target = parseDate(value);
    if (!target) throw new Error('Nieprawidłowa data: ' + value);
    const wrapper = field.closest('[data-test-element="input-date"]') || field.closest('[data-testid]');
    const icon = wrapper?.querySelector('[data-icon="calendarToday"]');
    if (!icon) throw new Error('Nie znalazłem ikony kalendarza daty wystawienia.');
    icon.closest('[data-test-element="icon"]').click();
    const activeCalendar = () => Array.from(doc.querySelectorAll('[data-test-element="input-date-calendar"]'))
      .find(element => element.getClientRects().length > 0);
    async function waitFor(fn) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const result = fn();
        if (result) return result;
        await sleep(100);
      }
      return null;
    }
    let calendar = await waitFor(activeCalendar);
    if (!calendar) throw new Error('Nie otworzył się kalendarz daty wystawienia.');
    const desiredMonth = target.getFullYear() * 12 + target.getMonth();
    for (let step = 0; step < 240; step++) {
      calendar = activeCalendar();
      if (!calendar) throw new Error('Kalendarz został zamknięty przed wyborem daty.');
      const currentMonth = monthOfCalendar(calendar);
      if (currentMonth === desiredMonth) {
        const day = Array.from(calendar.querySelectorAll('[data-date]'))
          .find(element => element.getAttribute('data-date') === target.toLocaleDateString());
        if (!day) throw new Error('Nie znalazłem dnia ' + value + ' w kalendarzu.');
        day.click();
        if (!(await waitFor(() => !activeCalendar() && field.value === value))) {
          throw new Error('Symfonia nie zatwierdziła daty ' + value + ' wybranej z kalendarza.');
        }
        return;
      }
      const direction = currentMonth > desiredMonth ? 'keyboardArrowLeft' : 'keyboardArrowRight';
      const arrow = calendar.querySelector('[data-icon="' + direction + '"]')?.closest('button');
      if (!arrow || arrow.disabled) throw new Error('Nie można przejść do miesiąca dla daty ' + value + '.');
      arrow.click();
      if (!(await waitFor(() => { const c = activeCalendar(); return c && monthOfCalendar(c) !== currentMonth; }))) {
        throw new Error('Kalendarz nie zmienił miesiąca.');
      }
    }
    throw new Error('Wybrana data jest zbyt daleko od bieżącego miesiąca kalendarza.');
  }
  function rangeConfirmed(fromField, toField, from, to, events, path, apply) {
    if (fromField.value !== from || toField.value !== to || (apply && !apply.disabled)) return null;
    if ([fromField, toField].some(field => field.getAttribute('aria-invalid') === 'true' ||
      field.closest('[data-test-element="input-date"]')?.querySelector('[class*="color-error"]'))) return null;
    return [...events].reverse().find(event => event.path === path &&
      normalizeDate(event.from) === normalizeDate(from) && normalizeDate(event.to) === normalizeDate(to)) || null;
  }
  globalThis.KsefCalendar = { parseDate, normalizeDate, monthOfCalendar, selectDate, rangeConfirmed };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KsefCalendar;
})();
