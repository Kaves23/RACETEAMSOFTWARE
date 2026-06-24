// routes/fin-rollup.js
// Cross-module cost roll-up: aggregates spend across payments, expenses, invoices,
// fuel (mileage × price), contracts, and driver packages for an event/project/driver.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const db = require('../db');

const num = v => Number(v) || 0;

// Resolve the configured fuel price per litre (ZAR), with a sensible fallback.
async function fuelPricePerLitre() {
  try {
    const s = await db.getSettings();
    const v = parseFloat(s.fuel_price_per_litre);
    if (!isNaN(v) && v > 0) return v;
  } catch (_e) {}
  return 23.50; // default ZAR/litre
}

// Net + gross total of an invoice's line items (gross applies vat_rate %).
function invoiceTotals(rows) {
  let net = 0, gross = 0;
  for (const r of rows) {
    const lines = Array.isArray(r.lines) ? r.lines : [];
    const sub = lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
    const vat = sub * (num(r.vat_rate) / 100);
    net += sub;
    gross += sub + vat;
  }
  return { net, gross };
}

// ── GET /api/fin-rollup/event/:id ────────────────────────────────────────────
router.get('/event/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const fuelPrice = await fuelPricePerLitre();

    const [evRes, payRes, expRes, invRes, fuelRes, lineRes, taskCostRes, taskLabourRes] = await Promise.all([
      pool.query('SELECT * FROM events WHERE id = $1', [id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total,
                         COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS paid
                  FROM fin_payments WHERE event_id::text = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total,
                         COALESCE(SUM(amount) FILTER (WHERE status='Paid' OR status='paid'),0) AS paid
                  FROM expenses WHERE event_id = $1`, [id]),
      pool.query('SELECT lines, vat_rate, status FROM fin_invoices WHERE event_id = $1', [id]),
      pool.query(`SELECT COALESCE(SUM(fuel_litres),0) AS litres
                  FROM mileage_log WHERE event_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(budgeted_amount),0)  AS budgeted,
                         COALESCE(SUM(committed_amount),0) AS committed,
                         COALESCE(SUM(actual_amount),0)    AS actual,
                         COUNT(*) AS line_count
                  FROM fin_budget_lines WHERE event_id = $1`, [id]),
      // Task estimated/actual costs from projects linked to this event
      pool.query(`SELECT
                    COALESCE(SUM(pt.estimated_cost),0) AS estimated,
                    COALESCE(SUM(pt.actual_cost),0)    AS actual,
                    COUNT(DISTINCT pp.id)               AS project_count,
                    COUNT(pt.id)                        AS task_count
                  FROM project_tasks pt
                  JOIN project_plans pp ON pp.id = pt.plan_id
                  WHERE pp.event_id = $1 AND (pt.is_inactive IS NULL OR pt.is_inactive = FALSE)`, [id]),
      // Labour costs from tasks in projects linked to this event
      pool.query(`SELECT
                    COALESCE(SUM(l.hours),0)        AS hours,
                    COALESCE(SUM(l.cost_amount),0)  AS cost,
                    COALESCE(SUM(l.bill_amount),0)  AS billable
                  FROM project_task_labour l
                  JOIN project_tasks pt ON pt.id = l.task_id
                  JOIN project_plans pp ON pp.id = pt.plan_id
                  WHERE pp.event_id = $1`, [id]),
    ]);

    const ev = evRes.rows[0] || null;
    const lines = lineRes.rows[0];
    const headerBudget = ev ? (num(ev.entry_fee)+num(ev.travel_budget)+num(ev.accommodation_budget)+num(ev.catering_budget)+num(ev.other_budget)) : 0;
    const budget = headerBudget + num(lines.budgeted);
    const payments = num(payRes.rows[0].total);
    const paymentsPaid = num(payRes.rows[0].paid);
    const expenses = num(expRes.rows[0].total);
    const expensesPaid = num(expRes.rows[0].paid);
    const invoices = invoiceTotals(invRes.rows);
    const litres = num(fuelRes.rows[0].litres);
    const fuelCost = litres * fuelPrice;
    const taskCosts = taskCostRes.rows[0];
    const taskLabour = taskLabourRes.rows[0];

    const totalCost = payments + expenses + fuelCost;

    res.json({
      success: true,
      event_id: id,
      currency: 'ZAR',
      budget: { total: budget, currency: ev?.budget_currency || 'ZAR',
                breakdown: ev ? {
                  entry_fee: num(ev.entry_fee), travel: num(ev.travel_budget),
                  accommodation: num(ev.accommodation_budget), catering: num(ev.catering_budget),
                  other: num(ev.other_budget)
                } : null },
      budget_lines: { count: Number(lines.line_count) || 0, budgeted: num(lines.budgeted),
                      committed: num(lines.committed), actual: num(lines.actual) },
      payments: { total: payments, paid: paymentsPaid },
      expenses: { total: expenses, paid: expensesPaid },
      fuel: { litres, price_per_litre: fuelPrice, cost: fuelCost },
      invoices: { count: invRes.rows.length, net: invoices.net, gross: invoices.gross },
      task_costs: {
        project_count: Number(taskCosts.project_count) || 0,
        task_count:    Number(taskCosts.task_count)    || 0,
        estimated:     num(taskCosts.estimated),
        actual:        num(taskCosts.actual)
      },
      task_labour: {
        hours:    num(taskLabour.hours),
        cost:     num(taskLabour.cost),
        billable: num(taskLabour.billable)
      },
      total_cost: totalCost,
      revenue: invoices.gross,
      net_position: invoices.gross - totalCost,
      budget_remaining: budget - totalCost
    });
  } catch (e) { next(e); }
});

// ── GET /api/fin-rollup/project/:id ──────────────────────────────────────────
router.get('/project/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const [planRes, taskRes, labourRes, lineRes] = await Promise.all([
      pool.query('SELECT * FROM project_plans WHERE id = $1', [id]),
      pool.query(`SELECT COALESCE(SUM(estimated_cost),0) AS est,
                         COALESCE(SUM(actual_cost),0)    AS actual,
                         COUNT(*) AS task_count
                  FROM project_tasks WHERE plan_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(l.hours),0)       AS hours,
                         COALESCE(SUM(l.cost_amount),0) AS cost,
                         COALESCE(SUM(l.bill_amount),0) AS bill
                  FROM project_task_labour l
                  JOIN project_tasks t ON t.id = l.task_id
                  WHERE t.plan_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(budgeted_amount),0)  AS budgeted,
                         COALESCE(SUM(committed_amount),0) AS committed,
                         COALESCE(SUM(actual_amount),0)    AS actual,
                         COUNT(*) AS line_count
                  FROM fin_budget_lines WHERE project_id = $1`, [id]),
    ]);

    const plan = planRes.rows[0] || null;
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

    const tasks = taskRes.rows[0];
    const estimated = num(tasks.est);
    const actual = num(tasks.actual);
    const budget = num(plan.budget);
    const labourCost = num(labourRes.rows[0].cost);
    const labourBill = num(labourRes.rows[0].bill);
    const labourHours = num(labourRes.rows[0].hours);
    const lines = lineRes.rows[0];

    // If the plan is linked to an event, pull that event's actual spend too.
    let eventSpend = 0;
    if (plan.event_id) {
      const [payRes, expRes] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM fin_payments WHERE event_id::text = $1`, [plan.event_id]),
        pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE event_id = $1`, [plan.event_id]),
      ]);
      eventSpend = num(payRes.rows[0].total) + num(expRes.rows[0].total);
    }

    const totalCost = actual + labourCost + num(lines.actual) + eventSpend;

    res.json({
      success: true,
      project_id: id,
      currency: plan.currency || 'ZAR',
      budget,
      spent: num(plan.spent),
      tasks: { count: Number(tasks.task_count) || 0, estimated_cost: estimated, actual_cost: actual },
      labour: { hours: labourHours, cost: labourCost, billable: labourBill },
      budget_lines: { count: Number(lines.line_count) || 0, budgeted: num(lines.budgeted),
                      committed: num(lines.committed), actual: num(lines.actual) },
      event_id: plan.event_id || null,
      event_spend: eventSpend,
      total_cost: totalCost,
      total_billable: labourBill,
      budget_remaining: budget - totalCost
    });
  } catch (e) { next(e); }
});

// ── GET /api/fin-rollup/driver/:id ───────────────────────────────────────────
router.get('/driver/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    const [contractRes, pkgRes, expRes, invRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(value),0) AS total, COUNT(*) AS count
                  FROM driver_contracts WHERE driver_id = $1`, [id]),
      pool.query(`SELECT mode, unit_price, qty FROM driver_packages WHERE driver_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE driver_id = $1`, [id]),
      pool.query(`SELECT lines, vat_rate FROM fin_invoices WHERE driver_id = $1`, [id]),
    ]);

    let packageInvoiceValue = 0;
    for (const p of pkgRes.rows) {
      if ((p.mode || 'invoice') === 'invoice') packageInvoiceValue += num(p.unit_price) * num(p.qty);
    }

    const contractValue = num(contractRes.rows[0].total);
    const expenses = num(expRes.rows[0].total);
    const invoices = invoiceTotals(invRes.rows);

    res.json({
      success: true,
      driver_id: id,
      currency: 'ZAR',
      contracts: { count: Number(contractRes.rows[0].count) || 0, value: contractValue },
      packages: { invoice_value: packageInvoiceValue },
      expenses: { total: expenses },
      invoices: { count: invRes.rows.length, net: invoices.net, gross: invoices.gross },
      total_cost: contractValue + expenses,
      total_billable: packageInvoiceValue + invoices.gross
    });
  } catch (e) { next(e); }
});

module.exports = router;
