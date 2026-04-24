const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const ALERT_TO = 'win@rokthenats.co.za';

/**
 * Build a Nodemailer transporter from environment variables.
 * Required env vars:
 *   SMTP_USER  — Gmail address (e.g. yourname@gmail.com)
 *   SMTP_PASS  — Gmail App Password (16-char, no spaces)
 * Optional:
 *   SMTP_FROM  — Display name + address, defaults to SMTP_USER
 */
function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS environment variables are required to send email alerts');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // TLS
    auth: { user, pass }
  });
}

/**
 * POST /api/notifications/shopify-stock-alert
 *
 * Body:
 *   userName        — full name / username of the person who packed
 *   productName     — Shopify product name
 *   sku             — product SKU (optional)
 *   quantity        — units packed
 *   boxName         — name of the box the item was packed into
 *   locationName    — Shopify location name
 *   shopifyQtyBefore — Shopify stock level before packing
 *   shopifyQtyAfter  — resulting stock level (may be negative)
 */
router.post('/shopify-stock-alert', async (req, res) => {
  try {
    const {
      userName,
      productName,
      sku,
      quantity,
      boxName,
      locationName,
      shopifyQtyBefore,
      shopifyQtyAfter
    } = req.body;

    // Basic validation
    if (!productName || quantity == null) {
      return res.status(400).json({ success: false, error: 'productName and quantity are required' });
    }

    const skuLine = sku ? ` (SKU: ${sku})` : '';
    const afterLabel = shopifyQtyAfter < 0
      ? `${shopifyQtyAfter} unit(s) ⚠️ BELOW ZERO`
      : `${shopifyQtyAfter} unit(s)`;

    const subject = `⚠️ Shopify Stock Alert — "${productName}" pushed below zero`;

    const textBody =
`Stock Validation Required

${userName || 'A user'} packed ${quantity}× "${productName}"${skuLine} into box "${boxName}".

This has pushed Shopify stock at ${locationName || 'the selected location'} to ${afterLabel}.
Stock before packing: ${shopifyQtyBefore} unit(s).

Shopify may be showing incorrect stock. Please validate the actual stock count in Shopify and adjust if necessary.

— RTS Automated Alert`;

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#f59e0b;padding:12px 20px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:16px">⚠️ Shopify Stock Alert</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 6px 6px">
    <p style="margin:0 0 16px"><strong>Stock Validation Required</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f9fafb">
        <td style="padding:8px 12px;font-weight:600;width:40%">Packed by</td>
        <td style="padding:8px 12px">${escHtml(userName || 'Unknown User')}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600">Product</td>
        <td style="padding:8px 12px">${escHtml(productName)}${sku ? ` <span style="color:#6b7280;font-size:12px">(${escHtml(sku)})</span>` : ''}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px 12px;font-weight:600">Quantity packed</td>
        <td style="padding:8px 12px">${Number(quantity)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600">Box</td>
        <td style="padding:8px 12px">${escHtml(boxName || '—')}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px 12px;font-weight:600">Shopify location</td>
        <td style="padding:8px 12px">${escHtml(locationName || '—')}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600">Stock before</td>
        <td style="padding:8px 12px">${Number(shopifyQtyBefore)} unit(s)</td>
      </tr>
      <tr style="background:#fef2f2">
        <td style="padding:8px 12px;font-weight:600;color:#dc2626">Stock after</td>
        <td style="padding:8px 12px;color:#dc2626;font-weight:700">${shopifyQtyAfter < 0 ? shopifyQtyAfter + ' ⚠️ BELOW ZERO' : shopifyQtyAfter}</td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280">
      Shopify may be showing incorrect stock. Please validate the actual stock count 
      in Shopify and adjust if necessary.
    </p>
    <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">
    <p style="margin:0;font-size:11px;color:#9ca3af">RTS Automated Alert — Race Team Software V5</p>
  </div>
</div>`;

    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to: ALERT_TO,
      subject,
      text: textBody,
      html: htmlBody
    });

    console.log(`📧 Shopify stock alert sent to ${ALERT_TO} — "${productName}" packed by ${userName}`);
    res.json({ success: true });

  } catch (err) {
    console.error('Stock alert email error:', err.message);
    // Return 200 so the client doesn't surface this as a packing failure — packing already succeeded
    res.json({ success: false, error: err.message });
  }
});

/** Minimal HTML escaping to prevent injection in email body */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
