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

// ─── Admin: List ALL services, active or hidden ────────────────────────────────
// (GET /api/services is public and only returns is_active=true — admins need
// to see hidden/soft-deleted services too, otherwise one hidden by mistake
// becomes permanently unreachable in the admin UI.)
export const adminListServices = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 100));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('services')
        .select('*', { count: 'exact' })
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

// ─── SERVICE-005: Permanently delete a service by ID (admin) ──────────────────
// Safe to hard-delete: no bookings reference services.id directly (bookings
// store a free-text item_id), and practitioner_services.service_id cascades
// on delete. Hiding a service without deleting it is handled separately via
// the "Show on site" (is_active) toggle.
export const deleteServicePermanently = async (id) => {
    const { data, error } = await supabase
        .from('services')
        .delete()
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
