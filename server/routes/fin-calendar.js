// routes/fin-calendar.js
// Unified finance due-date feed: aggregates upcoming financial dates from
// invoices, bills (expenses), budget lines, event deadlines and driver
// contracts into a single list the calendar and checklist can consume.
// Each source is queried independently and failures are swallowed so a
// missing column/table (e.g. before a migration is applied) never breaks the
// whole feed.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

function pushRows(out, rows) { for (const r of rows) out.push(r); }

// GET /api/fin-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const out = [];

    // Helper to apply optional date-window filtering in SQL
    const range = (col, p) => {
      const c = [];
      if (from) { p.push(from); c.push(`${col} >= $${p.length}`); }
      if (to)   { p.push(to);   c.push(`${col} <= $${p.length}`); }
      return c.length ? ' AND ' + c.join(' AND ') : '';
    };

    // 1) Invoices due (receivable)
    try {
      const p = [];
      const r = await pool.query(
        `SELECT id, number, due_date, status, currency, event_id
         FROM fin_invoices
         WHERE due_date IS NOT NULL${range('due_date', p)}`, p);
      pushRows(out, r.rows.map(x => ({
        id: 'inv-' + x.id, source: 'invoice', type: 'invoice_due',
        date: String(x.due_date).slice(0, 10),
        title: 'Invoice ' + (x.number || x.id),
        subtitle: 'Receivable', amount: null, currency: x.currency || 'ZAR',
        status: x.status || 'Draft', event_id: x.event_id || null,
        link: 'invoice.html?select=' + x.id, direction: 'in'
      })));
    } catch (_e) { /* source unavailable */ }

    // 2) Bills due (payable — from expenses)
    try {
      const p = [];
      const r = await pool.query(
        `SELECT id, supplier, description, amount, currency, due_date, status, event_id
         FROM expenses
         WHERE due_date IS NOT NULL${range('due_date', p)}`, p);
      pushRows(out, r.rows.map(x => ({
        id: 'bill-' + x.id, source: 'bill', type: 'bill_due',
        date: String(x.due_date).slice(0, 10),
        title: x.supplier || x.description || 'Bill',
        subtitle: 'Payable', amount: Number(x.amount) || 0, currency: x.currency || 'ZAR',
        status: x.status || 'Pending', event_id: x.event_id || null,
        link: 'expenses.html?select=' + x.id, direction: 'out'
      })));
    } catch (_e) { /* source unavailable */ }

    // 3) Budget lines due
    try {
      const p = [];
      const r = await pool.query(
        `SELECT id, name, category, budgeted_amount, currency, due_date, status, event_id, project_id
         FROM fin_budget_lines
         WHERE due_date IS NOT NULL${range('due_date', p)}`, p);
      pushRows(out, r.rows.map(x => ({
        id: 'bl-' + x.id, source: 'budget_line', type: 'budget_line_due',
        date: String(x.due_date).slice(0, 10),
        title: x.name || 'Budget line',
        subtitle: x.category || 'Budget', amount: Number(x.budgeted_amount) || 0,
        currency: x.currency || 'ZAR', status: x.status || 'open',
        event_id: x.event_id || null, project_id: x.project_id || null,
        link: x.event_id ? ('events.html?select=' + x.event_id) : 'project-management.html', direction: 'out'
      })));
    } catch (_e) { /* source unavailable */ }

    // 4) Event deadlines (payment + entry)
    try {
      const p = [];
      const r = await pool.query(
        `SELECT id, name, payment_deadline, entry_deadline, entry_fee, budget_currency
         FROM events
         WHERE payment_deadline IS NOT NULL OR entry_deadline IS NOT NULL`, p);
      for (const x of r.rows) {
        const cur = x.budget_currency || 'ZAR';
        if (x.payment_deadline && (!from || String(x.payment_deadline).slice(0,10) >= from) && (!to || String(x.payment_deadline).slice(0,10) <= to)) {
          out.push({ id: 'evpay-' + x.id, source: 'event', type: 'event_payment',
            date: String(x.payment_deadline).slice(0, 10), title: (x.name || 'Event') + ' — payment due',
            subtitle: 'Event payment', amount: Number(x.entry_fee) || 0, currency: cur,
            status: '', event_id: x.id, link: 'events.html?select=' + x.id, direction: 'out' });
        }
        if (x.entry_deadline && (!from || String(x.entry_deadline).slice(0,10) >= from) && (!to || String(x.entry_deadline).slice(0,10) <= to)) {
          out.push({ id: 'eventry-' + x.id, source: 'event', type: 'event_entry',
            date: String(x.entry_deadline).slice(0, 10), title: (x.name || 'Event') + ' — entry deadline',
            subtitle: 'Event entry', amount: Number(x.entry_fee) || 0, currency: cur,
            status: '', event_id: x.id, link: 'events.html?select=' + x.id, direction: 'out' });
        }
      }
    } catch (_e) { /* source unavailable */ }

    // 5) Driver contract end dates (renewal/option windows)
    try {
      const p = [];
      const r = await pool.query(
        `SELECT id, driver_name, end_date, value, currency, status
         FROM driver_contracts
         WHERE end_date IS NOT NULL${range('end_date', p)}`, p);
      pushRows(out, r.rows.map(x => ({
        id: 'contract-' + x.id, source: 'contract', type: 'contract_end',
        date: String(x.end_date).slice(0, 10),
        title: (x.driver_name || 'Driver') + ' — contract end',
        subtitle: 'Contract', amount: Number(x.value) || 0, currency: x.currency || 'GBP',
        status: x.status || '', driver_id: x.driver_id || null,
        link: 'driver-contracts.html', direction: 'out'
      })));
    } catch (_e) { /* source unavailable */ }

    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    res.json({ success: true, data: out });
  } catch (e) { next(e); }
});

module.exports = router;
