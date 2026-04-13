// server/lib/activityLog.js
// Shared helper — writes one row to the activity_log table.
// Pass a pg Pool or a transaction PoolClient as the first argument.
// Inside a transaction: pass the client so the log is part of the same transaction.
// Outside a transaction: pass pool and .catch(() => {}) — fire-and-forget safe.
// A failed log write NEVER breaks the calling business operation.

function genId() {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {object} opts
 * @param {string}  opts.entityType
 * @param {string}  opts.entityId
 * @param {string}  [opts.entityName]
 * @param {string}  opts.action
 * @param {string}  [opts.eventId]
 * @param {string}  [opts.eventName]
 * @param {string}  [opts.userId]
 * @param {string}  [opts.userName]
 * @param {object}  [opts.details]
 * @returns {Promise<void>}
 */
async function logActivity(db, {
  entityType,
  entityId,
  entityName,
  action,
  eventId,
  eventName,
  userId,
  userName,
  details,
} = {}) {
  try {
    await db.query(
      `INSERT INTO activity_log
         (id, entity_type, entity_id, entity_name, action,
          event_id, event_name,
          performed_by_user_id, performed_by_name,
          details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        genId(),
        entityType        || null,
        entityId          || null,
        entityName        || null,
        action            || null,
        eventId           || null,
        eventName         || null,
        userId            || null,
        userName          || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    // Never let a log failure break a business operation
    console.warn(
      `[activityLog] Failed to write log (${action} on ${entityType}/${entityId}):`,
      err.message
    );
  }
}

module.exports = { logActivity };
