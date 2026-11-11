// Runs in the page before Symfonia's own scripts. It only READS two kinds of
// responses the page already receives (the company list and invoice-list
// results) and passes a summary to content.js. It never touches request
// headers, tokens or anything the page sends.
(function () {
  if (window.__ksefHook) return;
  window.__ksefHook = true;
  const post = (type, data) => window.postMessage({ __ksef: true, type, data }, location.origin);
  const origFetch = window.fetch;
  let latestInvoices = null;
  // The initial list may load before the isolated content script is ready.
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.__ksefSnapshotRequest &&
        latestInvoices?.path === location.pathname) post('invoices', latestInvoices);
  });

  function opName(init) {
    try { return JSON.parse(init && init.body).operationName || null; } catch (e) { return null; }
  }

  function inspect(op, json, path) {
    const d = json && json.data;
    if (!d) return;
    if (d.UserTenantsList) {
      const out = [];
      (d.UserTenantsList.UserTenants || []).forEach((t) => {
        (t.Companies || []).forEach((c) => out.push({
          id: c.Id, tenantId: c.TenantId || (t.Tenant && t.Tenant.Id), name: c.Name,
          nip: c.Identifier, main: !!c.IsMainCompany, demo: !!c.IsDemo
        }));
      });
      if (out.length) post('companies', out);
    }
    if (d.GetInvoices && d.GetInvoices.DateRange) {
      const items = d.GetInvoices.Items || [];
      latestInvoices = {
        op,
        path,
        from: d.GetInvoices.DateRange.DateFrom,
        to: d.GetInvoices.DateRange.DateTo,
        count: d.GetInvoices.FilteredCount,
        pageItems: items.length,
        bound: items[0] ? items[0].InvoiceBound : null
      };
      post('invoices', latestInvoices);
    }
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const path = location.pathname;
    const p = origFetch.apply(this, arguments);
    if (/\/graphql/.test(url)) {
      const op = opName(init);
      if (!op || /UserTenantsList|GetInvoices$/.test(op)) {
        p.then((res) => res.clone().json().then((j) => inspect(op, j, path)).catch(() => {})).catch(() => {});
      }
    }
    return p;
  };
})();
