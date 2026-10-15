-- Practitioner Rating System overhaul
-- - reviews.practitioner_id incorrectly referenced auth.users(id) instead of
--   practitioners(id); the reviews table has 0 rows today so this is safe to fix.
-- - practitioners.rating now defaults to 0 (was 5.0) for practitioners with no reviews yet.
-- - A trigger keeps practitioners.rating in sync with the average of their reviews,
--   so it can never be set manually again (enforced here, and in the app layer too).

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_practitioner_id_fkey;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_practitioner_id_fkey
  FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;

ALTER TABLE public.practitioners ALTER COLUMN rating SET DEFAULT 0;

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
  SET rating = COALESCE(
    (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE practitioner_id = target_id),
    0
  )
  WHERE id = target_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_recalculate_rating ON public.reviews;
CREATE TRIGGER reviews_recalculate_rating
AFTER INSERT OR DELETE OR UPDATE OF rating ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalculate_practitioner_rating();

-- One-time correction: every practitioner currently has a manually-typed
-- rating with zero real reviews behind it. Reset all of them to 0 so the
-- displayed number always reflects actual customer feedback going forward.
UPDATE public.practitioners SET rating = 0;

NOTIFY pgrst, 'reload schema';
