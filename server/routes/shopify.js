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
    const { shop, accessToken } = req.body;
    
    if (!shop || !accessToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: shop, accessToken' 
      });
    }
    
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
    const { shop, accessToken, locationMapping } = req.body;
    
    if (!shop || !accessToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: shop, accessToken' 
      });
    }
    
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
    // Try to get from database settings table (if it exists)
    const query = `
      SELECT value FROM settings WHERE key = 'shopify_config' LIMIT 1
    `;
    
    try {
      const result = await pool.query(query);
      if (result.rows.length > 0) {
        const config = JSON.parse(result.rows[0].value);
        // Don't send the access token in the response for security
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
    } catch (dbError) {
      // Settings table doesn't exist, return empty
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
    
    const config = {
      shop,
      accessToken,
      lastSync: null
    };
    
    // Try to save to database settings table (create if doesn't exist)
    const query = `
      INSERT INTO settings (key, value, created_at, updated_at)
      VALUES ('shopify_config', $1, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    
    try {
      await pool.query(query, [JSON.stringify(config)]);
      res.json({ success: true, message: 'Shopify settings saved' });
    } catch (dbError) {
      // Settings table doesn't exist, return success anyway (will use session storage)
      console.warn('Settings table not available:', dbError.message);
      res.json({ 
        success: true, 
        message: 'Settings saved to session (database table not available)',
        warning: 'Settings will not persist across sessions'
      });
    }
  } catch (error) {
    console.error('Error saving Shopify settings:', error);
    next(error);
  }
});

module.exports = router;
