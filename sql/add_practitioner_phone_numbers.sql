-- Mobile and WhatsApp contact numbers for practitioners. WhatsApp number
-- powers the client-facing "Talk on WhatsApp" click-to-chat link
-- (https://wa.me/<digits>), so existing rows are left NULL rather than
-- backfilled with a guess — the frontend/backend both handle a missing
-- WhatsApp number by hiding the button instead of linking to an invalid URL.
ALTER TABLE public.practitioners
ADD COLUMN IF NOT EXISTS mobile_number text,
ADD COLUMN IF NOT EXISTS whatsapp_number text;
