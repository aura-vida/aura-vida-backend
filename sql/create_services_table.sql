-- Run this in Supabase Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS public.services (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    description     text,
    duration_min    int NOT NULL DEFAULT 60,
    price_inr       numeric(10, 2) NOT NULL DEFAULT 0,
    category        text,
    image_url       text,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
