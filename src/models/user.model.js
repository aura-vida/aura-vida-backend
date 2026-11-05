import { supabase } from '../config/supabase.js';
import { isValidPhoneNumber } from '../utils/validation.js';

/**
 * Create a user profile and assign their role on registration
 */
export const createUserProfile = async (userId, name, email, incomingRole, whatsappNumber = null, phone = null) => {
    let dbRole = 'client';
    if (incomingRole === 'Practitioner') dbRole = 'practitioner';
    else if (incomingRole === 'Admin') dbRole = 'admin';

    const contactPhone = phone || whatsappNumber;
    const profilePayload = {
        id: userId,
        full_name: name,
        credit_inr: 0,
        ...(whatsappNumber ? { whatsapp_number: String(whatsappNumber).trim() } : {}),
        ...(contactPhone ? { phone: String(contactPhone).trim() } : {}),
    };

    let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .upsert([profilePayload])
        .select();

    // Fallback if DB does not yet have whatsapp_number column
    if (profileError && (profileError.code === '42703' || profileError.message?.includes('whatsapp_number'))) {
        delete profilePayload.whatsapp_number;
        const res = await supabase
            .from('profiles')
            .upsert([profilePayload])
            .select();
        profileData = res.data;
        profileError = res.error;
    }

    if (profileError) {
        console.error("profile upsert error:", profileError);
        throw profileError;
    }

    // Instead of upsert (which needs a unique constraint on user_id),
    // we explicitly check and update or insert.
    let roleData, roleError;
    const { data: existingRole } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (existingRole) {
        const res = await supabase
            .from('user_roles')
            .update({ role: dbRole })
            .eq('user_id', userId)
            .select();
        roleData = res.data;
        roleError = res.error;
    } else {
        const res = await supabase
            .from('user_roles')
            .insert([{ user_id: userId, role: dbRole }])
            .select();
        roleData = res.data;
        roleError = res.error;
    }

    if (roleError) console.warn('Could not insert/update user_role:', roleError.message);

    return { ...profileData[0], role: roleData?.[0]?.role };
};

/**
 * Get a user's profile + role by their auth user ID
 */
export const getUserProfile = async (userId) => {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

    // Referral count for the "Friends joined" stat. Read with the service-role
    // client (here) rather than the frontend querying `referrals` directly —
    // that table's RLS checks `auth.uid()`, which is never set for the
    // frontend's Supabase client since this app's own login flow never
    // establishes a Supabase session on it, so a direct client-side query
    // always silently returns zero rows regardless of real data.
    const { count: referralCount } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', userId);

    const mergedProfile = { ...(profile || {}), role: roleData?.role, referral_count: referralCount || 0 };
    if (mergedProfile && !mergedProfile.whatsapp_number && mergedProfile.phone) {
        mergedProfile.whatsapp_number = mergedProfile.phone;
    }

    return mergedProfile;
};

/**
 * Update a user's profile fields
 * Only fields present in the 'profiles' table are allowed.
 */
export const updateUserProfile = async (userId, fields) => {
    const allowedFields = ['full_name', 'phone', 'whatsapp_number'];
    const sanitized = {};

    for (const key of allowedFields) {
        if (fields[key] !== undefined) {
            sanitized[key] = fields[key];
        }
    }

    if (fields.whatsapp_number !== undefined) {
        const trimmedWa = typeof fields.whatsapp_number === 'string' ? fields.whatsapp_number.trim() : '';
        if (!trimmedWa) {
            const err = new Error('WhatsApp number cannot be empty. A valid WhatsApp number including country code is required.');
            err.statusCode = 400;
            throw err;
        }
        if (!isValidPhoneNumber(trimmedWa)) {
            const err = new Error('Please enter a valid WhatsApp number, including the country code.');
            err.statusCode = 400;
            throw err;
        }
        sanitized.whatsapp_number = trimmedWa;
    }

    // 'referred_by' is stored as a UUID, but users pass the short referral_code string.
    // We need to look up the referrer's actual UUID from their referral_code first.
    if (fields.referred_by !== undefined) {
        const { data: referrer, error: referrerError } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', fields.referred_by.trim().toUpperCase())
            .single();

        if (referrerError || !referrer) {
            const err = new Error('Invalid referral code. No user found with that code.');
            err.statusCode = 400;
            throw err;
        }

        // Prevent self-referral
        if (referrer.id === userId) {
            const err = new Error('You cannot refer yourself.');
            err.statusCode = 400;
            throw err;
        }

        sanitized.referred_by = referrer.id;
    }

    if (sanitized.whatsapp_number && !sanitized.phone) {
        sanitized.phone = sanitized.whatsapp_number;
    }

    let { data, error } = await supabase
        .from('profiles')
        .update({ ...sanitized, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();

    // Graceful fallback if database column whatsapp_number has not been migrated yet (Postgres code 42703)
    if (error && (error.code === '42703' || error.message?.includes('whatsapp_number'))) {
        console.warn('⚠️ profiles.whatsapp_number column not found in database. Storing in phone column as fallback.');
        const fallback = { ...sanitized };
        if (fallback.whatsapp_number && !fallback.phone) {
            fallback.phone = fallback.whatsapp_number;
        }
        delete fallback.whatsapp_number;
        const res = await supabase
            .from('profiles')
            .update({ ...fallback, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();
        data = res.data;
        error = res.error;
        if (data && sanitized.whatsapp_number) {
            data.whatsapp_number = sanitized.whatsapp_number;
        }
    }

    if (error) throw error;
    return data;
};

/**
 * Link a practitioner slug to a user account (Admin only)
 */
export const linkPractitionerSlug = async (userId, slug) => {
    const { data, error } = await supabase
        .from('profiles')
        .update({ practitioner_slug: slug, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const notFoundError = new Error('User profile not found. Make sure you passed a valid User Account ID!');
        notFoundError.statusCode = 404;
        throw notFoundError;
    }
    return data;
};

/**
 * Delete a user's own account (customer only)
 * Manually removes dependent rows first to avoid FK constraint errors,
 * then deletes the auth user via the admin API.
 */
export const deleteUserAccount = async (userId) => {
    // 1. Delete the user's bookings (as client)
    const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('client_id', userId);
    if (bookingsError) throw bookingsError;

    // 2. Delete the user's role row
    const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
    if (roleError) throw roleError;

    // 3. Delete the profile row
    const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
    if (profileError) throw profileError;

    // 4. Delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) throw authError;
};

/**
 * Get appointments for a specific user (client_id)
 */
export const getUserAppointments = async (userId, filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('bookings')
        .select('*', { count: 'exact' })
        .eq('client_id', userId)
        .order('scheduled_at', { ascending: false });

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    // The practitioner's WhatsApp number is only shared with a client once
    // they have at least one confirmed (or completed) booking with them —
    // it's not part of the public practitioner listing, so it has to be
    // fetched and attached here rather than coming from the bookings table.
    const slugsAllowed = [...new Set(
        data.filter((b) => ['confirmed', 'completed'].includes(b.status) && b.practitioner_slug)
            .map((b) => b.practitioner_slug)
    )];

    if (slugsAllowed.length > 0) {
        const { data: practitioners } = await supabase
            .from('practitioners')
            .select('slug, whatsapp_number')
            .in('slug', slugsAllowed);

        const whatsappBySlug = Object.fromEntries(
            (practitioners || []).map((p) => [p.slug, p.whatsapp_number])
        );

        data.forEach((b) => {
            if (['confirmed', 'completed'].includes(b.status) && b.practitioner_slug) {
                b.practitioner_whatsapp_number = whatsappBySlug[b.practitioner_slug] || null;
            }
        });
    }

    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};
