// routes/fin-forecast.js — Forward projection from budgets, recurring costs, planned events.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const num = (v) => (v == null || v === '') ? 0 : (Number(v) || 0);

// GET /api/fin-forecast?months=12
router.get('/', async (req, res, next) => {
  try {
    const months = Math.max(1, Math.min(24, parseInt(req.query.months, 10) || 12));

    // Trailing 3-month average spend (run-rate) — same definition as the dashboard.
    const trend = await pool.query(
      `WITH m AS (
         SELECT to_char(date_trunc('month', CURRENT_DATE) - (n||' month')::interval, 'YYYY-MM') AS ym
         FROM generate_series(0, 2) AS n
       ),
       pay AS (
         SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS ym, SUM(amount) AS amt
         FROM fin_payments
         WHERE status='paid' AND payment_date IS NOT NULL
           AND payment_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         GROUP BY 1
       ),
       exp AS (
         SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS ym, SUM(amount) AS amt
         FROM expenses
         WHERE lower(status)='paid' AND date IS NOT NULL
           AND date >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         GROUP BY 1
       )
       SELECT m.ym AS month,
              (COALESCE(pay.amt,0)+COALESCE(exp.amt,0))::float AS total
       FROM m LEFT JOIN pay ON pay.ym=m.ym LEFT JOIN exp ON exp.ym=m.ym
       ORDER BY m.ym`);
    const recent = trend.rows.filter(r => num(r.total) > 0);
    const runRate = recent.length ? recent.reduce((s,r) => s + num(r.total), 0) / recent.length : 0;

    // Active budgets remaining commitments.
    const budgets = await pool.query(
      `SELECT id, name, total_amount::float AS total_amount, spent_amount::float AS spent_amount,
              GREATEST(total_amount - spent_amount, 0)::float AS remaining
       FROM fin_budgets WHERE status='active' ORDER BY name`);
    const totalRemaining = budgets.rows.reduce((s,b) => s + num(b.remaining), 0);

    // Annual recurring cost from staff (salary_annual + benefits) + driver_contracts (value).
    let staffAnnual = 0, contractsAnnual = 0;
    try {
      const s = await pool.query(`SELECT COALESCE(SUM(COALESCE(salary_annual,0) + COALESCE(benefits_cost_annual,0)),0)::float AS t FROM staff`);
      staffAnnual = num(s.rows[0]?.t);
    } catch {}
    try {
      const c = await pool.query(`SELECT COALESCE(SUM(value),0)::float AS t FROM driver_contracts WHERE status IN ('active','signed') OR status IS NULL`);
      contractsAnnual = num(c.rows[0]?.t);
    } catch {}
    const recurringMonthly = (staffAnnual + contractsAnnual) / 12;

    // Upcoming events budget commitments (events with start_date in the next `months` months).
    let upcomingEvents = [];
    try {
      const ev = await pool.query(
        `SELECT id, name, start_date,
                COALESCE(entry_fee,0)::float
                + COALESCE(travel_budget,0)::float
                + COALESCE(accommodation_budget,0)::float
                + COALESCE(catering_budget,0)::float
                + COALESCE(other_budget,0)::float AS budget_total
         FROM events
         WHERE start_date IS NOT NULL
           AND start_date >= CURRENT_DATE
           AND start_date <  CURRENT_DATE + ($1 || ' months')::interval
         ORDER BY start_date`, [months]);
      upcomingEvents = ev.rows;
    } catch {}
    const eventsCommitted = upcomingEvents.reduce((s,e) => s + num(e.budget_total), 0);

    // Build month buckets.
    const buckets = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      buckets.push({ month: ym, projected_recurring: recurringMonthly, projected_run_rate: runRate, events: 0, total: 0 });
    }
    for (const ev of upcomingEvents) {
      if (!ev.start_date) continue;
      const d = new Date(ev.start_date);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const b = buckets.find(x => x.month === ym);
      if (b) b.events += num(ev.budget_total);
    }
    for (const b of buckets) {
      b.total = b.projected_recurring + b.projected_run_rate + b.events;
    }
    const projectedTotal = buckets.reduce((s,b) => s + b.total, 0);

    res.json({
      success: true,
      run_rate_monthly:  runRate,
      recurring_monthly: recurringMonthly,
      staff_annual:      staffAnnual,
      contracts_annual:  contractsAnnual,
      budget_remaining:  totalRemaining,
      events_committed: eventsCommitted,
      projected_total_horizon: projectedTotal,
      months: months,
      buckets,
      upcoming_events: upcomingEvents,
      budgets: budgets.rows
    });
  } catch (e) { next(e); }
});

module.exports = router;
