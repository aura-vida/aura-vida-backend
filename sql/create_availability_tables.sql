-- Run this in Supabase Dashboard → SQL Editor → New Query

-- Practitioner weekly recurring schedule
-- e.g. "Every Monday 9:00-17:00, duration 60 min"
CREATE TABLE IF NOT EXISTS public.availability (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_slug text NOT NULL REFERENCES public.practitioners(slug) ON DELETE CASCADE,
    day_of_week       smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun,1=Mon,...,6=Sat
    start_time        time NOT NULL,
    end_time          time NOT NULL,
    duration_min      int NOT NULL DEFAULT 60,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One-off blocked/unavailable slots (overrides recurring schedule for a specific date+time)
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_slug text NOT NULL REFERENCES public.practitioners(slug) ON DELETE CASCADE,
    exception_date    date NOT NULL,
    start_time        time NOT NULL,
    end_time          time NOT NULL,
    reason            text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (our backend uses service role key which bypasses RLS anyway)
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
