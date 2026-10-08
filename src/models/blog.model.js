import { supabase } from '../config/supabase.js';

// ─── BLOG helpers ─────────────────────────────────────────────────────────────
const generateSlug = (title) =>
    title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const listBlogs = async (page, limit, options = {}) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = supabase
        .from('blogs')
        .select('*', { count: 'exact' });

    if (options.status) {
        query = query.eq('status', options.status);
    } else if (!options.allStatus) {
        query = query.eq('status', 'published');
    }

    if (options.author_id) {
        query = query.eq('author_id', options.author_id);
    }

    if (options.practitioner_slug) {
        const { data: prof } = await supabase
            .from('profiles')
            .select('id')
            .eq('practitioner_slug', options.practitioner_slug)
            .maybeSingle();
        if (prof?.id) {
            query = query.eq('author_id', prof.id);
        } else {
            return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
        }
    }

    if (options.category) {
        query = query.eq('category', options.category);
    }

    const { data, count, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });

    if (error) throw error;

    const authorIds = [...new Set((data || []).map((b) => b.author_id).filter(Boolean))];
    let profilesMap = {};
    if (authorIds.length > 0) {
        const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, practitioner_slug, avatar_url')
            .in('id', authorIds);
        (profs || []).forEach((p) => {
            profilesMap[p.id] = p;
        });
    }

    const enriched = (data || []).map((b) => ({
        ...b,
        author: profilesMap[b.author_id] || null,
        practitioner_slug: profilesMap[b.author_id]?.practitioner_slug || null,
    }));

    return { data: enriched, pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) } };
};

export const getBlogBySlug = async (slug) => {
    const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('slug', slug)
        .single();
    if (error) throw error;
    if (data && data.author_id) {
        const { data: prof } = await supabase
            .from('profiles')
            .select('id, full_name, practitioner_slug, avatar_url')
            .eq('id', data.author_id)
            .maybeSingle();
        data.author = prof || null;
        data.practitioner_slug = prof?.practitioner_slug || null;
    }
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

export const deleteBlog = async (id) => {
    const { data, error } = await supabase
        .from('blogs')
        .delete()
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};
