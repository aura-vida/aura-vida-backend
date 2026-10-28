import { supabase } from '../config/supabase.js';

// Every session is always 60 minutes — practitioners don't choose a duration
// when creating a service, so it's just forced here rather than exposed as
// an input.
const SESSION_DURATION_MIN = 60;

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

// ─── Admin: List ALL services, active or hidden, read-only ────────────────────
// Admins no longer create/edit services — practitioners own that now — this
// is purely an oversight view, so each row carries who created it.
export const adminListServices = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 100));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('services')
        .select('*, practitioners(id, name, slug)', { count: 'exact' })
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
    if (typeof id === 'string' && id.startsWith('default-')) {
        const practitionerId = id.replace('default-', '');
        const { data: practitioner } = await supabase
            .from('practitioners')
            .select('*')
            .eq('id', practitionerId)
            .maybeSingle();

        if (practitioner) {
            return {
                id,
                practitioner_id: practitioner.id,
                name: `${practitioner.craft || '1:1 Holistic'} Session`,
                description: `Private 1-on-1 session with ${practitioner.name}`,
                duration_min: 60,
                price_inr: practitioner.price_inr || 1500,
                category: practitioner.craft || 'Holistic Healing',
                is_active: true,
            };
        }
    }

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

// ─── Practitioner self-service: list own services (active + hidden) ──────────
export const listServicesByPractitioner = async (practitionerId) => {
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

// ─── Practitioner self-service: create a service they own ────────────────────
export const createServiceForPractitioner = async (practitionerId, fields) => {
    const { data, error } = await supabase
        .from('services')
        .insert([{ ...fields, practitioner_id: practitionerId, duration_min: SESSION_DURATION_MIN }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

// ─── Practitioner self-service: update a service they own ────────────────────
// Scoping the update to practitioner_id (not just id) means a practitioner
// can never modify another practitioner's service, even by guessing an id.
export const updateServiceForPractitioner = async (id, practitionerId, fields) => {
    const { duration_min, practitioner_id, ...safeFields } = fields;
    const { data, error } = await supabase
        .from('services')
        .update({ ...safeFields, duration_min: SESSION_DURATION_MIN, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('practitioner_id', practitionerId)
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

// ─── Practitioner self-service: permanently delete a service they own ────────
// Safe to hard-delete: no bookings reference services.id directly (bookings
// store a free-text item_id). Hiding a service without deleting it is
// handled separately via the "Show on site" (is_active) toggle.
export const deleteServiceForPractitioner = async (id, practitionerId) => {
    const { data, error } = await supabase
        .from('services')
        .delete()
        .eq('id', id)
        .eq('practitioner_id', practitionerId)
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
