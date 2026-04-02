# Extended Database Schema - All Tabs
## Future-Proof Design for Complete Race Team Software

**Current Focus:** Logistics Tab (16 tables)  
**Future Tabs:** 13 additional tabs (50+ more tables)  
**Architecture:** Shared core + tab-specific tables

---

## 🏗️ Shared Core Tables (Used by ALL tabs)

These tables are already in the main schema and will be used by every future tab:

```sql
✅ users - Who performed actions across all tabs
✅ locations - Where things happen (warehouse, track, paddock)
✅ events - Race events that tie everything together
✅ barcodes - Universal tracking system
✅ barcode_scans - Scan history for all physical items
```

---

## 📋 Tab-by-Tab Future Expansion

### **TAB 1: Logistics** (CURRENT - 16 tables)
Status: ✅ Fully designed and ready to implement

Tables:
- `items` - All equipment/assets
- `boxes` - Containers
- `box_contents` - Items in boxes
- `trucks` - Transport vehicles  
- `truck_zones` - Zones within trucks
- `load_plans` - Load planning
- `load_plan_boxes` - Boxes on trucks
- `item_history` - Item audit trail
- `box_history` - Box audit trail
- `truck_history` - Truck audit trail
- `item_maintenance_schedule` - Maintenance tracking
- Plus 5 shared core tables

---

### **TAB 2: Events** (Phase 2)
Estimated: 8 additional tables

```sql
-- Event Management
events (already exists - enhanced)
event_sessions (practice, quali, race, testing)
event_personnel (who attends which event)
event_schedule (detailed timetable)
event_circuits (circuit database)
event_weather (weather conditions)
event_accommodations (hotels, transport)
event_costs (event-specific expenses)

-- Links to Logistics:
- events.id → load_plans.event_id
- events.location_id → locations.id
- event_personnel.user_id → users.id
```

---

### **TAB 3: Drivers** (Phase 2)
Estimated: 10 additional tables

```sql
-- Driver Management
drivers (driver profiles)
driver_contracts (contract details)
driver_performance (race results)
driver_feedback (post-session notes)
driver_fitness (health tracking)
driver_simulator_sessions (sim data)
driver_media_commitments (schedule)
driver_telemetry_preferences (setup preferences)
driver_incidents (on-track incidents)
driver_penalties (FIA penalties)

-- Links to Other Tabs:
- drivers.user_id → users.id
- driver_performance.event_id → events.id
- driver_incidents.event_id → events.id
```

---

### **TAB 4: Strategy** (Phase 3)
Estimated: 12 additional tables

```sql
-- Race Strategy
strategy_plans (race plans)
strategy_scenarios (what-if scenarios)
strategy_pit_stops (pit stop plans)
strategy_tire_allocations (tire strategy)
strategy_fuel_plans (fuel loads)
strategy_weather_impact (weather adjustments)
strategy_competitor_analysis (other teams)
strategy_simulations (Monte Carlo runs)
strategy_real_time_adjustments (live changes)
strategy_outcomes (post-race analysis)
strategy_tire_performance (tire deg data)
strategy_decisions_log (decision audit trail)

-- Links to Other Tabs:
- strategy_plans.event_id → events.id
- strategy_plans.driver_id → drivers.id
- strategy_tire_allocations → items.id (where items.category = 'Tyres')
```

---

### **TAB 5: Forecast** (Phase 3)
Estimated: 6 additional tables

```sql
-- Weather & Predictions
forecast_weather_data (weather API data)
forecast_track_conditions (grip, temp)
forecast_tire_predictions (tire life predictions)
forecast_fuel_predictions (fuel consumption)
forecast_lap_time_predictions (expected pace)
forecast_accuracy_log (how accurate were we?)

-- Links to Other Tabs:
- forecast_weather_data.event_id → events.id
- forecast_tire_predictions → strategy_tire_allocations
```

---

### **TAB 6: Fuel Calcs** (Phase 3)
Estimated: 5 additional tables

```sql
-- Fuel Calculations
fuel_calculations (fuel load calculations)
fuel_consumption_history (historical data)
fuel_lap_adjustments (per-lap burn rate)
fuel_temperature_impact (temp effect on fuel)
fuel_regulation_limits (FIA fuel limits)

-- Links to Other Tabs:
- fuel_calculations.event_id → events.id
- fuel_calculations.strategy_plan_id → strategy_plans.id
```

---

### **TAB 7: Performance** (Phase 4)
Estimated: 15 additional tables (LARGE - telemetry)

```sql
-- Performance Analysis
performance_sessions (session summaries)
performance_laps (lap-by-lap data)
performance_sectors (sector splits)
performance_telemetry_runs (telemetry runs)
performance_telemetry_points (time-series data - HUGE)
performance_setup_changes (car setup changes)
performance_tire_data (tire wear/temp)
performance_brake_data (brake temps/wear)
performance_engine_data (engine parameters)
performance_aero_data (aero balance)
performance_suspension_data (ride height, dampers)
performance_electronics_data (ERS, DRS)
performance_comparisons (driver vs driver)
performance_benchmarks (vs competitors)
performance_reports (summary reports)

-- Special Considerations:
- performance_telemetry_points will be MASSIVE (millions of rows per race)
- May need separate time-series database (InfluxDB) for real-time telemetry
- PlanetScale stores historical/processed data
- Real-time telemetry in memory/InfluxDB → archived to PlanetScale

-- Links to Other Tabs:
- performance_sessions.event_id → events.id
- performance_sessions.driver_id → drivers.id
- performance_laps.strategy_pit_stop_id → strategy_pit_stops.id
```

---

### **TAB 8: Compliance** (Phase 4)
Estimated: 8 additional tables

```sql
-- FIA Compliance & Regulations
compliance_regulations (FIA rules database)
compliance_checks (inspection checklist)
compliance_inspections (inspection results)
compliance_violations (rule violations)
compliance_appeals (appeals process)
compliance_documentation (required docs)
compliance_certifications (part certifications)
compliance_audit_trail (full audit log)

-- Links to Other Tabs:
- compliance_checks.event_id → events.id
- compliance_inspections.item_id → items.id
- compliance_violations.driver_id → drivers.id
```

---

### **TAB 9: Expenses** (Phase 5)
Estimated: 12 additional tables

```sql
-- Financial Management
expenses_budgets (team budgets)
expenses_categories (expense categories)
expenses_transactions (all expenses)
expenses_invoices (supplier invoices)
expenses_purchase_orders (POs)
expenses_suppliers (supplier database)
expenses_cost_centers (cost allocation)
expenses_currency_rates (FX rates)
expenses_reimbursements (staff reimbursements)
expenses_approvals (approval workflow)
expenses_reports (financial reports)
expenses_cost_cap_tracking (FIA cost cap)

-- Links to Other Tabs:
- expenses_transactions.event_id → events.id
- expenses_transactions.item_id → items.id (equipment purchases)
- expenses_transactions.user_id → users.id
```

---

### **TAB 10: Notes** (Phase 5)
Estimated: 5 additional tables

```sql
-- Team Communications
notes (team notes)
notes_categories (note categories)
notes_tags (tagging system)
notes_attachments (files, images)
notes_mentions (@ mentions)

-- Links to Other Tabs:
- notes.event_id → events.id (event-specific notes)
- notes.driver_id → drivers.id (driver notes)
- notes.item_id → items.id (equipment notes)
- notes.created_by_user_id → users.id
```

---

### **TAB 11: Tasks** (Phase 5)
Estimated: 7 additional tables

```sql
-- Task Management
tasks (all tasks)
tasks_assignments (who is assigned)
tasks_dependencies (task dependencies)
tasks_checklists (sub-tasks)
tasks_time_tracking (time spent)
tasks_templates (recurring task templates)
tasks_priorities (priority levels)

-- Links to Other Tabs:
- tasks.event_id → events.id
- tasks.assigned_to_user_id → users.id
- tasks.item_id → items.id (equipment-related tasks)
```

---

### **TAB 12: Runbooks** (Phase 6)
Estimated: 6 additional tables

```sql
-- Procedures & Protocols
runbooks (procedure documents)
runbooks_sections (document sections)
runbooks_steps (step-by-step instructions)
runbooks_history (version control)
runbooks_executions (runbook execution logs)
runbooks_feedback (improvement suggestions)

-- Links to Other Tabs:
- runbooks.category → links to various tabs
- runbooks_executions.event_id → events.id
- runbooks_executions.performed_by_user_id → users.id
```

---

### **TAB 13: Service** (Phase 6)
Estimated: 10 additional tables

```sql
-- Maintenance & Service
service_schedules (maintenance schedules)
service_tasks (maintenance tasks)
service_work_orders (work orders)
service_parts_inventory (service parts)
service_labor (labor hours)
service_suppliers (service suppliers)
service_warranties (warranty tracking)
service_certifications (technician certs)
service_quality_checks (QC checks)
service_failures (failure analysis)

-- Links to Logistics:
- service_tasks.item_id → items.id
- service_parts_inventory.item_id → items.id
- service_work_orders.location_id → locations.id
```

---

### **TAB 14: Incidents** (Phase 6)
Estimated: 8 additional tables

```sql
-- Incident Reporting
incidents (incident reports)
incidents_types (incident categories)
incidents_severity (severity levels)
incidents_witnesses (witness statements)
incidents_evidence (photos, videos)
incidents_investigations (investigation reports)
incidents_corrective_actions (fixes implemented)
incidents_root_cause (root cause analysis)

-- Links to Other Tabs:
- incidents.event_id → events.id
- incidents.driver_id → drivers.id
- incidents.item_id → items.id (equipment failure)
- incidents.reported_by_user_id → users.id
```

---

## 📊 Total Database Size Projection

### Current (Logistics Only):
```
Tables: 16
Estimated rows per year: 50,000
Storage: ~100 MB
```

### Phase 2 (Logistics + Events + Drivers):
```
Tables: 34
Estimated rows per year: 150,000
Storage: ~500 MB
```

### Phase 3 (Add Strategy + Forecast + Fuel):
```
Tables: 57
Estimated rows per year: 500,000
Storage: ~2 GB
```

### Phase 4 (Add Performance + Compliance):
```
Tables: 80
Estimated rows per year: 5,000,000 (telemetry!)
Storage: ~50 GB
```

### Complete System (All 14 Tabs):
```
Tables: 130+
Estimated rows per year: 10,000,000+
Storage: ~100 GB
```

**PlanetScale Can Handle:**
- ✅ Unlimited tables
- ✅ Billions of rows
- ✅ Terabytes of storage
- ✅ Sub-10ms query times even at scale

---

## 🔗 Cross-Tab Relationship Examples

### Example 1: "Where is the impact wrench and who last used it?"
```sql
SELECT 
  i.name,
  i.barcode,
  b.name as current_box,
  l.name as current_location,
  t.name as current_truck,
  u.full_name as last_handled_by,
  ih.timestamp as last_moved
FROM items i
LEFT JOIN boxes b ON i.current_box_id = b.id
LEFT JOIN locations l ON i.current_location_id = l.id
LEFT JOIN trucks t ON b.current_truck_id = t.id
LEFT JOIN item_history ih ON i.id = ih.item_id
LEFT JOIN users u ON ih.performed_by_user_id = u.id
WHERE i.barcode = 'EQ-001'
ORDER BY ih.timestamp DESC
LIMIT 1;
```

### Example 2: "What was our strategy at Monaco and did we execute it?"
```sql
SELECT 
  sp.plan_name,
  sp.status,
  e.name as event_name,
  d.name as driver_name,
  sps.planned_lap,
  sps.actual_lap,
  sps.tire_compound_planned,
  sps.tire_compound_actual,
  pl.lap_time,
  CASE 
    WHEN sps.actual_lap = sps.planned_lap THEN 'On Plan'
    WHEN sps.actual_lap < sps.planned_lap THEN 'Early'
    ELSE 'Late'
  END as execution
FROM strategy_plans sp
JOIN events e ON sp.event_id = e.id
JOIN drivers d ON sp.driver_id = d.id
JOIN strategy_pit_stops sps ON sp.id = sps.strategy_plan_id
LEFT JOIN performance_laps pl ON sps.actual_lap = pl.lap_number
WHERE e.name = 'Monaco Grand Prix 2026';
```

### Example 3: "Track total costs for Singapore GP including all logistics"
```sql
SELECT 
  e.name as event,
  SUM(et.amount) as total_expenses,
  SUM(CASE WHEN et.category = 'Logistics' THEN et.amount ELSE 0 END) as logistics_cost,
  SUM(CASE WHEN et.category = 'Personnel' THEN et.amount ELSE 0 END) as personnel_cost,
  COUNT(DISTINCT lp.id) as load_plans,
  COUNT(DISTINCT lpb.box_id) as boxes_shipped,
  COUNT(DISTINCT bc.item_id) as items_shipped
FROM events e
LEFT JOIN expenses_transactions et ON e.id = et.event_id
LEFT JOIN load_plans lp ON e.id = lp.event_id
LEFT JOIN load_plan_boxes lpb ON lp.id = lpb.load_plan_id
LEFT JOIN box_contents bc ON lpb.box_id = bc.box_id
WHERE e.name = 'Singapore Grand Prix 2026'
GROUP BY e.id;
```

---

## 🎯 Implementation Strategy

### Phase 1 (Month 1): **Logistics Foundation**
- ✅ Set up PlanetScale
- ✅ Create 16 logistics tables
- ✅ Migrate localStorage data
- ✅ Build API endpoints
- ✅ Update frontend

### Phase 2 (Month 2-3): **Expand Core**
- Add Events tables (enhanced)
- Add Drivers tables
- Connect to logistics (items used by drivers)
- Build events UI
- Build drivers UI

### Phase 3 (Month 4-5): **Strategy & Planning**
- Add Strategy tables
- Add Forecast tables
- Add Fuel Calc tables
- Connect to drivers & events
- Build strategy UI

### Phase 4 (Month 6-9): **Performance & Compliance**
- Add Performance tables
- Add Compliance tables
- Implement telemetry ingestion
- Build analysis UI
- Build compliance dashboard

### Phase 5 (Month 10-12): **Operations**
- Add Expenses tables
- Add Notes tables
- Add Tasks tables
- Build financial dashboard
- Build collaboration features

### Phase 6 (Year 2): **Complete System**
- Add Runbooks tables
- Add Service tables
- Add Incidents tables
- Polish all integrations
- Production hardening

---

## ✅ Conclusion

**Database:** PlanetScale MySQL ✅  
**Current Tables:** 16 (Logistics)  
**Future Tables:** 130+ (All tabs)  
**Scalability:** Unlimited ✅  
**Performance:** Sub-10ms ✅  
**Cost:** $39-169/month until massive scale ✅  

**Ready to build!** The schema is designed for the future while focusing on logistics first.
