-- Migration 070: Add NATIS / licence disc document fields to trucks table
-- Created: 26 April 2026

DO $$ BEGIN ALTER TABLE trucks ADD COLUMN vin                      VARCHAR(50);  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN engine_number            VARCHAR(50);  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN licence_number           VARCHAR(50);  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN series                   VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN vehicle_description      VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN vehicle_category         VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN registered_owner         VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN drive_type               VARCHAR(50);  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN tare_weight_kg           DECIMAL(10,1);EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN gvm_kg                   DECIMAL(10,1);EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN licence_disc_paid_date   DATE;         EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN licence_disc_amount_paid DECIMAL(12,2);EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN control_number           VARCHAR(50);  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN registering_authority    VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN nvc                      VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
