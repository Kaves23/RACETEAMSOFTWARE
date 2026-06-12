/* fin-rollup-widget.js — shared client widget for cross-module cost roll-up panels.
 * Exposes window.RTSRollup with renderEvent/renderProject/renderDriver helpers.
 * Each fetches /api/fin-rollup/<type>/<id> and renders a compact cost card into a container.
 */
(function () {
  'use strict';

  function sym() { return (window.curr && window.curr()) || 'R'; }
  function money(n) {
    const v = Number(n) || 0;
    return sym() + v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function fetchRollup(kind, id) {
    if (!id) return null;
    const endpoint = `/fin-rollup/${kind}/${encodeURIComponent(id)}`;
    try {
      if (window.RTS_API && typeof RTS_API.request === 'function') {
        return await RTS_API.request(endpoint);
      }
      // Fallback: direct fetch (pages where RTS_API lacks a generic request)
      const base = (window.RTS_CONFIG && window.RTS_CONFIG.api && window.RTS_CONFIG.api.baseURL) || '/api';
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${base}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Roll-up fetch failed', kind, id, e);
      return null;
    }
  }

  // Build a compact stat row
  function stat(label, value, opts) {
    opts = opts || {};
    const color = opts.color ? `color:${opts.color};` : '';
    const strong = opts.strong ? 'font-weight:700;' : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f0f1f3;font-size:0.82rem;">
      <span style="color:#6b7280;">${esc(label)}</span>
      <span style="${color}${strong}">${esc(value)}</span>
    </div>`;
  }

  function card(title, inner) {
    return `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#fff;">
      <div style="font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${esc(title)}</div>
      ${inner}
    </div>`;
  }

  function setBusy(el) {
    el.innerHTML = `<div style="color:#9ca3af;font-size:0.82rem;padding:8px 0;">Loading cost summary…</div>`;
  }
  function setEmpty(el, msg) {
    el.innerHTML = `<div style="color:#9ca3af;font-size:0.82rem;padding:8px 0;">${esc(msg || 'No cost data available.')}</div>`;
  }

  async function renderEvent(container, eventId) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    setBusy(el);
    const d = await fetchRollup('event', eventId);
    if (!d || !d.success) { setEmpty(el); return; }
    const remainColor = d.budget_remaining < 0 ? '#dc2626' : '#16a34a';
    const netColor = d.net_position < 0 ? '#dc2626' : '#16a34a';
    el.innerHTML = card('Event Cost Summary',
      stat('Budget', money(d.budget.total)) +
      stat('Payments', money(d.payments.total)) +
      stat('Expenses', money(d.expenses.total)) +
      stat(`Fuel (${(d.fuel.litres || 0).toLocaleString('en-ZA')} L @ ${money(d.fuel.price_per_litre)})`, money(d.fuel.cost)) +
      stat('Total Cost', money(d.total_cost), { strong: true }) +
      (d.invoices.count ? stat(`Revenue (${d.invoices.count} invoice${d.invoices.count !== 1 ? 's' : ''})`, money(d.revenue), { color: '#16a34a' }) : '') +
      (d.invoices.count ? stat('Net Position', money(d.net_position), { strong: true, color: netColor }) : '') +
      stat('Budget Remaining', money(d.budget_remaining), { strong: true, color: remainColor })
    );
  }

  async function renderProject(container, projectId) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    setBusy(el);
    const d = await fetchRollup('project', projectId);
    if (!d || !d.success) { setEmpty(el); return; }
    const remainColor = d.budget_remaining < 0 ? '#dc2626' : '#16a34a';
    el.innerHTML = card('Project Cost Summary',
      stat('Budget', money(d.budget)) +
      stat(`Tasks (${d.tasks.count})`, '') +
      stat('Estimated Cost', money(d.tasks.estimated_cost)) +
      stat('Actual Cost', money(d.tasks.actual_cost), { strong: true }) +
      (d.event_id ? stat('Linked Event Spend', money(d.event_spend)) : '') +
      stat('Total Cost', money(d.total_cost), { strong: true }) +
      stat('Budget Remaining', money(d.budget_remaining), { strong: true, color: remainColor })
    );
  }

  async function renderDriver(container, driverId) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    setBusy(el);
    const d = await fetchRollup('driver', driverId);
    if (!d || !d.success) { setEmpty(el); return; }
    el.innerHTML = card('Driver Cost / Billing Summary',
      stat(`Contracts (${d.contracts.count})`, money(d.contracts.value)) +
      stat('Driver Expenses', money(d.expenses.total)) +
      stat('Total Cost', money(d.total_cost), { strong: true }) +
      stat('Package Billing', money(d.packages.invoice_value), { color: '#16a34a' }) +
      (d.invoices.count ? stat(`Invoices (${d.invoices.count})`, money(d.invoices.gross), { color: '#16a34a' }) : '') +
      stat('Total Billable', money(d.total_billable), { strong: true, color: '#16a34a' })
    );
  }

  window.RTSRollup = { renderEvent, renderProject, renderDriver, fetchRollup, money };
})();
