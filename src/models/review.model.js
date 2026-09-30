import { supabase } from '../config/supabase.js';

export const listPractitionerReviews = async (practitionerId, page, limit) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await supabase
        .from('reviews')
        .select('*', { count: 'exact' })
        .eq('practitioner_id', practitionerId)
        .eq('status', 'approved')
        .range(from, to)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const createReview = async (fields) => {
    const { data, error } = await supabase
        .from('reviews')
        .insert([{ ...fields, status: 'pending' }])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateReviewStatus = async (id, status) => {
    const allowed = ['approved', 'rejected', 'pending'];
    if (!allowed.includes(status)) {
        throw Object.assign(new Error(`Status must be one of: ${allowed.join(', ')}`), { statusCode: 400 });
    }
    const { data, error } = await supabase
        .from('reviews')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    return data;
};
