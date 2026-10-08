-- Migration to add location options to practitioners
ALTER TABLE practitioners
ADD COLUMN offers_centre BOOLEAN DEFAULT TRUE,
ADD COLUMN offers_host BOOLEAN DEFAULT FALSE,
ADD COLUMN offers_online BOOLEAN DEFAULT FALSE,
ADD COLUMN application_email TEXT,
ADD COLUMN application_status TEXT DEFAULT 'approved';
