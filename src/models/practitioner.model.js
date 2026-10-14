import { supabase } from '../config/supabase.js';
import { isValidPhoneNumber } from '../utils/validation.js';

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
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

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

/**
 * PRAC-002b: Get the services actually assigned to a practitioner (public)
 * Used by the booking flow so pricing/duration reflect what this specific
 * practitioner offers instead of the entire global services catalog.
 */
export const getServicesForPractitionerSlug = async (slug) => {
    const practitioner = await getPractitionerBySlug(slug);

    const { data, error } = await supabase
        .from('practitioner_services')
        .select('services(*)')
        .eq('practitioner_id', practitioner.id);

    if (error) throw error;

    const assigned = (data || [])
        .map((row) => row.services)
        .filter((service) => service && service.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    if (assigned.length > 0) return assigned;

    // No admin-assigned services for this practitioner yet — fall back to the
    // full active catalog so the booking flow still has options to pick from.
    // Pricing is never taken from here: the amount actually charged always
    // comes from the practitioner's own `price_inr` (see payment.controller.js).
    const { data: allServices, error: allErr } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (allErr) throw allErr;
    return allServices || [];
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * Admin: List all practitioners (published or not)
 */
export const adminListPractitioners = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('practitioners')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (filters.craft) query = query.eq('craft', filters.craft);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.bookable !== undefined) query = query.eq('bookable', filters.bookable === 'true');
    if (filters.is_published !== undefined) query = query.eq('is_published', filters.is_published === 'true');
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

/**
 * Admin: Get practitioner by ID
 */
export const getPractitionerById = async (id) => {
    const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

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
    const allowedFields = ['name', 'bio', 'city', 'craft', 'price_inr', 'image_url', 'calendly_link', 'base_lat', 'base_lng', 'base_address', 'pincode', 'keywords', 'mobile_number', 'whatsapp_number'];
    const sanitized = {};
    for (const key of allowedFields) {
        if (fields[key] !== undefined) sanitized[key] = fields[key];
    }

    if (sanitized.mobile_number !== undefined && sanitized.mobile_number && !isValidPhoneNumber(sanitized.mobile_number)) {
        const err = new Error('Mobile number is not valid.');
        err.statusCode = 400;
        throw err;
    }
    if (sanitized.whatsapp_number !== undefined && sanitized.whatsapp_number && !isValidPhoneNumber(sanitized.whatsapp_number)) {
        const err = new Error('WhatsApp number is not valid.');
        err.statusCode = 400;
        throw err;
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

// ─── Public Application ────────────────────────────────────────────────────────

/**
 * PRAC-APPLY: Submit a practitioner application (public)
 * Creates a pending practitioner record. No user account yet.
 */
export const applyPractitioner = async (fields) => {
    const {
        name, email, bio, craft, city, rating, sessions, price_inr,
        mobile_number, whatsapp_number,
    } = fields;

    if (!name || !email) {
        const err = new Error('Name and email are required');
        err.statusCode = 400;
        throw err;
    }

    if (!mobile_number || !isValidPhoneNumber(mobile_number)) {
        const err = new Error('A valid mobile number is required.');
        err.statusCode = 400;
        throw err;
    }

    if (!whatsapp_number || !isValidPhoneNumber(whatsapp_number)) {
        const err = new Error('A valid WhatsApp number (with country code) is required.');
        err.statusCode = 400;
        throw err;
    }

    // Build slug from name
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    const { data, error } = await supabase
        .from('practitioners')
        .insert([{
            name: name.trim(),
            slug,
            bio: bio?.trim() || null,
            craft: craft?.trim() || null,
            city: city?.trim() || null,
            rating: parseFloat(rating) || 5,
            sessions: parseInt(sessions) || 0,
            price_inr: parseInt(price_inr) || 0,
            mobile_number: mobile_number.trim(),
            whatsapp_number: whatsapp_number.trim(),
            is_published: false,
            bookable: false,
            application_email: email.trim().toLowerCase(),
            application_status: 'pending',
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * PRAC-APPROVE: Admin approves a practitioner application.
 * 1. Creates Supabase auth user via admin API
 * 2. Sets profile role = 'practitioner' and links practitioner_slug
 * 3. Marks application_status = 'approved', is_published = true, bookable = true
 * 4. Sends invite email via Supabase Admin (user gets a magic link to set their password)
 */
export const approvePractitioner = async (id) => {
    // 1. Fetch the pending practitioner
    const { data: prac, error: fetchErr } = await supabase
        .from('practitioners')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!prac) {
        const err = new Error('Practitioner not found');
        err.statusCode = 404;
        throw err;
    }
    if (prac.application_status === 'approved') {
        const err = new Error('Practitioner is already approved');
        err.statusCode = 400;
        throw err;
    }
    if (!prac.application_email) {
        const err = new Error('Practitioner has no application email — cannot create account');
        err.statusCode = 400;
        throw err;
    }

    // 2. Create Supabase auth user (this sends the invite / welcome email automatically)
    const { data: authData, error: authErr } = await supabase.auth.admin.inviteUserByEmail(
        prac.application_email,
        {
            data: { role: 'practitioner', practitioner_slug: prac.slug },
            redirectTo: `${process.env.SITE_URL || 'http://localhost:8080'}/practitioner`,
        }
    );

    if (authErr) {
        // If user already exists just continue
        if (!authErr.message?.includes('already been registered')) throw authErr;
    }

    let authUserId = authData?.user?.id;

    // If user already existed, inviteUserByEmail fails but we can get their ID via generateLink
    if (!authUserId) {
        const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: prac.application_email,
        });
        authUserId = linkData?.user?.id;
    }

    // 3. Upsert profile and update user_roles
    if (authUserId) {
        const { error: profileErr } = await supabase.from('profiles').upsert({
            id: authUserId,
            practitioner_slug: prac.slug,
            full_name: prac.name,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (profileErr) {
            console.error('Failed to upsert practitioner profile:', profileErr);
            throw profileErr;
        }

        // The authoritative role is in `user_roles`, not profiles
        const { data: existingRole } = await supabase.from('user_roles').select('*').eq('user_id', authUserId).maybeSingle();
        if (existingRole) {
            await supabase.from('user_roles').update({ role: 'practitioner' }).eq('user_id', authUserId);
        } else {
            await supabase.from('user_roles').insert([{ user_id: authUserId, role: 'practitioner' }]);
        }
    }

    // 4. Mark the practitioner as approved + published
    const { data: updated, error: updateErr } = await supabase
        .from('practitioners')
        .update({
            application_status: 'approved',
            is_published: true,
            bookable: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (updateErr) throw updateErr;
    return { practitioner: updated, email: prac.application_email };
};
