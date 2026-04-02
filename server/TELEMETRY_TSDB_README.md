# Telemetry TimescaleDB Upgrade (Optional)

This schema migrates telemetry storage from the generic `collections` table to dedicated TimescaleDB tables for high-performance time-series queries.

## What this adds
- `telemetry_uploads`: metadata per upload (driver, session name, tags)
- `telemetry_points`: hypertable of telemetry points keyed by upload and time

## Apply the migration
1. Ensure TimescaleDB is installed on your PostgreSQL instance.
2. Connect with a role that can create extensions.
3. Run the SQL at `server/migrations/002_telemetry.sql`.

## Backend wiring (next step)
The current endpoints store data in the generic collections. To switch:
- Update POST `/api/telemetry/upload` to:
  - Insert a row into `telemetry_uploads` (generate UUID).
  - Bulk insert points into `telemetry_points` with the new `upload_id`.
- Update GET endpoints:
  - `/api/telemetry/uploads`: read from `telemetry_uploads` (filter by `driver_id`).
  - `/api/telemetry/points`: read from `telemetry_points` (filter by `upload_id` or `(driver_id, session_name)`).

Frontend can remain unchanged; it already calls `apiGetTelemetryUploads` and `apiGetTelemetryPoints`.

## Notes
- Creating the extension may require superuser privileges.
- Consider compression policies and retention windows once data volume grows.
- For lap-based queries, add `lap` and `sector` fields to `telemetry_points` and create composite indexes.
