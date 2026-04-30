const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/locations — list active locations
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, location_type AS type, city, bay_identifier
       FROM locations
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    res.json({ success: true, locations: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
