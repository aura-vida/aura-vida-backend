-- The profiles_guard_slug trigger (BEFORE UPDATE on public.profiles) exists to
-- stop a client from self-assigning a practitioner_slug on their own profile.
-- Its sibling, profiles_guard_slug_insert, already skips enforcement for the
-- backend's service-role client via a WHEN clause — this UPDATE trigger never
-- got the same exception, so it has been silently reverting every attempt to
-- link a new practitioner's profiles.practitioner_slug, even from the backend
-- itself. That breaks their Guide Portal dashboard (profile, appointments,
-- etc. all resolve via this column).
DROP TRIGGER IF EXISTS profiles_guard_slug ON public.profiles;
CREATE TRIGGER profiles_guard_slug BEFORE UPDATE ON public.profiles
  FOR EACH ROW WHEN (current_setting('role', true) <> 'service_role')
  EXECUTE FUNCTION public.guard_practitioner_slug();

-- One-time repair: backfill practitioner_slug for any existing practitioner
-- whose profile never got linked because of the bug above. Matches by email
-- (auth.users <-> practitioners.application_email) and is additionally
-- scoped to accounts already holding the 'practitioner' role, so it can only
-- ever touch genuine practitioner profiles.
UPDATE public.profiles p
SET practitioner_slug = pr.slug
FROM public.practitioners pr
JOIN auth.users au ON lower(au.email) = lower(pr.application_email)
WHERE au.id = p.id
  AND p.practitioner_slug IS NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'practitioner');

NOTIFY pgrst, 'reload schema';
