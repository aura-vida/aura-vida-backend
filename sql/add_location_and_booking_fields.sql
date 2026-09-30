-- 1. Add base location fields to the practitioners table
ALTER TABLE practitioners 
ADD COLUMN IF NOT EXISTS base_lat NUMERIC,
ADD COLUMN IF NOT EXISTS base_lng NUMERIC,
ADD COLUMN IF NOT EXISTS base_address TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT;

-- 2. Add meeting_location as a JSONB field to the bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS meeting_location JSONB;
