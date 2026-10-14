-- Run this in Supabase Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS public.coupons (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    text NOT NULL UNIQUE,
    discount_percent        numeric(5, 2) NOT NULL DEFAULT 0,
    is_active               boolean NOT NULL DEFAULT true,
    -- Eligibility rules. first_booking_only defaults on (matches LAUNCH10/
    -- LAUNCH20's original behavior); min_booking_amount_inr is null = no
    -- minimum, letting an admin require e.g. a ₹3,000+ booking to redeem.
    first_booking_only      boolean NOT NULL DEFAULT true,
    min_booking_amount_inr  numeric(10, 2),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to coupons"
ON public.coupons FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.coupons TO service_role;

-- Seed the two launch codes that previously lived as hardcoded constants,
-- so existing behavior is preserved once this migration is applied.
INSERT INTO public.coupons (code, discount_percent, is_active)
VALUES
    ('LAUNCH10', 10, true),
    ('LAUNCH20', 20, true)
ON CONFLICT (code) DO NOTHING;
