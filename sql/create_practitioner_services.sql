-- Drop the old table that referenced auth.users instead of practitioners
DROP TABLE IF EXISTS public.practitioner_services;

-- Create the correct junction table
CREATE TABLE IF NOT EXISTS public.practitioner_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id UUID REFERENCES public.practitioners(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(practitioner_id, service_id)
);

-- Enable RLS (will be managed securely via service role from Node backend)
ALTER TABLE public.practitioner_services ENABLE ROW LEVEL SECURITY;

-- Allow admin & service_role
CREATE POLICY "Admins have full access to practitioner services"
ON public.practitioner_services FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.practitioner_services TO service_role;
