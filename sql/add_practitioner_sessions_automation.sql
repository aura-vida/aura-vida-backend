-- This migration is self-contained and safe to run whether or not
-- add_practitioner_rating_automation.sql was ever applied — verified live
-- that it was NOT (reviews.practitioner_id's FK still pointed at auth.users,
-- so review submission was failing outright with a foreign-key violation).
-- Re-running the already-applied statements below is harmless (IF EXISTS /
-- OR REPLACE / idempotent checks throughout).

-- 1. Fix reviews.practitioner_id to reference practitioners(id), not
--    auth.users(id) — safe, the reviews table has 0 real rows.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_practitioner_id_fkey;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_practitioner_id_fkey
  FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;

-- 2. New practitioners start with no rating/sessions until customers
--    actually review them.
ALTER TABLE public.practitioners ALTER COLUMN rating SET DEFAULT 0;
ALTER TABLE public.practitioners ALTER COLUMN sessions SET DEFAULT 0;

-- 3. Auto-recalculate both rating (average) and sessions (count) from a
--    practitioner's reviews whenever one is inserted, updated, or deleted —
--    this is the only place either column should ever change going forward.
CREATE OR REPLACE FUNCTION public.recalculate_practitioner_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := COALESCE(NEW.practitioner_id, OLD.practitioner_id);
  UPDATE public.practitioners
  SET
    rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE practitioner_id = target_id), 0),
    sessions = (SELECT COUNT(*) FROM public.reviews WHERE practitioner_id = target_id)
  WHERE id = target_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_recalculate_rating ON public.reviews;
CREATE TRIGGER reviews_recalculate_rating
AFTER INSERT OR DELETE OR UPDATE OF rating ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalculate_practitioner_rating();

-- 4. One-time correction: every practitioner's rating/sessions were
--    manually-typed numbers with zero real reviews behind them — reset both
--    to 0 so they reflect reality going forward.
UPDATE public.practitioners SET rating = 0, sessions = 0;

-- 5. Enforce one review per booking at the database level — nothing
--    enforced this before. NULL booking_id is unaffected (Postgres allows
--    multiple NULLs in a UNIQUE column).
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_booking_id_unique;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_booking_id_unique UNIQUE (booking_id);

NOTIFY pgrst, 'reload schema';
