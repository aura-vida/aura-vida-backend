import { supabase } from '../config/supabase.js';

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * PRAC-001: List all published practitioners (public)
 */
export const listPractitioners = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('practitioners')
        .select('*', { count: 'exact' })
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

    if (filters.craft) query = query.eq('craft', filters.craft);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.bookable) query = query.eq('bookable', filters.bookable === 'true');

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

/**
 * PRAC-002: Get a single practitioner profile by slug (public)
 */
export const getPractitionerBySlug = async (slug) => {
    const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error) throw error;
    return data;
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * PRAC-003: Create a new practitioner (admin only)
 */
export const createPractitioner = async (fields) => {
    const { data, error } = await supabase
        .from('practitioners')
        .insert([fields])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * PRAC-004: Update a practitioner by ID (admin only)
 */
export const updatePractitionerById = async (id, fields) => {
    const { data, error } = await supabase
        .from('practitioners')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const notFoundError = new Error('Practitioner not found. Make sure you passed the Practitioner ID, not a User Profile ID!');
        notFoundError.statusCode = 404;
        throw notFoundError;
    }
    return data;
};

/**
 * PRAC-005: Delete/deactivate a practitioner by ID (admin only)
 * Soft-deletes by setting is_published = false to retain booking history.
 */
export const deactivatePractitioner = async (id) => {
    const { data, error } = await supabase
        .from('practitioners')
        .update({ is_published: false, bookable: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * PRAC-008: Activate/deactivate a practitioner by ID (PATCH /api/admin/practitioners/:id/status)
 */
export const updatePractitionerStatus = async (id, isActive) => {
    const { data, error } = await supabase
        .from('practitioners')
        .update({ is_published: isActive, bookable: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Practitioner not found'), { statusCode: 404 });
    return data;
};

/**
 * PRAC-009: Assign services to practitioner (PATCH /api/admin/practitioners/:id/services)
 */
export const assignPractitionerServices = async (id, serviceIds = []) => {
    // 1. Ensure practitioner exists
    const { data: prac, error: pracErr } = await supabase
        .from('practitioners')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (pracErr) throw pracErr;
    if (!prac) throw Object.assign(new Error('Practitioner not found'), { statusCode: 404 });

    // 2. Delete all existing mappings
    const { error: deleteErr } = await supabase
        .from('practitioner_services')
        .delete()
        .eq('practitioner_id', id);

    if (deleteErr) throw deleteErr;

    // 3. Insert new ones
    if (serviceIds.length > 0) {
        const rows = serviceIds.map(serviceId => ({
            practitioner_id: id,
            service_id: serviceId
        }));

        const { error: insertErr } = await supabase
            .from('practitioner_services')
            .insert(rows);

        if (insertErr) throw insertErr;
    }

    return { practitioner_id: id, services: serviceIds };
};

// ─── Practitioner Self-Service ────────────────────────────────────────────────

/**
 * PRAC-006: Get own practitioner profile (practitioner only)
 */
export const getOwnPractitionerProfile = async (practitionerSlug) => {
    const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('slug', practitionerSlug)
        .single();

    if (error) throw error;
    return data;
};

/**
 * PRAC-007: Update own practitioner profile (practitioner only)
 * Practitioners cannot change their slug, sort_order, is_published, or bookable status.
 */
export const updateOwnPractitionerProfile = async (practitionerSlug, fields) => {
    const allowedFields = ['name', 'bio', 'city', 'craft', 'price_inr', 'image_url', 'calendly_link', 'base_lat', 'base_lng', 'base_address', 'pincode'];
    const sanitized = {};
    for (const key of allowedFields) {
        if (fields[key] !== undefined) sanitized[key] = fields[key];
    }

    const { data, error } = await supabase
        .from('practitioners')
        .update({ ...sanitized, updated_at: new Date().toISOString() })
        .eq('slug', practitionerSlug)
        .select()
        .single();

    if (error) throw error;
    return data;
};
