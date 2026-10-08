-- ===================================================
-- Migration: Create waitlist and partner_spaces tables
-- Add keywords column to practitioners
-- Run this in the Supabase SQL Editor
-- ===================================================

-- 1. Create 'waitlist' table
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create 'partner_spaces' table
CREATE TABLE IF NOT EXISTS partner_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    space_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    capacity INTEGER NOT NULL,
    phone VARCHAR(50),
    space_type VARCHAR(100),
    amenities TEXT[] DEFAULT '{}',
    availability TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add keywords column to practitioners (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='practitioners' AND column_name='keywords'
    ) THEN
        ALTER TABLE practitioners ADD COLUMN keywords TEXT[] DEFAULT '{}';
    END IF;
END $$;
