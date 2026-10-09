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
 * Public: List partner spaces by pin code
 * 1. Checks exact PIN code match
 * 2. If no exact match, checks same region (first 2-3 digits of PIN)
 * 3. Fallback: returns available partner spaces so the user can choose a sanctuary
 */
export const listPublicSpaces = async (pin) => {
    if (pin) {
        // 1. Exact match
        const { data: exact, error: exactErr } = await supabase
            .from('partner_spaces')
            .select('id, space_name, address, city, pin, capacity, space_type, amenities, notes, status')
            .eq('pin', pin)
            .in('status', ['approved', 'contacted', 'new']);

        if (!exactErr && exact && exact.length > 0) return exact;

        // 2. Regional prefix match (first 3 digits e.g. 384... or 380...)
        const prefix3 = pin.slice(0, 3);
        const { data: regional3 } = await supabase
            .from('partner_spaces')
            .select('id, space_name, address, city, pin, capacity, space_type, amenities, notes, status')
            .ilike('pin', `${prefix3}%`)
            .in('status', ['approved', 'contacted', 'new']);

        if (regional3 && regional3.length > 0) return regional3;

        // Regional prefix match (first 2 digits e.g. 38... for Gujarat)
        const prefix2 = pin.slice(0, 2);
        const { data: regional2 } = await supabase
            .from('partner_spaces')
            .select('id, space_name, address, city, pin, capacity, space_type, amenities, notes, status')
            .ilike('pin', `${prefix2}%`)
            .in('status', ['approved', 'contacted', 'new']);

        if (regional2 && regional2.length > 0) return regional2;
    }

    // 3. Fallback: return all active partner spaces
    const { data: allSpaces, error } = await supabase
        .from('partner_spaces')
        .select('id, space_name, address, city, pin, capacity, space_type, amenities, notes, status')
        .in('status', ['approved', 'contacted', 'new'])
        .limit(10);

    if (error) throw error;
    return allSpaces || [];
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

