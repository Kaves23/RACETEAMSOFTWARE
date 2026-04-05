-- Migration 019: Add WhatsApp tracking columns to event_packing tables

-- Add whatsapp_message_id to event_packing_items if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'event_packing_items' 
        AND column_name = 'whatsapp_message_id'
    ) THEN
        ALTER TABLE event_packing_items 
        ADD COLUMN whatsapp_message_id TEXT;
    END IF;
END $$;

-- Add whatsapp_phone to event_packing_activity if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'event_packing_activity' 
        AND column_name = 'whatsapp_phone'
    ) THEN
        ALTER TABLE event_packing_activity 
        ADD COLUMN whatsapp_phone TEXT;
    END IF;
END $$;

-- Create index on whatsapp_message_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_packing_items_whatsapp_message_id 
ON event_packing_items(whatsapp_message_id);

-- Create index on whatsapp_phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_packing_activity_whatsapp_phone 
ON event_packing_activity(whatsapp_phone);
