# Race Team Software V5 — Database Schema

**Database:** PostgreSQL (PlanetScale)  
**Server:** Node.js / Express on Render  
**Last audited:** 9 April 2026 (migration 040)  

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Entity Relationship Summary](#entity-relationship-summary)
3. [Core Tables](#core-tables)
4. [Logistics Tables](#logistics-tables)
5. [Many-to-Many Junction Tables](#many-to-many-junction-tables)
6. [Event & Packing Tables](#event--packing-tables)
7. [Finance Tables](#finance-tables)
8. [Audit & History Tables](#audit--history-tables)
9. [Support & Auth Tables](#support--auth-tables)
10. [Index Reference](#index-reference)
11. [Audit Findings](#audit-findings)

---

## Architecture Overview

```
USERS ──────────────────────────────────────────────────────────┐
                                                                  │ created_by / assigned_to / approved_by
LOCATIONS ◄── boxes.current_location_id                          │
           ◄── items.current_location_id                         ▼
           ◄── inventory.location_id           TASKS ──► EVENTS
           ◄── trucks.current_location_id      NOTES ──► EVENTS
                                               EXPENSES ► EVENTS
EVENTS ◄── load_plans.event_id                RUNBOOKS ► EVENTS
       ◄── event_packing_lists.event_id
       ◄── trucks.current_event_id

TRUCKS ◄── load_plans.truck_id
       └── TRUCK_ZONES (1:M)

LOAD_PLANS ◄──► BOXES  (via load_plan_boxes  M2M)
BOXES      ◄──► ITEMS  (via box_contents      M2M)
BOXES      ◄──► INVENTORY (via box_contents   M2M, item_type='inventory')
BOXES      ──► DRIVERS  (assigned_driver_id  M:1)

PURCHASE_ORDERS ◄──► INVENTORY  (via purchase_order_items  M2M)

EVENT_PACKING_LISTS ──► EVENT_PACKING_ITEMS ──► ITEMS / INVENTORY / BOXES
                    └── EVENT_PACKING_ACTIVITY (audit log)
```

---

## Entity Relationship Summary

| Relationship | Type | Junction / FK |
|---|---|---|
| boxes ↔ items | **M2M** | `box_contents` |
| boxes ↔ inventory | **M2M** | `box_contents` (item_type='inventory') |
| load_plans ↔ boxes | **M2M** | `load_plan_boxes` |
| purchase_orders ↔ inventory | **M2M** | `purchase_order_items` |
| entity ↔ tags | **M2M** (polymorphic) | `entity_tags` |
| event_packing_lists → items | **M2M via** | `event_packing_items.item_id` |
| boxes → drivers | **M:1** | `boxes.assigned_driver_id` |
| trucks → truck_zones | **1:M** | `truck_zones.truck_id` |
| tasks → events | **M:1** | `tasks.event_id` |
| expenses → events | **M:1** | `expenses.event_id` |
| notes → events | **M:1** | `notes.event_id` |
| items → locations | **M:1** | `items.current_location_id` |
| items → boxes | **M:1** (current) | `items.current_box_id` |
| drivers → users | **M:1** | `drivers.user_id` |
| documents → any entity | **M:1** | typed FK columns |
| alerts → any entity | **M:1** | typed FK columns |

---

## Core Tables

### `users`
The authentication and team member table. Referenced by almost every other table for created_by / approved_by / assigned_to.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `username` | VARCHAR(100) | UNIQUE NOT NULL |
| `email` | VARCHAR(255) | UNIQUE NOT NULL |
| `full_name` | VARCHAR(255) | |
| `role` | VARCHAR(50) | DEFAULT 'user' |
| `is_active` | BOOLEAN | DEFAULT TRUE |
| `last_login` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `username`, `email`, `role`

---

### `drivers`
Racing drivers. Linked to users (optional) and to boxes (assigned driver boxes).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `user_id` | VARCHAR(36) | FK → users(id) |
| `license_number` | VARCHAR(100) | |
| `category` | VARCHAR(50) | |
| `racing_class` | VARCHAR(100) | |
| `race_number` | VARCHAR(50) | |
| `team` | VARCHAR(100) | |
| `status` | VARCHAR(50) | CHECK (active/inactive/suspended) NOT NULL |
| `contact_email` | VARCHAR(255) | |
| `contact_phone` | VARCHAR(50) | |
| `guardian_name` | VARCHAR(255) | |
| `guardian_phone` | VARCHAR(50) | |
| `color` | VARCHAR(20) | UI display colour |
| `tags` | TEXT | comma-separated (migrated to entity_tags) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `status`, `category`, `team`, `racing_class`, `race_number`

---

### `events`
Race meetings, test days, promotional events.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `circuit` | VARCHAR(255) | |
| `country` | VARCHAR(100) | |
| `location_id` | VARCHAR(36) | FK → locations(id) ON DELETE SET NULL |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `event_type` | VARCHAR(50) | |
| `status` | VARCHAR(50) | NOT NULL DEFAULT 'scheduled' |
| `notes` | TEXT | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `(start_date, end_date)`, `status`, `location_id`, `created_at DESC`

---

### `locations`
Physical locations — garages, stores, circuits, workshops.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `location_type` | VARCHAR(50) | |
| `address` | TEXT | |
| `city` | VARCHAR(100) | |
| `country` | VARCHAR(100) | |
| `is_active` | BOOLEAN | DEFAULT TRUE |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:** `location_type`, `city`, `country`

---

## Logistics Tables

### `items`
Physical equipment and assets (tools, parts, driver gear).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `barcode` | VARCHAR(100) | UNIQUE NOT NULL |
| `name` | VARCHAR(255) | NOT NULL |
| `item_type` | VARCHAR(50) | |
| `category` | VARCHAR(100) | |
| `serial_number` | VARCHAR(255) | UNIQUE partial (non-null, non-empty) |
| `current_box_id` | VARCHAR(36) | FK → boxes(id) ON DELETE SET NULL |
| `current_location_id` | VARCHAR(36) | FK → locations(id) ON DELETE SET NULL |
| `weight_kg` | DECIMAL(10,2) | NOT NULL DEFAULT 0 |
| `value_usd` | DECIMAL(10,2) | |
| `status` | VARCHAR(50) | CHECK NOT NULL (available/in_use/maintenance/retired/lost/warehouse) |
| `next_maintenance_date` | DATE | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `barcode`, `item_type`, `category`, `current_box_id`, `current_location_id`, `status`, `created_at DESC`, `(item_type, status, created_at DESC)`, `next_maintenance_date` (partial), `name GIN trgm`, `barcode GIN trgm`

---

### `inventory`
Consumable stock items with quantities (tyres, fluids, spares).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `sku` | VARCHAR(100) | UNIQUE |
| `name` | VARCHAR(255) | NOT NULL |
| `category` | VARCHAR(100) | FK → inventory_categories(id) |
| `quantity` | INTEGER | CHECK >= 0 |
| `min_quantity` | INTEGER | |
| `unit_of_measure` | VARCHAR(50) | |
| `location_id` | VARCHAR(36) | FK → locations(id) ON DELETE SET NULL |
| `current_box_id` | VARCHAR(36) | FK → boxes(id) ON DELETE SET NULL |
| `supplier_id` | VARCHAR(36) | FK → suppliers(id) |
| `lead_time_days` | INTEGER | DEFAULT 0 |
| `auto_reorder` | BOOLEAN | DEFAULT false |
| `status` | VARCHAR(50) | NOT NULL |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `category`, `location_id`, `current_box_id`, `(quantity, min_quantity)` partial low-stock, `auto_reorder` partial, `name GIN trgm`

---

### `inventory_categories`
Managed list of inventory categories (replaces hard-coded dropdown).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `sort_order` | INTEGER | DEFAULT 0 |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `sort_order ASC`

---

### `suppliers`
Supplier directory for purchase orders.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | |
| `phone` | TEXT | |
| `lead_time_days` | INTEGER | DEFAULT 0 |
| `vat_number` | TEXT | |
| `account_number` | TEXT | |
| `is_active` | BOOLEAN | DEFAULT TRUE |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `name`, `name` (partial WHERE is_active)

---

### `boxes`
Physical packing boxes / flight cases.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `barcode` | VARCHAR(100) | UNIQUE NOT NULL |
| `name` | VARCHAR(255) | NOT NULL |
| `box_type` | VARCHAR(50) | DEFAULT 'regular' |
| `item_count` | INTEGER | DEFAULT 0, denormalised from trigger |
| `max_weight_kg` | DECIMAL(10,2) | |
| `current_weight_kg` | DECIMAL(10,2) | DEFAULT 0 |
| `current_location_id` | VARCHAR(36) | FK → locations(id) ON DELETE SET NULL |
| `current_truck_id` | VARCHAR(36) | FK → trucks(id) ON DELETE SET NULL |
| `assigned_driver_id` | VARCHAR(36) | FK → drivers(id) ON DELETE SET NULL |
| `current_zone` | VARCHAR(100) | |
| `rfid_tag` | VARCHAR(100) | |
| `status` | VARCHAR(50) | CHECK NOT NULL (available/warehouse/in_use/packed/in_transit/maintenance) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `barcode`, `status`, `current_location_id`, `current_truck_id`, `assigned_driver_id` (partial), `(status, current_location_id, created_at DESC)`, `name GIN trgm`, `barcode GIN trgm`

**Trigger:** `trg_box_contents_sync_status` — auto-sets `status` to `in_use` / `available` when `box_contents` changes.

---

### `trucks`
Transport vehicles (lorries, vans, trailers).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `registration` | VARCHAR(100) | UNIQUE NOT NULL |
| `name` | VARCHAR(255) | |
| `truck_type` | VARCHAR(50) | |
| `dimensions_length_m` | DECIMAL(10,2) | |
| `dimensions_width_m` | DECIMAL(10,2) | |
| `dimensions_height_m` | DECIMAL(10,2) | |
| `max_weight_kg` | DECIMAL(10,2) | |
| `current_location_id` | VARCHAR(36) | FK → locations(id) ON DELETE SET NULL |
| `current_event_id` | VARCHAR(36) | FK → events(id) ON DELETE SET NULL |
| `status` | VARCHAR(50) | NOT NULL |
| `notes` | TEXT | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `registration`, `status`, `current_location_id`, `current_event_id`

---

### `truck_zones`
Named spatial zones within a truck (Front, Middle, Back, Roof etc).

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PK |
| `truck_id` | VARCHAR(36) | FK → trucks(id) ON DELETE CASCADE |
| `zone_name` | VARCHAR(100) | NOT NULL |
| `max_weight_kg` | DECIMAL(10,2) | |
| `max_volume_m3` | DECIMAL(10,3) | |
| `created_at` | TIMESTAMP | |

**Constraints:** UNIQUE(truck_id, zone_name)  
**Indexes:** `truck_id`

---

### `load_plans`
A plan for loading boxes into a truck for a specific event.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `name` | VARCHAR(255) | |
| `event_id` | VARCHAR(36) | FK → events(id) ON DELETE SET NULL |
| `truck_id` | VARCHAR(36) | FK → trucks(id) ON DELETE SET NULL |
| `status` | VARCHAR(50) | DEFAULT 'Draft' |
| `approved_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |
| `departure_time` | TIMESTAMP | |
| `arrival_time` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `event_id`, `truck_id`, `(status, updated_at DESC)`, `(status, truck_id)` partial WHERE Draft, `approved_by_user_id` partial

---

## Many-to-Many Junction Tables

### `box_contents` ★ Primary M2M
Maps which items/inventory are packed in which boxes.

| Column | Type | Constraints |
|---|---|---|
| `box_id` | VARCHAR(36) | FK → boxes(id) ON DELETE CASCADE |
| `item_id` | VARCHAR(36) | FK → items(id) via item_type check |
| `item_type` | VARCHAR(50) | 'item' or 'inventory' — determines which table item_id references |
| `quantity_packed` | INTEGER | DEFAULT 1 (for inventory items) |
| `position_in_box` | INTEGER | |
| `packed_at` | TIMESTAMP | |
| `packed_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |

**PK:** (box_id, item_id)  
**UNIQUE constraint:** `uq_box_contents_box_item`  
**Indexes:** `box_id`, `item_id`, `(item_id, item_type)`, `(box_id, packed_at DESC)`

> **Design note:** `item_id` can reference either `items.id` or `inventory.id`, distinguished by `item_type`. A single FK cannot enforce both. Integrity is maintained at the application layer (box-contents route checks the correct table before inserting).

---

### `load_plan_boxes` ★ Primary M2M
Maps which boxes are assigned to which load plan, with 3D position data.

| Column | Type | Constraints |
|---|---|---|
| `load_plan_id` | VARCHAR(36) | FK → load_plans(id) ON DELETE CASCADE |
| `box_id` | VARCHAR(36) | FK → boxes(id) ON DELETE CASCADE |
| `truck_zone` | VARCHAR(100) | |
| `position_x` | DECIMAL(10,2) | |
| `position_y` | DECIMAL(10,2) | |
| `position_z` | DECIMAL(10,2) | |
| `load_order` | INTEGER | |
| `added_at` | TIMESTAMP | |

**PK:** (load_plan_id, box_id)  
**Indexes:** `(load_plan_id, load_order)`, `(box_id, added_at DESC)`

---

### `purchase_order_items` ★ M2M
Maps inventory lines to purchase orders (replaces old TEXT blob in purchase_orders.items).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `po_id` | VARCHAR(36) | FK → purchase_orders(id) ON DELETE CASCADE |
| `inventory_id` | VARCHAR(36) | FK → inventory(id) ON DELETE SET NULL |
| `description` | VARCHAR(255) | fallback if inventory item deleted |
| `quantity` | INTEGER | CHECK > 0 |
| `unit_price` | DECIMAL(10,2) | |
| `created_at` | TIMESTAMP | |

**Indexes:** `po_id`, `inventory_id`

---

### `entity_tags` ★ Polymorphic M2M
Tags applied to any entity type. Polymorphic design — FK cannot be enforced at DB level.

| Column | Type | Constraints |
|---|---|---|
| `entity_type` | VARCHAR(20) | CHECK (task/note/runbook/item/box/driver/event) |
| `entity_id` | VARCHAR(36) | |
| `tag` | VARCHAR(100) | |
| `created_at` | TIMESTAMP | |

**PK:** (entity_type, entity_id, tag)  
**Indexes:** `tag`, `(entity_type, entity_id)`

> **Design note:** Because entity_id can reference 7 different tables, DB-level FK enforcement is not possible. Orphan cleanup should be handled when the parent entity is deleted (application layer).

---

## Event & Packing Tables

### `event_packing_lists`
Master checklist for a race event — what needs to be packed and when.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `event_id` | VARCHAR(36) | FK → events(id) ON DELETE CASCADE NOT NULL |
| `name` | VARCHAR(255) | NOT NULL |
| `status` | VARCHAR(50) | draft/in_progress/packed/loaded/complete |
| `packing_deadline` | TIMESTAMP | |
| `loading_time` | TIMESTAMP | |
| `departure_time` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:** `event_id`, `status`

---

### `event_packing_items`
Individual line items on a packing list — links to items, inventory, and boxes.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `packing_list_id` | VARCHAR(36) | FK → event_packing_lists(id) ON DELETE CASCADE |
| `item_id` | VARCHAR(36) | FK → items(id) ON DELETE SET NULL |
| `inventory_id` | VARCHAR(36) | FK → inventory(id) ON DELETE SET NULL |
| `box_id` | VARCHAR(36) | FK → boxes(id) ON DELETE SET NULL |
| `item_name` | VARCHAR(255) | NOT NULL (denorm name in case FK is null) |
| `quantity` | INTEGER | DEFAULT 1 |
| `status` | VARCHAR(50) | pending/in_progress/packed/loaded/missing |
| `priority` | VARCHAR(50) | critical/high/normal/low |
| `packed_quantity` | INTEGER | |
| `issue_reported` | BOOLEAN | DEFAULT false |
| `sort_order` | INTEGER | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:** `packing_list_id`, `(packing_list_id, category)`, `(packing_list_id, status)`, `(packing_list_id, priority)`, `box_id`, `packing_list_id` WHERE pending (partial)

---

### `event_packing_activity`
Append-only audit feed of all packing actions (WhatsApp-style activity stream).

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `packing_list_id` | VARCHAR(36) | FK → event_packing_lists(id) ON DELETE CASCADE |
| `packing_item_id` | VARCHAR(36) | FK → event_packing_items(id) ON DELETE CASCADE |
| `action_type` | VARCHAR(50) | NOT NULL |
| `action_by` | VARCHAR(36) | |
| `action_at` | TIMESTAMP | |
| `details` | JSONB | |
| `whatsapp_message_id` | VARCHAR(255) | |
| `created_at` | TIMESTAMP | |

**Indexes:** `(packing_list_id, action_at DESC)`, `packing_item_id`, `whatsapp_message_id` partial

---

## Finance Tables

### `expenses`
Team expenses — linked to events and users.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `description` | VARCHAR(255) | NOT NULL |
| `amount` | DECIMAL(10,2) | NOT NULL |
| `currency` | VARCHAR(3) | DEFAULT 'USD' |
| `event_id` | VARCHAR(36) | FK → events(id) ON DELETE SET NULL |
| `date` | DATE | NOT NULL |
| `paid_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |
| `approved_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |
| `status` | VARCHAR(50) | NOT NULL CHECK (pending/approved/rejected/paid) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `event_id`, `date`, `status`, `category`, `created_at DESC`

---

### `purchase_orders`
Orders placed with suppliers. Line items are in `purchase_order_items`.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `po_number` | VARCHAR(100) | UNIQUE |
| `supplier` | VARCHAR(255) | |
| `status` | VARCHAR(50) | NOT NULL CHECK (draft/sent/confirmed/delivered/cancelled) |
| `total_amount` | DECIMAL(10,2) | |
| `order_date` | DATE | |
| `expected_delivery_date` | DATE | |
| `created_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |
| `approved_by_user_id` | VARCHAR(36) | FK → users(id) ON DELETE SET NULL |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | auto-trigger |

**Indexes:** `po_number`, `status`, `supplier`, `order_date`

---

## Audit & History Tables

### `item_history`
Complete audit trail every time an item changes state or location.

| Column | Type |
|---|---|
| `id` | VARCHAR(36) PK |
| `item_id` | FK → items(id) ON DELETE CASCADE |
| `action` | VARCHAR(50) |
| `from_box_id` / `to_box_id` | VARCHAR(36) |
| `from_location_id` / `to_location_id` | VARCHAR(36) |
| `previous_status` / `new_status` | VARCHAR(50) |
| `performed_by_user_id` | FK → users(id) ON DELETE SET NULL |
| `timestamp` | TIMESTAMP |

**Indexes:** `item_id`, `action`, `timestamp`, `(from_box_id, to_box_id)`

---

### `box_history` / `truck_history`
Same pattern as item_history for boxes and trucks respectively.

**Indexes (each):** entity_id, action, timestamp, user, locations

---

### `alerts`
System-generated alerts — maintenance due, capacity warnings, missing items.

| Column | Type | Constraints |
|---|---|---|
| `id` | VARCHAR(36) | PK |
| `alert_type` | VARCHAR(50) | CHECK enum |
| `severity` | VARCHAR(20) | CHECK (low/medium/high/critical) |
| `item_id` | VARCHAR(36) | FK → items(id) |
| `box_id` | VARCHAR(36) | FK → boxes(id) |
| `event_id` | VARCHAR(36) | FK → events(id) |
| `driver_id` | VARCHAR(36) | FK → drivers(id) |
| `truck_id` | VARCHAR(36) | FK → trucks(id) |
| `is_resolved` | BOOLEAN | DEFAULT FALSE |
| `created_at` | TIMESTAMP | |

**Indexes:** `(severity, created_at DESC)` WHERE unresolved, `item_id`, `box_id`, `event_id` (all partial)

---

### `documents`
File attachments linked to any entity — manuals, certificates, photos.

Same typed FK pattern as `alerts`. Indexes on `item_id`, `box_id`, `event_id`, `driver_id` (all partial).

---

## Support & Auth Tables

### `sessions`
Server-side session tokens for authentication.

| Column | Type |
|---|---|
| `token` | VARCHAR(64) PK (HASH index) |
| `user_id` | VARCHAR(50) |
| `username` | VARCHAR(100) |
| `role` | VARCHAR(50) |
| `expires_at` | TIMESTAMP |

**Indexes:** `token` (HASH), `expires_at` (partial)

---

### `settings`
Key/value store for application configuration.

| Column | Type |
|---|---|
| `id` | TEXT PK |
| `data` | JSONB |
| `value_jsonb` | JSONB (added migration 036) |

---

### `collections`
Generic document store for legacy/unstructured data. Being phased out in favour of typed tables.

| Column | Type |
|---|---|
| `collection` | TEXT |
| `id` | TEXT |
| `data` | JSONB |

**PK:** (collection, id)

---

## Index Reference

### Performance Indexes by Query Pattern

| Query | Index Used |
|---|---|
| GET /api/boxes (list) | `idx_boxes_status`, `idx_boxes_location`, `idx_boxes_name_trgm` |
| Boxes LATERAL JOIN for truck | `idx_lpb_box_added (box_id, added_at DESC)` |
| GET /api/boxes?search= | `idx_boxes_name_trgm`, `idx_boxes_barcode_trgm` |
| GET /api/items (list) | `idx_items_created_at`, `idx_items_type_status_created` |
| Dashboard low-stock alert | `idx_inventory_low_stock (qty, min_qty) partial` |
| Dashboard maintenance alert | `idx_items_maintenance_date partial` |
| Load plan draft fetch | `idx_load_plans_status_updated` |
| Load plan truck-specific draft | `idx_load_plans_status_truck (partial Draft)` |
| Session auth lookup | `idx_sessions_token_hash (HASH)` |
| Tag lookup by tag name | `idx_entity_tags_tag` |
| Unresolved alerts | `idx_alerts_unresolved (partial)` |

---

## Audit Findings

### Resolved in migration 040

| # | Gap | Fix |
|---|---|---|
| 1 | `load_plan_boxes.load_plan_id` — no FK | Added FK → load_plans(id) CASCADE |
| 2 | `load_plan_boxes.box_id` — no FK | Added FK → boxes(id) CASCADE |
| 3 | `load_plans.event_id` — no FK | Added FK → events(id) SET NULL |
| 4 | `load_plans.truck_id` — no FK | Added FK → trucks(id) SET NULL |
| 5 | `load_plans.approved_by_user_id` — no FK, no index | Added FK + partial index |
| 6 | `trucks.current_location_id` — no FK | Added FK → locations(id) SET NULL |
| 7 | `trucks.current_event_id` — no FK | Added FK → events(id) SET NULL |
| 8 | `truck_zones.truck_id` — no FK | Added FK → trucks(id) CASCADE |
| 9 | `suppliers` — no active-only index | Added partial index on is_active |
| 10 | `inventory_categories` — no sort_order index | Added index |
| 11 | `documents.driver_id` — no index | Added partial index |

### Resolved in migration 039

| # | Gap | Fix |
|---|---|---|
| 1 | No `pg_trgm` — ILIKE searches were full seqscans | GIN trgm indexes on name/barcode |
| 2 | `load_plan_boxes` — no index for box-to-plan lookup | `idx_lpb_box_added` |
| 3 | `load_plans` — draft lookup seqscan | Status+updated composite index |
| 4 | `items.next_maintenance_date` — seqscan for dashboard | Partial index |
| 5 | `inventory` — low stock seqscan | Partial index on (qty, min_qty) |
| 6 | `box_contents(item_id, item_type)` — missing composite | Added |

### Known design limitations (by design)

| Item | Reason |
|---|---|
| `entity_tags` FK not enforceable | Polymorphic pattern — 7 possible parent tables |
| `box_contents.item_id` dual-reference | Points to items OR inventory via item_type; DB FK only enforceable for one table at a time |
| `sessions.user_id` no FK | Auth tokens use a separate user_id space (VARCHAR(50)) allowing external auth providers |
| `event_packing_items.packed_by` no FK | Allows external WhatsApp users who have no system account |
