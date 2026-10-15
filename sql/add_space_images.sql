-- Photo gallery support for partner spaces (one space -> many images).
CREATE TABLE IF NOT EXISTS public.space_images (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id      UUID NOT NULL REFERENCES public.partner_spaces(id) ON DELETE CASCADE,
    image_url     TEXT NOT NULL,
    storage_path  TEXT NOT NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_images_space_id_idx ON public.space_images (space_id, sort_order);

ALTER TABLE public.space_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to space images"
ON public.space_images FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view space images"
ON public.space_images FOR SELECT TO anon, authenticated
USING (true);

NOTIFY pgrst, 'reload schema';
