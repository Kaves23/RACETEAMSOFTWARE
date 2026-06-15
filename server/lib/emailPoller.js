'use strict';
/**
 * emailPoller.js
 * Polls testdrive@ftwmotorsport.com (or configured PIPELINE_IMAP_USER) every
 * PIPELINE_IMAP_INTERVAL_MS milliseconds (default 5 min).
 *
 * For each UNSEEN message:
 *  1. Collect all from/to/cc email addresses (lowercased).
 *  2. Match against academy_prospects.parent_email (case-insensitive).
 *  3. Matched  → append an 'email' activity to the prospect's activities JSONB.
 *  4. Unmatched → insert into academy_email_inbox for manual linking.
 *  5. Mark the message SEEN so it is never processed again.
 *
 * Environment variables required:
 *   PIPELINE_IMAP_USER  — e.g. testdrive@ftwmotorsport.com
 *   PIPELINE_IMAP_PASS  — account / app password
 * Optional:
 *   PIPELINE_IMAP_HOST        — IMAP hostname (default: mail.ftwmotorsport.com)
 *   PIPELINE_IMAP_INTERVAL_MS — poll interval in ms (default: 300000 = 5 min)
 */

const { ImapFlow }     = require('imapflow');
const { simpleParser } = require('mailparser');

const DEFAULT_HOST     = 'mail.ftwmotorsport.com';
const DEFAULT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LOOKBACK_HOURS = 24;

/* ── Tiny HTML stripper (fallback for html-only emails) ──────────────────── */
function stripHtml(str) {
  return (str || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ── Extract addresses from an envelope address list ─────────────────────── */
function extractAddresses(addrList) {
  if (!Array.isArray(addrList)) return [];
  return addrList
    .filter(a => a && a.address)
    .map(a => ({ email: a.address.toLowerCase().trim(), name: a.name || null }));
}

/* ── Unique-by-email helper ───────────────────────────────────────────────── */
function uniqueAddresses(arr) {
  const seen = new Set();
  return arr.filter(a => {
    if (seen.has(a.email)) return false;
    seen.add(a.email);
    return true;
  });
}

/* ── uid() matching the front-end helper ─────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toPositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ── Main poll tick ───────────────────────────────────────────────────────── */
async function pollOnce(pool) {
  const user = process.env.PIPELINE_IMAP_USER;
  const pass = process.env.PIPELINE_IMAP_PASS;
  const host = process.env.PIPELINE_IMAP_HOST || DEFAULT_HOST;
  const lookbackHours = toPositiveInt(process.env.PIPELINE_IMAP_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
  const sinceDate = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000));

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false   // suppress verbose imapflow output
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch UNSEEN plus recent mail to avoid dropping messages that were
      // auto-marked as seen by another client before this poll tick ran.
      const unseen = [];
      for await (const msg of client.fetch({ seen: false }, {
        envelope: true,
        source: true
      })) {
        unseen.push(msg);
      }

      const recent = [];
      for await (const msg of client.fetch({ since: sinceDate }, {
        envelope: true,
        source: true
      })) {
        recent.push(msg);
      }

      const mergedByUid = new Map();
      unseen.forEach(m => mergedByUid.set(String(m.uid), m));
      recent.forEach(m => mergedByUid.set(String(m.uid), m));
      const messages = Array.from(mergedByUid.values());

      if (recent.length > unseen.length) {
        console.log(`[emailPoller] Fallback scan enabled — ${recent.length} recent message(s) in lookback window (${lookbackHours}h)`);
      }

      if (messages.length === 0) return;

      console.log(`[emailPoller] ${messages.length} new message(s) to process`);

      for (const msg of messages) {
        try {
          await processMessage(pool, client, msg);
        } catch (err) {
          console.warn(`[emailPoller] Error processing message uid=${msg.uid}:`, err.message);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function processMessage(pool, client, msg) {
  const env = msg.envelope || {};

  // Deduplicate message — use RFC 2822 Message-ID, fall back to uid+date
  const messageId = env.messageId || `uid-${msg.uid}-${(env.date || new Date()).getTime()}`;

  // Collect all addresses involved in the email
  const allRaw = [
    ...extractAddresses(env.from   || []),
    ...extractAddresses(env.to     || []),
    ...extractAddresses(env.cc     || []),
    ...extractAddresses(env.replyTo|| []),
  ];
  const allAddresses = uniqueAddresses(allRaw);
  const emailList    = allAddresses.map(a => a.email);

  // Sender info
  const fromAddr = allAddresses.find(a => (env.from || []).some(f => f.address && f.address.toLowerCase() === a.email));
  const fromEmail = fromAddr ? fromAddr.email : (emailList[0] || '');
  const fromName  = fromAddr ? (fromAddr.name || null) : null;

  // Subject + snippet — use mailparser to handle all MIME/encoding combinations
  const subject = env.subject || '(no subject)';
  let snippet = '';
  try {
    if (msg.source) {
      const parsed = await simpleParser(msg.source, { skipHtmlToText: false });
      const text = parsed.text || (parsed.html ? stripHtml(parsed.html) : '');
      snippet = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    }
  } catch (_) {}

  const receivedAt = env.date ? new Date(env.date) : new Date();

  // Skip emails sent FROM the pipeline address itself to avoid loops
  const pipelineUser = (process.env.PIPELINE_IMAP_USER || '').toLowerCase();
  if (fromEmail === pipelineUser) {
    await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
    return;
  }

  // Look for a matching prospect by any address in the email
  const matchResult = await pool.query(
    `SELECT id, driver_name, activities
     FROM academy_prospects
     WHERE LOWER(BTRIM(parent_email)) = ANY($1::text[])
     LIMIT 1`,
    [emailList]
  );

  if (matchResult.rows.length > 0) {
    // ── MATCHED: append email activity to prospect ────────────────────────
    const prospect = matchResult.rows[0];
    const activities = Array.isArray(prospect.activities) ? prospect.activities : [];

    // Dedup: don't add the same message twice
    const alreadyLogged = activities.some(a => a.email_message_id === messageId);
    if (!alreadyLogged) {
      const activity = {
        id:               uid(),
        type:             'email',
        date:             receivedAt.toISOString().slice(0, 10),
        staff:            null,
        summary:          subject + (fromName ? ` (from ${fromName})` : ` (from ${fromEmail})`),
        outcome:          snippet || null,
        source:           'email_inbound',
        email_message_id: messageId,
        created_at:       new Date().toISOString()
      };
      activities.push(activity);

      await pool.query(
        `UPDATE academy_prospects SET activities = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(activities), prospect.id]
      );
      console.log(`[emailPoller] Logged email activity for prospect "${prospect.driver_name}" (${prospect.id})`);
    }
  } else {
    // ── UNMATCHED: insert into inbox for manual linking ───────────────────
    try {
      await pool.query(
        `INSERT INTO academy_email_inbox
           (message_id, from_email, from_name, subject, snippet, all_addresses, received_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId, fromEmail, fromName, subject, snippet || null, JSON.stringify(allAddresses), receivedAt]
      );
      console.log(`[emailPoller] Unmatched email queued in inbox — from: ${fromEmail}, subject: "${subject}"`);
    } catch (err) {
      // Conflict (duplicate) is expected — silently ignore
      if (!err.message.includes('duplicate') && !err.message.includes('unique')) {
        throw err;
      }
    }
  }

  // Mark SEEN so it won't be processed on next poll
  await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
}

/* ── Public API ───────────────────────────────────────────────────────────── */
function startEmailPoller(pool) {
  const user     = process.env.PIPELINE_IMAP_USER;
  const pass     = process.env.PIPELINE_IMAP_PASS;
  const interval = parseInt(process.env.PIPELINE_IMAP_INTERVAL_MS, 10) || DEFAULT_INTERVAL;
  const lookbackHours = toPositiveInt(process.env.PIPELINE_IMAP_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);

  if (!user || !pass) {
    console.warn('[emailPoller] PIPELINE_IMAP_USER / PIPELINE_IMAP_PASS not set — pipeline email poller disabled');
    return;
  }

  console.log(`[emailPoller] Started — polling ${user} every ${interval / 1000}s (lookback ${lookbackHours}h)`);

  async function tick() {
    try {
      await pollOnce(pool);
    } catch (err) {
      console.warn('[emailPoller] Poll error (will retry next interval):', err.message);
    } finally {
      setTimeout(tick, interval);
    }
  }

  // Kick off after a short delay to let the server finish starting
  setTimeout(tick, 10000);
}

module.exports = { startEmailPoller };
