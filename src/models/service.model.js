import { supabase } from '../config/supabase.js';

// ─── SERVICE-001: List all active services (public) ───────────────────────────
export const listServices = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('services')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (filters.category) query = query.eq('category', filters.category);

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

// ─── SERVICE-002: Get a single service by ID (public) ─────────────────────────
export const getServiceById = async (id) => {
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const err = new Error('Service not found.');
        err.statusCode = 404;
        throw err;
    }
    return data;
};

// ─── SERVICE-003: Create a service (admin) ────────────────────────────────────
export const createService = async (fields) => {
    const { data, error } = await supabase
        .from('services')
        .insert([fields])
        .select()
        .single();

    if (error) throw error;
    return data;
};

// ─── SERVICE-004: Update a service by ID (admin) ──────────────────────────────
export const updateServiceById = async (id, fields) => {
    const { data, error } = await supabase
        .from('services')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const err = new Error('Service not found.');
        err.statusCode = 404;
        throw err;
    }
    return data;
};

// ─── SERVICE-005: Soft-delete a service by ID (admin) ─────────────────────────
export const deactivateService = async (id) => {
    const { data, error } = await supabase
        .from('services')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const err = new Error('Service not found.');
        err.statusCode = 404;
        throw err;
    }
    return data;
};
