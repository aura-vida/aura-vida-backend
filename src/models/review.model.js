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

/**
 * A customer may only review a practitioner once they've actually had a
 * session with them — a paid-but-upcoming ("confirmed") booking doesn't
 * count yet, only one marked "completed".
 */
const hasUsedPractitionerServices = async (clientId, practitionerId) => {
    const { data: practitioner, error: pracErr } = await supabase
        .from('practitioners')
        .select('slug')
        .eq('id', practitionerId)
        .maybeSingle();
    if (pracErr) throw pracErr;
    if (!practitioner) {
        throw Object.assign(new Error('Practitioner not found.'), { statusCode: 404 });
    }

    const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('practitioner_slug', practitioner.slug)
        .eq('status', 'completed');
    if (error) throw error;
    return (count || 0) > 0;
};

export const createReview = async (fields) => {
    const eligible = await hasUsedPractitionerServices(fields.client_id, fields.practitioner_id);
    if (!eligible) {
        throw Object.assign(
            new Error('You can only review a practitioner after booking a session with them.'),
            { statusCode: 403 }
        );
    }

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
