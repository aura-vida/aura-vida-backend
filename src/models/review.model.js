import { supabase } from '../config/supabase.js';

export const recalculatePractitionerStats = async (practitionerId) => {
    if (!practitionerId) return;
    try {
        // 1. Calculate average rating from approved reviews
        const { data: reviews, error: revErr } = await supabase
            .from('reviews')
            .select('rating')
            .eq('practitioner_id', practitionerId)
            .neq('status', 'rejected');

        let avgRating = 0;
        if (reviews && reviews.length > 0) {
            const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
            avgRating = parseFloat((sum / reviews.length).toFixed(1));
        }

        // 2. Count completed sessions from bookings for this practitioner
        const { data: prac } = await supabase
            .from('practitioners')
            .select('slug')
            .eq('id', practitionerId)
            .maybeSingle();

        let completedSessions = 0;
        if (prac?.slug) {
            const { count } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('practitioner_slug', prac.slug)
                .eq('status', 'completed');
            completedSessions = count || 0;
        }

        await supabase
            .from('practitioners')
            .update({
                rating: avgRating,
                sessions: completedSessions,
            })
            .eq('id', practitionerId);
    } catch (err) {
        console.error('recalculatePractitionerStats error:', err);
    }
};

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
    // 1. If booking_id is provided, strictly validate that the booking is completed and belongs to the client
    if (fields.booking_id) {
        const { data: booking, error: bErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', fields.booking_id)
            .maybeSingle();

        if (bErr || !booking) {
            throw Object.assign(new Error('Session not found.'), { statusCode: 404 });
        }
        if (booking.client_id !== fields.client_id) {
            throw Object.assign(new Error('You can only review sessions you booked.'), { statusCode: 403 });
        }
        if (booking.status !== 'completed') {
            throw Object.assign(
                new Error(`Cannot review an incomplete session. Session status is '${booking.status}'. Only completed sessions can be reviewed.`),
                { statusCode: 400 }
            );
        }

        // Check if session has already been reviewed
        const { data: existingReview } = await supabase
            .from('reviews')
            .select('id')
            .eq('booking_id', fields.booking_id)
            .maybeSingle();

        if (existingReview) {
            throw Object.assign(new Error('You have already submitted a review for this session.'), { statusCode: 409 });
        }

        // Auto-resolve practitioner_id from booking if not already provided
        if (!fields.practitioner_id && booking.practitioner_slug) {
            const { data: prac } = await supabase
                .from('practitioners')
                .select('id')
                .eq('slug', booking.practitioner_slug)
                .maybeSingle();
            if (prac?.id) {
                fields.practitioner_id = prac.id;
            }
        }
    }

    if (!fields.practitioner_id) {
        throw Object.assign(new Error('Practitioner ID is required.'), { statusCode: 400 });
    }

    const eligible = await hasUsedPractitionerServices(fields.client_id, fields.practitioner_id);
    if (!eligible) {
        throw Object.assign(
            new Error('You can only review a practitioner after completing a session with them.'),
            { statusCode: 403 }
        );
    }

    const { data, error } = await supabase
        .from('reviews')
        .insert([{
            practitioner_id: fields.practitioner_id,
            booking_id: fields.booking_id || null,
            client_id: fields.client_id,
            rating: fields.rating,
            comment: fields.comment || null,
            status: 'approved',
        }])
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            throw Object.assign(new Error('You already reviewed this session.'), { statusCode: 409 });
        }
        throw error;
    }

    // Recalculate practitioner rating and sessions count
    await recalculatePractitionerStats(fields.practitioner_id);

    return data;
};

/**
 * A client's own submitted reviews — lets the booking list show "already
 * reviewed" instead of offering the form again.
 */
export const listReviewsByClient = async (clientId) => {
    const { data, error } = await supabase
        .from('reviews')
        .select('id, practitioner_id, booking_id, rating, comment, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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

    if (data.practitioner_id) {
        await recalculatePractitionerStats(data.practitioner_id);
    }

    return data;
};

/**
 * List all reviews for the Admin panel with practitioner & client info.
 */
export const listAllReviewsAdmin = async ({ status, rating, search, page = 1, limit = 15 }) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('reviews')
        .select(`
            id,
            practitioner_id,
            booking_id,
            client_id,
            rating,
            comment,
            status,
            created_at,
            practitioners:practitioner_id (id, name, slug)
        `, { count: 'exact' });

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }
    if (rating) {
        query = query.eq('rating', parseInt(rating));
    }

    const { data: reviews, count, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch client profiles for client names & emails
    const clientIds = [...new Set((reviews || []).map((r) => r.client_id).filter(Boolean))];
    const clientMap = {};
    if (clientIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email, phone')
            .in('id', clientIds);
        (profiles || []).forEach((p) => {
            clientMap[p.id] = p;
        });
    }

    // Fetch booking scheduled date/mode if booking_id exists
    const bookingIds = [...new Set((reviews || []).map((r) => r.booking_id).filter(Boolean))];
    const bookingMap = {};
    if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, scheduled_at, mode, item_id')
            .in('id', bookingIds);
        (bookings || []).forEach((b) => {
            bookingMap[b.id] = b;
        });
    }

    const enriched = (reviews || []).map((r) => ({
        ...r,
        client: clientMap[r.client_id] || null,
        booking: bookingMap[r.booking_id] || null,
    }));

    return {
        reviews: enriched,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
        },
    };
};

