-- Services move from a shared admin-managed catalog + practitioner_services
-- assignment junction, to each service being owned directly by the
-- practitioner who created it. Nullable (not NOT NULL): a pre-existing
-- service can have real bookings referencing it with no practitioner ever
-- having been assigned — forcing an owner on those would be a guess, not a
-- fact, so they're left as unowned legacy rows (still resolvable by id for
-- historical booking display, just no longer editable by anyone through the
-- UI). Every service created from now on always gets a practitioner_id.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS services_practitioner_id_idx ON public.services (practitioner_id);

-- practitioner_services (the old many-to-many assignment table) is retired —
-- nothing reads or writes it anymore — but intentionally left in place rather
-- than dropped, since it's empty and harmless either way.

NOTIFY pgrst, 'reload schema';
