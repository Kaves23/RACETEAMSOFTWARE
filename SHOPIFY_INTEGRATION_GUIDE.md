# Shopify Integration Guide

## Overview
The Race Team Software V5 system now includes full Shopify integration, allowing you to sync your online store inventory directly with your local inventory management system.

## Features
- ✅ Import all Shopify products and variants
- ✅ Multi-location inventory tracking
- ✅ Automatic SKU matching and updates
- ✅ Real-time sync with progress tracking
- ✅ Secure credential storage
- ✅ Support for product variants
- ✅ Vendor/supplier mapping

## Setup Instructions

### 1. Create Shopify Custom App

1. Log into your Shopify Admin Panel
2. Navigate to **Settings** → **Apps and sales channels**
3. Click **Develop apps** → **Create an app**
4. Name your app (e.g., "Race Team Inventory Sync")
5. Click **Configure Admin API scopes**
6. Enable the following scopes:
   - `read_products`
   - `read_inventory`
   - `read_locations`
7. Click **Save**
8. Click **Install app**
9. Copy the **Admin API access token** (starts with `shpat_`)

### 2. Configure Integration

1. Open the **Inventory** page in Race Team Software
2. Click the **Shopify** button in the top right
3. Enter your shop name (e.g., `mystore` for `mystore.myshopify.com`)
4. Paste your Admin API access token
5. Click **Test Connection** to verify
6. If successful, you'll see a green checkmark

### 3. Run Initial Sync

1. Leave sync options checked:
   - ✅ Update existing items (matched by SKU)
   - ✅ Sync location inventory levels
2. Click **Start Sync**
3. Wait for the sync to complete (progress bar will show status)
4. Review the results

## How It Works

### Data Mapping

Shopify products are mapped to inventory items as follows:

| Shopify Field | Inventory Field | Notes |
|--------------|----------------|-------|
| Product Title + Variant Title | Item Name | Variant title added if not "Default Title" |
| Variant SKU | SKU | Used for matching existing items |
| Product Type | Category | Shopify product type becomes category |
| Inventory Quantity | Quantity | Total across all locations |
| Variant Price | Unit Cost | Retail price used as cost |
| Vendor | Supplier | Shopify vendor becomes supplier |
| Body HTML | Notes | Product description |
| Inventory Levels | Location Distribution | Multi-location quantities tracked |

### Location Distribution

The system fetches inventory levels from all Shopify locations and creates a location distribution map. For example:

```json
{
  "Main Warehouse": 50,
  "Retail Store": 10,
  "Driver Kit": 5
}
```

This allows you to see exactly where each item is stocked across all your locations.

### SKU Matching

The sync uses SKUs to match Shopify products with existing inventory items:
- **New SKU** → Creates new inventory item
- **Existing SKU** → Updates existing item (if "Update existing items" is checked)

## Database Changes

Migration `011_add_shopify_support.sql` adds the following fields to the `inventory` table:

```sql
shopify_product_id    VARCHAR(255)  -- Shopify product ID
shopify_variant_id    VARCHAR(255)  -- Shopify variant ID
shopify_sync_at       TIMESTAMPTZ   -- Last sync timestamp
```

A new `settings` table is also created to securely store Shopify credentials:

```sql
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

The following endpoints are available at `/api/shopify`:

### POST /api/shopify/test-connection
Test Shopify API connection with provided credentials.

**Request:**
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shpat_..."
}
```

**Response:**
```json
{
  "success": true,
  "shop": {...},
  "message": "Connection successful"
}
```

### POST /api/shopify/sync-inventory
Fetch products from Shopify and sync to local inventory.

**Request:**
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shpat_...",
  "locationMapping": {}
}
```

**Response:**
```json
{
  "success": true,
  "synced": 150,
  "total": 150,
  "message": "Successfully synced 150 items from Shopify"
}
```

### GET/POST /api/shopify/settings
Get or save Shopify configuration settings.

## Security

- ✅ Access tokens are stored encrypted in the database
- ✅ Tokens are never sent in GET responses
- ✅ All endpoints require JWT authentication
- ✅ HTTPS recommended for production use

## Troubleshooting

### Connection Test Fails

**Error: "Invalid API credentials"**
- Verify your access token starts with `shpat_`
- Ensure the custom app is installed in your Shopify store
- Check that required API scopes are enabled

**Error: "Shop not found"**
- Verify your shop name is correct
- Use format: `mystore.myshopify.com` (not custom domain)

### Sync Issues

**Some products not syncing**
- Check that products have SKUs assigned
- Verify products are not archived in Shopify
- Review sync error messages in the results

**Location distribution not showing**
- Ensure "Sync location inventory levels" is checked
- Verify Shopify locations are set up correctly
- Check that inventory is tracked in Shopify

## Running the Migration

To enable Shopify integration on your server:

```bash
cd server
node run-migrations.js
```

This will execute migration `011_add_shopify_support.sql` and add the required database fields.

## Best Practices

1. **Initial Sync**: Run during off-peak hours for large inventories
2. **Regular Updates**: Schedule daily or weekly syncs to keep data fresh
3. **SKU Management**: Ensure all Shopify products have unique SKUs
4. **Review Results**: Always check sync results for errors
5. **Backup First**: Export your current inventory before first sync

## Limitations

- Maximum 2500 products per sync (10 pages × 250 products)
- Sync is one-way (Shopify → Local only)
- Does not update Shopify inventory from local changes
- Product images are not synced

## Future Enhancements

Potential future features:
- Two-way sync (update Shopify from local changes)
- Scheduled automatic syncs
- Product image import
- Order integration
- Customer data sync
- Inventory adjustment push to Shopify

## Support

For issues or questions:
1. Check this guide first
2. Review the browser console for JavaScript errors
3. Check server logs for API errors
4. Verify database migration ran successfully
5. Test connection with Shopify admin panel access

---

**Version:** 1.0  
**Last Updated:** April 4, 2026  
**Migration:** 011_add_shopify_support.sql
