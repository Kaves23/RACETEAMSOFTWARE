// _fin-audit-helper.js — write a row into fin_audit_log; failures are swallowed.
'use strict';

async function writeAudit(pool, req, entityType, entityId, action, changes = null, amount = null) {
  try {
    const user = req && req.user ? req.user : {};
    await pool.query(
      `INSERT INTO fin_audit_log
        (entity_type, entity_id, action, user_name, user_email, changes, amount, currency)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [
        String(entityType).slice(0, 50),
        entityId == null ? null : String(entityId).slice(0, 64),
        String(action).slice(0, 30),
        user.name || null,
        user.email || null,
        changes == null ? null : JSON.stringify(changes),
        amount == null ? null : Number(amount) || 0,
        'ZAR'
      ]
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('fin_audit_log write failed:', e.message);
    }
  }
}

module.exports = { writeAudit };
