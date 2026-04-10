const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Shopify API integration
// Requires: SHOPIFY_SHOP, SHOPIFY_API_KEY, SHOPIFY_ACCESS_TOKEN in settings or env

/**
 * GET /api/shopify/test-connection
 * Test Shopify API connection with provided credentials
 */
router.post('/test-connection', async (req, res, next) => {
  try {
    // Credentials come from the database (set via OAuth), not from the request body
    const cfg = await loadShopifyCredentials();
    if (!cfg) {
      return res.status(400).json({
        success: false,
        error: 'Shopify is not connected. Please authorise via the Connect button first.'
      });
    }
    const { shop, accessToken } = cfg;
    
    // Test connection by fetching shop info
    const shopUrl = `https://${shop}/admin/api/2024-01/shop.json`;
    const response = await fetch(shopUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ 
        success: false, 
        error: `Shopify API Error: ${error}` 
      });
    }
    
    const data = await response.json();
    
    res.json({
      success: true,
      shop: data.shop,
      message: 'Connection successful'
    });
  } catch (error) {
    console.error('Shopify connection test error:', error);
    next(error);
  }
});

/**
 * POST /api/shopify/sync-inventory
 * Fetch products from Shopify and sync to local inventory table
 */
router.post('/sync-inventory', async (req, res, next) => {
  try {
    const { locationMapping } = req.body;

    // Credentials come from the database (set via OAuth)
    const cfg = await loadShopifyCredentials();
    if (!cfg) {
      return res.status(400).json({
        success: false,
        error: 'Shopify is not connected. Please authorise via the Connect button first.'
      });
    }
    const { shop, accessToken } = cfg;
    
    // Fetch all products from Shopify
    let allProducts = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= 10) { // Limit to 10 pages (2500 products) for safety
      const productsUrl = `https://${shop}/admin/api/2024-01/products.json?limit=250&page=${page}`;
      const response = await fetch(productsUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.text();
        return res.status(response.status).json({ 
          success: false, 
          error: `Shopify API Error: ${error}` 
        });
      }
      
      const data = await response.json();
      
      if (data.products && data.products.length > 0) {
        allProducts = allProducts.concat(data.products);
        page++;
        
        // Check if there are more pages
        if (data.products.length < 250) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    // Process and insert/update products into inventory table
    let synced = 0;
    let errors = [];
    
    for (const product of allProducts) {
      try {
        // Shopify products can have multiple variants
        for (const variant of product.variants || []) {
          // Map Shopify product to inventory schema
          const inventoryItem = {
            name: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
            sku: variant.sku || product.id.toString(),
            category: product.product_type || 'Uncategorized',
            quantity: variant.inventory_quantity || 0,
            unit_of_measure: 'ea',
            min_quantity: 0,
            location_id: null, // Will be set based on locationMapping if provided
            supplier: product.vendor || null,
            lead_time_days: 0,
            unit_cost: parseFloat(variant.price) || 0,
            notes: product.body_html || '',
            auto_reorder: false,
            shopify_product_id: product.id.toString(),
            shopify_variant_id: variant.id.toString(),
            shopify_sync_at: new Date().toISOString()
          };
          
          // Build location distribution from inventory levels
          let locationDist = {};
          if (variant.inventory_item_id) {
            // Fetch inventory levels for this variant
            const levelsUrl = `https://${shop}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`;
            const levelsResponse = await fetch(levelsUrl, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            if (levelsResponse.ok) {
              const levelsData = await levelsResponse.json();
              
              if (levelsData.inventory_levels) {
                for (const level of levelsData.inventory_levels) {
                  // Map Shopify location to local location using locationMapping
                  let localLocation = 'Shopify';
                  if (locationMapping && locationMapping[level.location_id]) {
                    localLocation = locationMapping[level.location_id];
                  }
                  
                  if (level.available > 0) {
                    locationDist[localLocation] = (locationDist[localLocation] || 0) + level.available;
                  }
                }
              }
            }
          }
          
          inventoryItem.location_distribution = JSON.stringify(locationDist);
          
          // Insert or update using ON CONFLICT
          const query = `
            INSERT INTO inventory (
              name, sku, category, quantity, unit_of_measure, min_quantity,
              location_id, supplier, lead_time_days, unit_cost, notes, auto_reorder,
              shopify_product_id, shopify_variant_id, shopify_sync_at, location_distribution
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (sku) 
            DO UPDATE SET
              name = EXCLUDED.name,
              category = EXCLUDED.category,
              quantity = EXCLUDED.quantity,
              supplier = EXCLUDED.supplier,
              unit_cost = EXCLUDED.unit_cost,
              notes = EXCLUDED.notes,
              shopify_product_id = EXCLUDED.shopify_product_id,
              shopify_variant_id = EXCLUDED.shopify_variant_id,
              shopify_sync_at = EXCLUDED.shopify_sync_at,
              location_distribution = EXCLUDED.location_distribution,
              updated_at = NOW()
          `;
          
          await pool.query(query, [
            inventoryItem.name,
            inventoryItem.sku,
            inventoryItem.category,
            inventoryItem.quantity,
            inventoryItem.unit_of_measure,
            inventoryItem.min_quantity,
            inventoryItem.location_id,
            inventoryItem.supplier,
            inventoryItem.lead_time_days,
            inventoryItem.unit_cost,
            inventoryItem.notes,
            inventoryItem.auto_reorder,
            inventoryItem.shopify_product_id,
            inventoryItem.shopify_variant_id,
            inventoryItem.shopify_sync_at,
            inventoryItem.location_distribution
          ]);
          
          synced++;
        }
      } catch (itemError) {
        console.error(`Error syncing product ${product.id}:`, itemError);
        errors.push({ product: product.title, error: itemError.message });
      }
    }
    
    res.json({
      success: true,
      synced,
      total: allProducts.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully synced ${synced} items from Shopify`
    });
  } catch (error) {
    console.error('Shopify sync error:', error);
    next(error);
  }
});

/**
 * GET /api/shopify/settings
 * Get stored Shopify settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT value FROM settings WHERE key = 'shopify_config' LIMIT 1`
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      const config = JSON.parse(result.rows[0].value);
      res.json({
        success: true,
        config: {
          shop: config.shop || '',
          hasAccessToken: !!config.accessToken,
          lastSync: config.lastSync || null
        }
      });
    } else {
      res.json({ success: true, config: null });
    }
  } catch (error) {
    console.error('Error fetching Shopify settings:', error);
    next(error);
  }
});

/**
 * POST /api/shopify/settings
 * Save Shopify settings
 */
router.post('/settings', async (req, res, next) => {
  try {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) {
      return res.status(400).json({ success: false, error: 'shop and accessToken are required' });
    }

    const config = { shop, accessToken, lastSync: null };

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('shopify_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(config)]
    );
    res.json({ success: true, message: 'Shopify settings saved' });
  } catch (error) {
    console.error('Error saving Shopify settings:', error);
    next(error);
  }
});

/**
 * POST /api/shopify/disconnect
 * Remove stored Shopify credentials.
 */
router.post('/disconnect', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM settings WHERE key = 'shopify_config'`);
    res.json({ success: true, message: 'Shopify disconnected' });
  } catch (error) {
    console.error('Error disconnecting Shopify:', error);
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: load stored Shopify credentials
// ──────────────────────────────────────────────────────────────────────────────
async function loadShopifyCredentials() {
  const result = await pool.query(
    `SELECT value FROM settings WHERE key = 'shopify_config' LIMIT 1`
  );
  if (!result.rows.length || !result.rows[0].value) return null;
  const cfg = JSON.parse(result.rows[0].value);
  if (!cfg.shop || !cfg.accessToken) return null;
  return cfg;
}

/**
 * GET /api/shopify/search?q=bearing
 * Live search Shopify products by title — uses stored credentials.
 * Returns a flat list of variants ready to display in the packing UI.
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, products: [] });

    const cfg = await loadShopifyCredentials();
    if (!cfg) {
      return res.status(400).json({
        success: false,
        error: 'Shopify not configured. Save credentials in Inventory → Shopify first.'
      });
    }

    const headers = { 'X-Shopify-Access-Token': cfg.accessToken, 'Content-Type': 'application/json' };
    const graphqlUrl = `https://${cfg.shop}/admin/api/2026-01/graphql.json`;
    const results = [];

    // Use GraphQL to search by SKU (exact) first, then fall back to title search
    const skuQuery = `{
      products(first: 10, query: "sku:${q.replace(/"/g, '')}") {
        edges {
          node {
            id
            title
            productType
            vendor
            images(first: 1) { edges { node { url } } }
            variants(first: 20) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                  inventoryQuantity
                  inventoryItem { id }
                }
              }
            }
          }
        }
      }
    }`;

    const gqlResp = await fetch(graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: skuQuery })
    });

    const gqlData = await gqlResp.json();
    const gqlProducts = gqlData?.data?.products?.edges || [];

    const parseGid = (gid) => String(gid).split('/').pop();

    for (const { node: product } of gqlProducts) {
      for (const { node: variant } of (product.variants?.edges || [])) {
        // For SKU search, only include exact SKU matches
        if (!variant.sku || variant.sku !== q) continue;
        results.push({
          shopify_product_id: parseGid(product.id),
          shopify_variant_id: parseGid(variant.id),
          shopify_inventory_item_id: parseGid(variant.inventoryItem?.id || ''),
          name: product.title + (variant.title !== 'Default Title' ? ` – ${variant.title}` : ''),
          sku: variant.sku || '',
          price: variant.price || '0.00',
          category: product.productType || 'Uncategorized',
          vendor: product.vendor || '',
          image_url: product.images?.edges?.[0]?.node?.url || null,
          shopify_quantity: variant.inventoryQuantity || 0
        });
      }
    }

    // Fall back to title search if no SKU match
    if (results.length === 0) {
      const titleQuery = `{
        products(first: 10, query: "title:${q.replace(/"/g, '')}") {
          edges {
            node {
              id
              title
              productType
              vendor
              images(first: 1) { edges { node { url } } }
              variants(first: 20) {
                edges {
                  node {
                    id
                    sku
                    title
                    price
                    inventoryQuantity
                    inventoryItem { id }
                  }
                }
              }
            }
          }
        }
      }`;

      const titleResp = await fetch(graphqlUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: titleQuery })
      });
      const titleData = await titleResp.json();
      const titleProducts = titleData?.data?.products?.edges || [];

      for (const { node: product } of titleProducts) {
        for (const { node: variant } of (product.variants?.edges || [])) {
          results.push({
            shopify_product_id: parseGid(product.id),
            shopify_variant_id: parseGid(variant.id),
            shopify_inventory_item_id: parseGid(variant.inventoryItem?.id || ''),
            name: product.title + (variant.title !== 'Default Title' ? ` – ${variant.title}` : ''),
            sku: variant.sku || '',
            price: variant.price || '0.00',
            category: product.productType || 'Uncategorized',
            vendor: product.vendor || '',
            image_url: product.images?.edges?.[0]?.node?.url || null,
            shopify_quantity: variant.inventoryQuantity || 0
          });
        }
      }
    }

    res.json({ success: true, products: results });
  } catch (error) {
    console.error('Shopify search error:', error);
    next(error);
  }
});

/**
 * POST /api/shopify/lazy-import
 * Given a Shopify variant, find the matching local inventory row or create one.
 * Returns the local inventory item so the packing UI can immediately pack it.
 */
router.post('/lazy-import', async (req, res, next) => {
  try {
    const { shopify_variant_id, shopify_product_id, name, sku, price, category, vendor } = req.body;

    if (!shopify_variant_id) {
      return res.status(400).json({ success: false, error: 'shopify_variant_id is required' });
    }

    // Check if this variant is already in local inventory
    const existing = await pool.query(
      `SELECT * FROM inventory WHERE shopify_variant_id = $1 LIMIT 1`,
      [String(shopify_variant_id)]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, item: existing.rows[0], created: false });
    }

    // Create the local inventory row — quantity starts at 0 (Shopify is the stock source of truth)
    const { randomUUID } = require('crypto');
    const newId = randomUUID();
    const categoryName = (category && category !== 'Uncategorized') ? category : null;
    const insertResult = await pool.query(
      `INSERT INTO inventory (
         id, name, sku, category, quantity, min_quantity, unit_of_measure,
         status, auto_reorder, lead_time_days,
         shopify_product_id, shopify_variant_id, shopify_sync_at,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 0, 0, 'ea',
         'active', false, 0,
         $5, $6, NOW(),
         NOW(), NOW()
       ) RETURNING *`,
      [newId, name, sku || null, categoryName, String(shopify_product_id), String(shopify_variant_id)]
    );

    res.json({ success: true, item: insertResult.rows[0], created: true });
  } catch (error) {
    console.error('Shopify lazy-import error:', error);
    next(error);
  }
});

module.exports = router;
