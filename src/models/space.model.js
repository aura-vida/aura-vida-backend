import { supabase } from '../config/supabase.js';

/**
 * Create a new partner space submission (public)
 */
export const createSpace = async (fields) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .insert([fields])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Public: List partner spaces by pin code (only approved or contacted spaces)
 */
export const listPublicSpaces = async (pin) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .select('id, space_name, address, city, pin, capacity, space_type, amenities, notes')
        .eq('pin', pin)
        .in('status', ['approved', 'contacted']);

    if (error) throw error;
    return data;
};

/**
 * Admin: List all partner space submissions with pagination
 */
export const listSpaces = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('partner_spaces')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.city) query = query.ilike('city', `%${filters.city}%`);
    if (filters.search) {
        query = query.or(`space_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,city.ilike.%${filters.search}%,pin.ilike.%${filters.search}%`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

/**
 * Admin: Create a new partner space directly
 */
export const adminCreateSpace = async (fields) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .insert([{
            ...fields,
            status: fields.status || 'approved',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Admin: Update all details of a partner space
 */
export const adminUpdateSpace = async (id, fields) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .update({
            ...fields,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space not found'), { statusCode: 404 });
    return data;
};

/**
 * Admin: Update status of a partner space submission
 */
export const updateSpaceStatus = async (id, status) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space submission not found'), { statusCode: 404 });
    return data;
};

/**
 * Admin: Permanently delete a space submission
 */
export const deleteSpace = async (id) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .delete()
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space submission not found'), { statusCode: 404 });
    return data;
};

