-- Run this in Supabase Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS public.event_bookings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                text NOT NULL,
    event_name              text NOT NULL,
    user_id                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name           text NOT NULL,
    customer_email          text NOT NULL,
    customer_phone          text NOT NULL,
    ticket_quantity         integer NOT NULL DEFAULT 1,
    ticket_price            numeric(10, 2) NOT NULL DEFAULT 2500,
    base_amount             numeric(10, 2) NOT NULL DEFAULT 2500,
    gst_percentage          numeric(5, 2) NOT NULL DEFAULT 5,
    gst_amount              numeric(10, 2) NOT NULL DEFAULT 125,
    total_amount            numeric(10, 2) NOT NULL DEFAULT 2625,
    currency                text NOT NULL DEFAULT 'INR',
    razorpay_order_id       text NOT NULL UNIQUE,
    razorpay_payment_id     text,
    payment_status          text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'SUCCESS', 'FAILED')),
    booking_status          text NOT NULL DEFAULT 'PENDING' CHECK (booking_status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column additions for existing installations
ALTER TABLE public.event_bookings ADD COLUMN IF NOT EXISTS ticket_quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.event_bookings ADD COLUMN IF NOT EXISTS ticket_price numeric(10, 2) NOT NULL DEFAULT 2500;

CREATE INDEX IF NOT EXISTS idx_event_bookings_event_id ON public.event_bookings (event_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_user_id ON public.event_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_customer_email ON public.event_bookings (customer_email);
CREATE INDEX IF NOT EXISTS idx_event_bookings_razorpay_order_id ON public.event_bookings (razorpay_order_id);

ALTER TABLE public.event_bookings ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own bookings
DROP POLICY IF EXISTS "Users can read their own event bookings" ON public.event_bookings;
CREATE POLICY "Users can read their own event bookings"
ON public.event_bookings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins full access
DROP POLICY IF EXISTS "Admins have full access to event bookings" ON public.event_bookings;
CREATE POLICY "Admins have full access to event bookings"
ON public.event_bookings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role full access
GRANT ALL ON public.event_bookings TO service_role;

