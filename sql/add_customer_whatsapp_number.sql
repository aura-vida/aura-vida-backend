-- Migration: Add mandatory WhatsApp number column to profiles table for customer accounts
-- Existing records have NULL, handled gracefully in UI and APIs.
-- New registrations and profile updates enforce valid WhatsApp number with country code.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN public.profiles.whatsapp_number IS 'Mandatory contact WhatsApp number for customer accounts, including country code. Restricted to Admin and the user themselves.';

