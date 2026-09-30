-- Add booking_id to orders table (links payment to a specific booking)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Add updated_at for tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Index for fast lookup by booking
CREATE INDEX IF NOT EXISTS orders_booking_id_idx ON public.orders (booking_id);

-- Allow service_role / admin full access (webhook needs to write)
ALTER POLICY "No public access to orders" ON public.orders RENAME TO "No direct customer access to orders";
