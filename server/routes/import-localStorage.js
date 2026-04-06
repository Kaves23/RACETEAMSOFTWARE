const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/import-localStorage - Import localStorage data to database
router.post('/', async (req, res, next) => {
  try {
    const { boxes, equipment, assets, boxContents, events, tasks, drivers, staff } = req.body;
    
    const results = {
      boxes: { inserted: 0, updated: 0, errors: 0 },
      items: { inserted: 0, updated: 0, errors: 0 },
      boxContents: { inserted: 0, updated: 0, errors: 0 },
      events: { inserted: 0, updated: 0, errors: 0 },
      tasks: { inserted: 0, updated: 0, errors: 0 },
      drivers: { inserted: 0, updated: 0, errors: 0 },
      staff: { inserted: 0, updated: 0, errors: 0 }
    };

    // Import Boxes
    if (boxes && boxes.length > 0) {
      for (const box of boxes) {
        try {
          const query = `
            INSERT INTO boxes (
              id, barcode, name, 
              dimensions_length_cm, dimensions_width_cm, dimensions_height_cm,
              max_weight_kg, current_weight_kg, 
              current_location_id, current_truck_id, current_zone,
              rfid_tag, status, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (barcode) DO UPDATE SET
              name = EXCLUDED.name,
              dimensions_length_cm = EXCLUDED.dimensions_length_cm,
              dimensions_width_cm = EXCLUDED.dimensions_width_cm,
              dimensions_height_cm = EXCLUDED.dimensions_height_cm,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;
          
          const values = [
            box.id || box.barcode || `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            box.barcode || box.id,
            box.name,
            box.length || 0,
            box.width || 0,
            box.height || 0,
            box.maxWeight || null,
            box.currentWeight || 0,
            box.locationId || null,
            box.truckId || null,
            box.zone || null,
            box.rfidTag || null,
            box.status || 'warehouse',
            box.createdAt || new Date().toISOString()
          ];
          
          const result = await pool.query(query, values);
          if (result.rows[0].inserted) {
            results.boxes.inserted++;
          } else {
            results.boxes.updated++;
          }
        } catch (error) {
          console.error('Error importing box:', error.message);
          results.boxes.errors++;
        }
      }
    }

    // Import Items (Equipment + Assets)
    const allItems = [
      ...(equipment || []).map(item => ({ ...item, type: 'equipment' })),
      ...(assets || []).map(item => ({ ...item, type: 'asset' }))
    ];

    if (allItems.length > 0) {
      for (const item of allItems) {
        try {
          const query = `
            INSERT INTO items (
              id, barcode, name, item_type, category, description,
              current_box_id, current_location_id,
              last_maintenance_date, next_maintenance_date,
              weight_kg, value_usd, serial_number, status, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (barcode) DO UPDATE SET
              name = EXCLUDED.name,
              item_type = EXCLUDED.item_type,
              category = EXCLUDED.category,
              description = EXCLUDED.description,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;
          
          const values = [
            item.id || item.barcode || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            item.barcode || item.id,
            item.name,
            item.type || 'asset',
            item.category || null,
            item.description || null,
            item.boxId || null,
            item.locationId || null,
            item.lastMaintenance || null,
            item.nextMaintenance || null,
            item.weight || null,
            item.value || null,
            item.serialNumber || null,
            item.status || 'available',
            item.createdAt || new Date().toISOString()
          ];
          
          const result = await pool.query(query, values);
          if (result.rows[0].inserted) {
            results.items.inserted++;
          } else {
            results.items.updated++;
          }
        } catch (error) {
          console.error('Error importing item:', error.message);
          results.items.errors++;
        }
      }
    }

    // Import Box Contents
    if (boxContents && boxContents.length > 0) {
      for (const content of boxContents) {
        try {
          const query = `
            INSERT INTO box_contents (
              box_id, item_id, quantity, added_at
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (box_id, item_id) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;
          
          const values = [
            content.boxId,
            content.itemId,
            content.quantity || 1,
            content.addedAt || new Date().toISOString()
          ];
          
          const result = await pool.query(query, values);
          if (result.rows[0].inserted) {
            results.boxContents.inserted++;
          } else {
            results.boxContents.updated++;
          }
        } catch (error) {
          console.error('Error importing box content:', error.message);
          results.boxContents.errors++;
        }
      }
    }

    // Import Drivers
    if (drivers && drivers.length > 0) {
      for (const driver of drivers) {
        try {
          // Handle both object and string formats
          const driverName = typeof driver === 'string' ? driver : (driver.name || 'Unnamed Driver');
          
          const query = `
            INSERT INTO drivers (
              id, name, license_number, license_expiry,
              phone, email, emergency_contact, emergency_phone,
              blood_type, medical_notes, address,
              insurance_provider, insurance_policy,
              is_active, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              license_number = EXCLUDED.license_number,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;
          
          const values = [
            driver.id || `driver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            driverName,
            driver.license_number || driver.licenseNumber || null,
            driver.license_expiry || driver.licenseExpiry || null,
            driver.phone || null,
            driver.email || null,
            driver.emergency_contact || driver.emergencyContact || null,
            driver.emergency_phone || driver.emergencyPhone || null,
            driver.blood_type || driver.bloodType || null,
            driver.medical_notes || driver.medicalNotes || null,
            driver.address || null,
            driver.insurance_provider || driver.insuranceProvider || null,
            driver.insurance_policy || driver.insurancePolicy || null,
            driver.is_active !== false && driver.active !== false,
            driver.created_at || driver.createdAt || new Date().toISOString()
          ];
          
          const result = await pool.query(query, values);
          if (result.rows[0].inserted) {
            results.drivers.inserted++;
          } else {
            results.drivers.updated++;
          }
        } catch (error) {
          console.error('Error importing driver:', error.message);
          results.drivers.errors++;
        }
      }
    }

    // Import Staff
    if (staff && staff.length > 0) {
      for (const member of staff) {
        try {
          const staffName = typeof member === 'string' ? member : (member.name || 'Unnamed Staff');
          
          const query = `
            INSERT INTO staff (
              id, name, role, email, phone, emergency_contact,
              hourly_rate, is_active, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `;
          
          const values = [
            member.id || `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            staffName,
            member.role || null,
            member.email || null,
            member.phone || null,
            member.emergency_contact || member.emergencyContact || null,
            member.hourly_rate || member.hourlyRate || null,
            member.is_active !== false && member.active !== false,
            member.created_at || member.createdAt || new Date().toISOString()
          ];
          
          const result = await pool.query(query, values);
          if (result.rows[0].inserted) {
            results.staff.inserted++;
          } else {
            results.staff.updated++;
          }
        } catch (error) {
          console.error('Error importing staff:', error.message);
          results.staff.errors++;
        }
      }
    }

    res.json({ 
      success: true, 
      message: 'Data imported successfully',
      results 
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
