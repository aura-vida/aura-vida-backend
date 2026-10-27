import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { isValidPhoneNumber } from '../utils/validation.js';
import { sendEmail } from '../services/email.service.js';

// Human-readable copy of the magic-link token's lifetime, shown in the
// welcome email. The actual expiry is a Supabase project Auth setting
// (Authentication > Email > "Email OTP Expiration"), not something this
// codebase controls — keep this string in sync with whatever that's set to.
// Hosted Supabase projects cap this setting at 86400 seconds (24 hours).
const MAGIC_LINK_EXPIRY_LABEL = '24 hours';

// Avoids visually ambiguous characters (0/O, 1/l/I) since this gets typed by hand.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const generateTempPassword = () => {
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += TEMP_PASSWORD_CHARS[crypto.randomInt(TEMP_PASSWORD_CHARS.length)];
    return `${pwd}!`; // guarantees a symbol, comfortably clears any password-strength policy
};

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
    if (filters.city) query = query.ilike('city', filters.city.trim());
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
 * PRAC-002b: Get the services a practitioner has created for themselves (public)
 * Used by the booking flow so pricing reflects what this specific
 * practitioner actually offers. Each service belongs to exactly one
 * practitioner (services.practitioner_id) — there is no shared catalog to
 * fall back to anymore.
 */
export const getServicesForPractitionerSlug = async (slug) => {
    const practitioner = await getPractitionerBySlug(slug);

    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('practitioner_id', practitioner.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

/**
 * Resolves the practitioner slug for a user with auto-healing fallback.
 * If practitioner_slug is missing on profiles, matches by:
 * 1. userMetadata?.practitioner_slug
 * 2. application_email (from userEmail or auth.users)
 * 3. full_name
 * Automatically backfills profiles.practitioner_slug.
 */
export const resolvePractitionerSlug = async (userId, userEmail = null, userMetadata = null) => {
    const { data: profile } = await supabase
        .from('profiles')
        .select('practitioner_slug, full_name')
        .eq('id', userId)
        .maybeSingle();

    if (profile?.practitioner_slug) {
        return profile.practitioner_slug;
    }

    let slug = userMetadata?.practitioner_slug;

    let email = userEmail;
    if (!email) {
        try {
            const { data: userData } = await supabase.auth.admin.getUserById(userId);
            email = userData?.user?.email;
            if (!slug && userData?.user?.user_metadata?.practitioner_slug) {
                slug = userData.user.user_metadata.practitioner_slug;
            }
        } catch (_) {}
    }

    if (!slug && email) {
        const { data: prac } = await supabase
            .from('practitioners')
            .select('slug')
            .ilike('application_email', email.trim().toLowerCase())
            .maybeSingle();
        if (prac?.slug) slug = prac.slug;
    }

    if (!slug && profile?.full_name) {
        const { data: prac } = await supabase
            .from('practitioners')
            .select('slug')
            .ilike('name', profile.full_name.trim())
            .maybeSingle();
        if (prac?.slug) slug = prac.slug;
    }

    if (slug) {
        try {
            await supabase
                .from('profiles')
                .update({ practitioner_slug: slug })
                .eq('id', userId);
        } catch (_) {}
        return slug;
    }

    throw Object.assign(new Error('Practitioner profile not linked. Set practitioner_slug on your user profile.'), { statusCode: 404 });
};

/**
 * Resolves the practitioner row owned by a logged-in auth user, for
 * self-service endpoints (e.g. managing their own services).
 */
export const getPractitionerByUserId = async (userId, userEmail = null, userMetadata = null) => {
    const slug = await resolvePractitionerSlug(userId, userEmail, userMetadata);
    const practitioner = await getPractitionerBySlug(slug);
    if (!practitioner) throw Object.assign(new Error('Practitioner not found.'), { statusCode: 404 });
    return practitioner;
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
 * Creates the actual login for a practitioner: a Supabase Auth user with a
 * real temporary password (so they can log in immediately), a `profiles` row
 * linked to their practitioner slug, and the `practitioner` role. Also emails
 * them the temporary password plus a "Reset your password" link. Shared by
 * both `createPractitioner` (admin direct-create) and `approvePractitioner`
 * (apply-flow) so the two paths never drift apart.
 */
const createPractitionerAccount = async ({ slug, name, email }) => {
    const siteUrl = process.env.SITE_URL || 'http://localhost:8080';
    const tempPassword = generateTempPassword();

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: 'practitioner', practitioner_slug: slug },
    });

    let authUserId = authData?.user?.id;
    let isNewAccount = true;

    if (authErr) {
        // If user already exists just continue — their real password stays
        // untouched, so no temp-password email goes out for this case.
        if (!authErr.message?.includes('already been registered')) throw authErr;
        isNewAccount = false;
        const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email,
        });
        authUserId = linkData?.user?.id;
    }

    if (authUserId) {
        const { error: profileErr } = await supabase.from('profiles').upsert({
            id: authUserId,
            practitioner_slug: slug,
            full_name: name,
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

    if (isNewAccount && authUserId) {
        // Magic link: points at our own /magic-login page with the raw
        // token_hash, NOT Supabase's action_link directly. Emailing the
        // action_link is unreliable — email clients and security gateways
        // (Outlook Safe Links, Gmail's link proxy, antivirus scanners) often
        // pre-fetch links in emails before the user clicks, which silently
        // burns a one-time magic link. /magic-login only consumes the token
        // on an explicit button click (see verifyMagicLink in
        // auth.controller.js), so pre-fetching is harmless.
        let magicLinkUrl = null;
        try {
            const { data: magicData, error: magicErr } = await supabase.auth.admin.generateLink({
                type: 'magiclink',
                email,
            });
            if (!magicErr && magicData?.properties?.hashed_token) {
                magicLinkUrl = `${siteUrl}/magic-login?token_hash=${magicData.properties.hashed_token}&redirect=/practitioner`;
            }
        } catch (magicGenErr) {
            console.error('Failed to generate practitioner magic link:', magicGenErr);
        }

        // Reset password: deliberately NOT a pre-generated recovery token.
        // Supabase keeps only one live email-action token per user at a
        // time, so generating a 'recovery' link here would silently
        // invalidate the 'magiclink' token generated just above (confirmed
        // live — the second generateLink() call kills the first one
        // regardless of type). Instead, this links to the app's own
        // self-service "forgot password" form, pre-filled with their email —
        // the actual recovery token only gets generated on demand when they
        // click "Send reset link" there, so it can never collide.
        const resetUrl = `${siteUrl}/auth?view=forgot&email=${encodeURIComponent(email)}`;
        const loginUrl = `${siteUrl}/auth?email=${encodeURIComponent(email)}`;

        const emailResult = await sendEmail({
            to: email,
            subject: 'Your Kusala Practitioner account is ready',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
                <h1 style="font-size:22px;color:#1a5c38;margin-bottom:4px;">Welcome to Kusala, ${name}</h1>
                <p style="color:#555;margin-top:0;">An account has been created for you on the Kusala Guide Portal.</p>
                ${magicLinkUrl ? `
                <a href="${magicLinkUrl}" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#1a5c38;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">Log In Instantly</a>
                <p style="color:#888;font-size:12px;margin:10px 0 0;">One-click login, no password needed. This link expires in ${MAGIC_LINK_EXPIRY_LABEL} and can only be used once.</p>
                <p style="color:#aaa;font-size:11px;margin:10px 0 0;">Button not working? Copy and paste this link into your browser:<br><a href="${magicLinkUrl}" style="color:#1a5c38;word-break:break-all;">${magicLinkUrl}</a></p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
                ` : ''}
                <p style="color:#555;">Prefer to log in manually? Use this temporary password:</p>
                <div style="background:#f3f7f4;border-radius:12px;padding:16px 20px;margin:12px 0 20px;">
                  <p style="margin:0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Email</p>
                  <p style="margin:4px 0 12px;font-size:15px;color:#111;">${email}</p>
                  <p style="margin:0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
                  <p style="margin:4px 0 0;font-size:18px;font-family:monospace;font-weight:700;color:#111;letter-spacing:0.03em;">${tempPassword}</p>
                </div>
                <a href="${loginUrl}" style="display:inline-block;margin-bottom:20px;padding:12px 28px;background:#1a5c38;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">Go to Login</a>
                <p style="color:#555;">For security, please set your own password as soon as you log in.</p>
                <a href="${resetUrl}" style="display:inline-block;margin-top:8px;padding:12px 28px;background:#fff;color:#1a5c38;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;border:1.5px solid #1a5c38;">Reset Your Password</a>
                <p style="color:#888;font-size:12px;margin:10px 0 0;">Takes you to a form to request a reset link by email.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">
                <p style="font-size:12px;color:#aaa;">Kusala &bull; Questions? Reply to this email or visit kusala.in</p>
              </div>
            `,
        });
        console.log(emailResult
            ? `✅ [PRACTITIONER] Welcome email sent to ${email} (${name})`
            : `❌ [PRACTITIONER] Welcome email FAILED to send to ${email} (${name})`);
    }

    return authUserId;
};

/**
 * PRAC-003: Create a new practitioner (admin only)
 * Unlike the old bare insert, this requires an email + phone numbers and
 * immediately creates a real login for the practitioner (same invite-email
 * mechanism as approvePractitioner) — an admin-created practitioner used to
 * be a directory listing only, with no way to ever log into the Guide Portal.
 */
export const createPractitioner = async (fields) => {
    // rating and sessions are system-computed from customer reviews — never
    // admin-settable, even on creation.
    const { email, mobile_number, whatsapp_number, name, rating, sessions, ...rest } = fields;

    if (!name || !String(name).trim()) {
        const err = new Error('Name is required.');
        err.statusCode = 400;
        throw err;
    }
    if (!email) {
        const err = new Error('An email is required to create this practitioner\'s login.');
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

    // Always generate a fresh, unique slug server-side — never trust a
    // client-supplied one (two practitioners with the same name would
    // otherwise collide on the table's unique slug constraint).
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
    const normalizedEmail = String(email).trim().toLowerCase();

    // Create the login first — if the invite fails, no orphaned directory
    // listing (with no way to ever log in) is left behind.
    await createPractitionerAccount({ slug, name: name.trim(), email: normalizedEmail });

    const { data, error } = await supabase
        .from('practitioners')
        .insert([{
            ...rest,
            name: name.trim(),
            slug,
            mobile_number: mobile_number.trim(),
            whatsapp_number: whatsapp_number.trim(),
            application_email: normalizedEmail,
            application_status: 'approved',
        }])
        .select()
        .single();

    if (error) throw error;
    return { practitioner: data, email: normalizedEmail };
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
    const allowedFields = [
        'name', 'bio', 'city', 'craft', 'price_inr', 'image_url', 'calendly_link',
        'base_lat', 'base_lng', 'base_address', 'pincode', 'keywords', 'mobile_number', 'whatsapp_number',
        'offers_centre', 'offers_host', 'offers_online', 'offers_studio',
        'studio_name', 'studio_address', 'studio_city', 'studio_maps_url',
        'price_studio_private', 'price_studio_group',
        'price_online_private', 'price_online_group',
        'price_centre_private', 'price_centre_group',
        'price_host_private', 'price_host_group'
    ];
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
        name, email, bio, craft, city, price_inr,
        mobile_number, whatsapp_number,
    } = fields;

    if (!name || !email) {
        const err = new Error('Name and email are required');
        err.statusCode = 400;
        throw err;
    }

    if (!craft || !craft.trim()) {
        const err = new Error('Modality / Title is required.');
        err.statusCode = 400;
        throw err;
    }

    if (!city || !city.trim()) {
        const err = new Error('Location / City is required.');
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
            craft: craft?.trim() || 'Holistic Practitioner',
            city: city?.trim() || '',
            // rating and sessions are never accepted from a client/applicant —
            // both start at their DB defaults (0) and are only ever set by
            // the review trigger.
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

    // 2 & 3. Create the Supabase auth user (sends the invite email) and link
    // the profile + role — shared with admin direct-create (createPractitioner).
    await createPractitionerAccount({ slug: prac.slug, name: prac.name, email: prac.application_email });

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
