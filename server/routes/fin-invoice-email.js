// routes/fin-invoice-email.js — Send an invoice via SMTP (nodemailer).
'use strict';
const express = require('express');
const router  = express.Router();
const nodemailer = require('nodemailer');
const { pool } = require('../db');
const { writeAudit } = require('./_fin-audit-helper');

function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS are not configured on the server');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
}

// POST /api/fin-invoice-email
// Body: { invoice_id?, to, cc?, subject?, html, text?, invoice_number?, total? }
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.to)   return res.status(400).json({ error: 'to is required' });
    if (!b.html && !b.text) return res.status(400).json({ error: 'html or text required' });

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ error: 'SMTP not configured (set SMTP_USER and SMTP_PASS on the server).' });
    }
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const subject = b.subject || (b.invoice_number ? `Invoice ${b.invoice_number}` : 'Invoice');
    const to = String(b.to).trim();
    const cc = b.cc ? String(b.cc).trim() : undefined;

    const info = await transporter.sendMail({
      from, to, cc, subject,
      html: b.html || undefined,
      text: b.text || undefined
    });

    // Mark invoice as sent if id provided.
    if (b.invoice_id) {
      try {
        await pool.query(
          `UPDATE fin_invoices SET status = COALESCE(NULLIF(status,'paid'),'sent'), updated_at=NOW() WHERE id=$1`,
          [b.invoice_id]
        );
      } catch (_e) {}
    }

    await writeAudit(pool, req, 'invoice', b.invoice_id || b.invoice_number || null, 'email',
      { to, cc, subject, message_id: info.messageId }, b.total);

    res.json({ success: true, message_id: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Email send failed' });
  }
});

module.exports = router;
