-- Orders can now be created BEFORE a booking exists (payment-first flow).
-- The booking is only persisted once payment is verified, so we stash the
-- full booking payload on the order and materialize it into `bookings`
-- in markOrderPaidAndConfirmBooking().
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS booking_payload jsonb;
