import { supabase } from '../config/supabase.js';

// ─── BLOG helpers ─────────────────────────────────────────────────────────────
const generateSlug = (title) =>
    title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const listBlogs = async (page, limit) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await supabase
        .from('blogs')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .range(from, to)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const getBlogBySlug = async (slug) => {
    const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();
    if (error) throw error;
    return data;
};

export const createBlog = async (fields) => {
    const slug = fields.slug || generateSlug(fields.title);
    const { data, error } = await supabase
        .from('blogs')
        .insert([{ ...fields, slug, status: fields.status || 'draft' }])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateBlog = async (id, fields) => {
    if (fields.title && !fields.slug) {
        fields.slug = generateSlug(fields.title);
    }
    const { data, error } = await supabase
        .from('blogs')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Blog not found'), { statusCode: 404 });
    return data;
};
