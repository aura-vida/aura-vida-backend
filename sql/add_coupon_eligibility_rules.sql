-- Configurable eligibility rules for coupons, beyond the fixed
-- first-booking-only behavior coupons originally launched with.
ALTER TABLE public.coupons
ADD COLUMN IF NOT EXISTS first_booking_only boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS min_booking_amount_inr numeric(10, 2);

-- LAUNCH10/LAUNCH20 apply only to a customer's first session, with no
-- minimum booking amount — i.e. regardless of the payment amount.
UPDATE public.coupons
SET first_booking_only = true, min_booking_amount_inr = NULL
WHERE code IN ('LAUNCH10', 'LAUNCH20');
