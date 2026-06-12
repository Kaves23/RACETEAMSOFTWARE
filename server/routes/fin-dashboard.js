// routes/fin-dashboard.js — Finance cockpit aggregations for finance-dashboard.html
// Single endpoint GET /api/fin-dashboard returns KPIs, budget bars, spend trend,
// alerts, and spend-by-category / spend-by-event breakdowns in one round-trip.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const num = (v) => Number(v) || 0;

// Monthly spend trend (paid payments + paid expenses) over the last N months.
async function getTrend(months) {
  const span = Math.max(1, Math.min(24, parseInt(months, 10) || 6));
  const r = await pool.query(
    `WITH m AS (
       SELECT to_char(date_trunc('month', CURRENT_DATE) - (n || ' month')::interval, 'YYYY-MM') AS ym
       FROM generate_series(0, $1::int - 1) AS n
     ),
     pay AS (
       SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS ym, SUM(amount) AS amt
       FROM fin_payments
       WHERE status = 'paid' AND payment_date IS NOT NULL
         AND payment_date >= date_trunc('month', CURRENT_DATE) - (($1::int - 1) || ' month')::interval
       GROUP BY 1
     ),
     exp AS (
       SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS ym, SUM(amount) AS amt
       FROM expenses
       WHERE lower(status) = 'paid' AND date IS NOT NULL
         AND date >= date_trunc('month', CURRENT_DATE) - (($1::int - 1) || ' month')::interval
       GROUP BY 1
     )
     SELECT m.ym AS month,
            COALESCE(pay.amt, 0)::float AS payments,
            COALESCE(exp.amt, 0)::float AS expenses,
            (COALESCE(pay.amt, 0) + COALESCE(exp.amt, 0))::float AS total
     FROM m
     LEFT JOIN pay ON pay.ym = m.ym
     LEFT JOIN exp ON exp.ym = m.ym
     ORDER BY m.ym`,
    [span]
  );
  return r.rows;
}

async function getByCategory() {
  const r = await pool.query(
    `WITH c AS (
       SELECT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS category, SUM(amount) AS amt
       FROM fin_payments WHERE status = 'paid' GROUP BY 1
       UNION ALL
       SELECT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS category, SUM(amount) AS amt
       FROM expenses WHERE lower(status) = 'paid' GROUP BY 1
     )
     SELECT category, SUM(amt)::float AS amount
     FROM c GROUP BY category ORDER BY amount DESC LIMIT 12`
  );
  return r.rows;
}

async function getByEvent() {
  const r = await pool.query(
    `WITH ev AS (
       SELECT event_id::text AS eid, SUM(amount) AS amt
       FROM fin_payments WHERE status = 'paid' AND event_id IS NOT NULL GROUP BY 1
       UNION ALL
       SELECT event_id::text AS eid, SUM(amount) AS amt
       FROM expenses WHERE lower(status) = 'paid' AND event_id IS NOT NULL GROUP BY 1
     )
     SELECT ev.eid AS event_id, e.name AS event_name, SUM(ev.amt)::float AS amount
     FROM ev LEFT JOIN events e ON e.id = ev.eid
     GROUP BY ev.eid, e.name ORDER BY amount DESC LIMIT 12`
  );
  return r.rows;
}

// GET /api/fin-dashboard
router.get('/', async (req, res, next) => {
  try {
    const [budgetSummary, paymentSummary, expenseSummary, budgets, trend, byCategory, byEvent, recentPayments] =
      await Promise.all([
        pool.query(`
          SELECT COUNT(*) AS total_budgets,
                 COALESCE(SUM(total_amount), 0) AS total_allocated,
                 COALESCE(SUM(spent_amount), 0) AS total_spent,
                 COALESCE(SUM(total_amount - spent_amount), 0) AS total_remaining,
                 COUNT(*) FILTER (WHERE status = 'active') AS active_budgets,
                 COUNT(*) FILTER (WHERE spent_amount > total_amount) AS over_budget
          FROM fin_budgets WHERE status != 'closed'`),
        pool.query(`
          SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                 COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_amount,
                 COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount
          FROM fin_payments`),
        pool.query(`
          SELECT COALESCE(SUM(amount), 0) AS expenses_total,
                 COALESCE(SUM(CASE WHEN lower(status) IN ('pending','submitted') THEN amount ELSE 0 END), 0) AS expenses_pending
          FROM expenses`),
        pool.query(`
          SELECT b.id, b.name, b.category, b.total_amount::float, b.spent_amount::float, b.status,
                 ROUND(CASE WHEN b.total_amount > 0 THEN b.spent_amount / b.total_amount * 100 ELSE 0 END, 1)::float AS pct_spent
          FROM fin_budgets WHERE status = 'active'
          ORDER BY pct_spent DESC, b.created_at DESC`),
        getTrend(req.query.months),
        getByCategory(),
        getByEvent(),
        pool.query(`
          SELECT p.payee, p.amount::float, p.status, p.payment_date, p.category
          FROM fin_payments p
          ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC LIMIT 12`),
      ]);

    const bs = budgetSummary.rows[0];
    const ps = paymentSummary.rows[0];
    const es = expenseSummary.rows[0];

    // Run-rate: average monthly total spend over the trailing 3 months that have data.
    const recent = trend.slice(-3);
    const withData = recent.filter(m => num(m.total) > 0);
    const runRate = withData.length
      ? withData.reduce((s, m) => s + num(m.total), 0) / withData.length
      : 0;
    const projectedAnnual = runRate * 12;

    // Alerts from active budgets at or above 70% utilisation.
    const alerts = budgets.rows
      .filter(b => num(b.pct_spent) >= 70)
      .map(b => {
        const pct = num(b.pct_spent);
        const level = pct >= 100 ? 'danger' : pct >= 90 ? 'warning' : 'watch';
        const msg = pct >= 100 ? 'Over budget' : pct >= 90 ? 'Near limit' : 'Watch';
        return { id: b.id, name: b.name, pct, level, message: msg,
                 spent: num(b.spent_amount), total: num(b.total_amount) };
      });

    res.json({
      success: true,
      kpis: {
        active_budgets:    num(bs.active_budgets),
        total_allocated:   num(bs.total_allocated),
        total_spent:       num(bs.total_spent),
        total_remaining:   num(bs.total_remaining),
        over_budget:       num(bs.over_budget),
        pending_count:     num(ps.pending_count),
        pending_amount:    num(ps.pending_amount),
        paid_amount:       num(ps.paid_amount),
        expenses_total:    num(es.expenses_total),
        expenses_pending:  num(es.expenses_pending),
        run_rate_monthly:  runRate,
        projected_annual:  projectedAnnual,
      },
      budgets:     budgets.rows,
      trend,
      by_category: byCategory,
      by_event:    byEvent,
      alerts,
      recent_payments: recentPayments.rows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
