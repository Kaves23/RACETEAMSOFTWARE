// routes/fin-cost-cap.js — FIA-style cost-cap tracker (settings + paid-spend in capped categories).
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const db = require('../db');

const num = (v) => (v == null || v === '') ? 0 : (Number(v) || 0);

async function readSettings() {
  // db.getSettings returns parsed object (settings table key/value)
  let s = {};
  try { s = (await db.getSettings()) || {}; } catch { s = {}; }
  return {
    cap_amount:          num(s.cost_cap_amount),
    cap_period:          s.cost_cap_period || 'season',
    cap_period_start:    s.cost_cap_period_start || null,  // ISO date
    cap_period_end:      s.cost_cap_period_end   || null,
    excluded_categories: Array.isArray(s.cost_cap_excluded_categories)
                          ? s.cost_cap_excluded_categories
                          : (typeof s.cost_cap_excluded_categories === 'string'
                              ? s.cost_cap_excluded_categories.split(',').map(x=>x.trim()).filter(Boolean)
                              : []),
    currency: s.cost_cap_currency || 'ZAR'
  };
}

// GET /api/fin-cost-cap
router.get('/', async (req, res, next) => {
  try {
    const cfg = await readSettings();

    const params = [];
    let dateClause = '';
    if (cfg.cap_period_start) { params.push(cfg.cap_period_start); dateClause += ` AND date >= $${params.length}`; }
    if (cfg.cap_period_end)   { params.push(cfg.cap_period_end);   dateClause += ` AND date <= $${params.length}`; }

    const payParams = [];
    let payDateClause = '';
    if (cfg.cap_period_start) { payParams.push(cfg.cap_period_start); payDateClause += ` AND payment_date >= $${payParams.length}`; }
    if (cfg.cap_period_end)   { payParams.push(cfg.cap_period_end);   payDateClause += ` AND payment_date <= $${payParams.length}`; }

    const [expRows, payRows] = await Promise.all([
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(category),''),'Uncategorised') AS category,
                SUM(amount)::float AS amount
         FROM expenses
         WHERE lower(status)='paid' ${dateClause}
         GROUP BY 1`, params),
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(category),''),'Uncategorised') AS category,
                SUM(amount)::float AS amount
         FROM fin_payments
         WHERE status='paid' ${payDateClause}
         GROUP BY 1`, payParams)
    ]);

    const byCat = {};
    for (const row of [...expRows.rows, ...payRows.rows]) {
      byCat[row.category] = (byCat[row.category] || 0) + num(row.amount);
    }
    const excluded = new Set(cfg.excluded_categories.map(c => c.toLowerCase()));
    const breakdown = Object.entries(byCat)
      .map(([category, amount]) => ({
        category,
        amount,
        excluded: excluded.has(category.toLowerCase())
      }))
      .sort((a,b) => b.amount - a.amount);

    const cappedSpend  = breakdown.filter(b => !b.excluded).reduce((s,b) => s + b.amount, 0);
    const excludedSpend= breakdown.filter(b =>  b.excluded).reduce((s,b) => s + b.amount, 0);
    const headroom     = cfg.cap_amount - cappedSpend;
    const pct          = cfg.cap_amount > 0 ? (cappedSpend / cfg.cap_amount) * 100 : 0;

    res.json({
      success: true,
      config: cfg,
      capped_spend:    cappedSpend,
      excluded_spend:  excludedSpend,
      total_spend:     cappedSpend + excludedSpend,
      headroom,
      pct_used:        pct,
      breakdown
    });
  } catch (e) { next(e); }
});

// POST /api/fin-cost-cap/config — { cap_amount, cap_period, cap_period_start, cap_period_end, excluded_categories[] }
router.post('/config', async (req, res, next) => {
  try {
    const b = req.body || {};
    const updates = {};
    if (b.cap_amount        != null) updates.cost_cap_amount = num(b.cap_amount);
    if (b.cap_period        != null) updates.cost_cap_period = b.cap_period;
    if (b.cap_period_start  != null) updates.cost_cap_period_start = b.cap_period_start || null;
    if (b.cap_period_end    != null) updates.cost_cap_period_end   = b.cap_period_end   || null;
    if (b.excluded_categories != null) updates.cost_cap_excluded_categories = b.excluded_categories;
    if (b.currency          != null) updates.cost_cap_currency = b.currency || 'ZAR';
    await db.saveSettings(updates);
    res.json({ success: true, config: await readSettings() });
  } catch (e) { next(e); }
});

module.exports = router;
