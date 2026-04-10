/**
 * Shopify OAuth 2.0 routes — PUBLIC (no JWT auth required).
 * These endpoints are called by the browser during the OAuth handshake with Shopify.
 *
 * ENV VARS REQUIRED:
 *   SHOPIFY_API_KEY          — Client ID from Shopify Partners app
 *   SHOPIFY_API_SECRET       — Client Secret from Shopify Partners app
 *   SHOPIFY_REDIRECT_URI     — Full callback URL, e.g. https://yourapp.onrender.com/api/shopify/callback
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../db');

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/shopify/auth?shop=ftwmotorsport
// Starts the OAuth flow — redirects the browser to Shopify's authorisation page.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/auth', async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) {
      return res.status(400).send('Missing ?shop= parameter');
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    if (!apiKey) {
      return res.status(500).send('SHOPIFY_API_KEY is not configured on the server');
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const scopes = 'read_products,read_inventory,write_inventory,read_locations';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/shopify/callback`;

    // Generate a random state token to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');

    // Persist state briefly so we can verify it in the callback
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('shopify_oauth_state', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ state, shop: shopDomain })]
    );

    const authUrl =
      `https://${shopDomain}/admin/oauth/authorize` +
      `?client_id=${apiKey}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error('Shopify OAuth /auth error:', err);
    res.status(500).send('Internal server error during OAuth initiation');
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/shopify/callback
// Shopify redirects here after the merchant approves the app.
// We verify the HMAC, exchange the code for an access token, store it, then
// redirect back to inventory.html.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  try {
    const { code, hmac, shop, state, timestamp } = req.query;
    const apiSecret = process.env.SHOPIFY_API_SECRET;

    if (!apiSecret) {
      return res.status(500).send('SHOPIFY_API_SECRET is not configured on the server');
    }

    // 1. Verify state to prevent CSRF
    const stateResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'shopify_oauth_state' LIMIT 1`
    );
    const storedState = JSON.parse(stateResult.rows[0]?.value || '{}')?.state;
    if (!storedState || storedState !== state) {
      return res.status(403).send('OAuth state mismatch — possible CSRF attack');
    }

    // 2. Verify HMAC signature from Shopify
    const queryString = Object.entries(req.query)
      .filter(([key]) => key !== 'hmac')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const expectedHmac = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac || ''))) {
      return res.status(403).send('HMAC verification failed');
    }

    // 3. Exchange authorisation code for permanent access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: apiSecret,
        code
      })
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Shopify token exchange failed:', errText);
      return res.status(500).send('Failed to obtain access token from Shopify');
    }

    const { access_token } = await tokenResponse.json();

    // 4. Store credentials in settings table
    const config = { shop, accessToken: access_token, lastSync: null };
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('shopify_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(config)]
    );

    // 5. Clean up the temporary state record
    await pool.query(`DELETE FROM settings WHERE key = 'shopify_oauth_state'`);

    // 6. Send user back to the inventory page with a success flag
    res.redirect('/inventory.html?shopify=connected');
  } catch (err) {
    console.error('Shopify OAuth /callback error:', err);
    res.redirect('/inventory.html?shopify=error');
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/shopify/status  (public — used by the UI before login check)
// Returns whether a Shopify connection is stored, without exposing the token.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT value FROM settings WHERE key = 'shopify_config' LIMIT 1`
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      const cfg = JSON.parse(result.rows[0].value);
      if (cfg.accessToken) {
        return res.json({ connected: true, shop: cfg.shop, lastSync: cfg.lastSync || null });
      }
    }
    res.json({ connected: false });
  } catch (err) {
    console.error('Shopify /status error:', err);
    res.json({ connected: false });
  }
});

module.exports = router;
