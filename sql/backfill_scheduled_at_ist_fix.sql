-- ONE-TIME BACKFILL — already applied directly via the service-role client on
-- 2026-10-13. Kept here for the record / in case it ever needs to be re-run
-- against another environment.
--
-- Bug: every `bookings.scheduled_at` was written by code that treated the
-- IST wall-clock date/time the user picked in the UI as if it were already
-- UTC (appending "Z" instead of converting from +05:30), so every stored
-- timestamp was 5 hours 30 minutes AHEAD of the correct UTC instant.
-- Fixed in src/controllers/payment.controller.js, appointment.controller.js,
-- and src/models/availability.model.js (see src/utils/timezone.js).
--
-- This corrects all existing rows written under the old (buggy) code to the
-- UTC instant that was actually intended.
UPDATE public.bookings
SET scheduled_at = scheduled_at - interval '5 hours 30 minutes'
WHERE scheduled_at IS NOT NULL;
