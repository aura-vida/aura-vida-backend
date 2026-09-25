-- Run this in Supabase Dashboard → SQL Editor → New Query

-- Add calendly_link to practitioners table
ALTER TABLE public.practitioners
ADD COLUMN IF NOT EXISTS calendly_link text;

-- Example: Update existing practitioner
-- UPDATE public.practitioners SET calendly_link = 'https://calendly.com/alex-yoga' WHERE slug = 'alex-practitioner';
