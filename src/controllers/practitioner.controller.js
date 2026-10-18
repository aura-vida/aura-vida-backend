import {
    listPractitioners,
    getPractitionerBySlug,
    getServicesForPractitionerSlug,
    createPractitioner,
    updatePractitionerById,
    deactivatePractitioner,
    getOwnPractitionerProfile,
    updateOwnPractitionerProfile,
    updatePractitionerStatus,
    adminListPractitioners,
    getPractitionerById,
    applyPractitioner,
    approvePractitioner,
} from '../models/practitioner.model.js';
import { supabase } from '../config/supabase.js';
import { notifyAdmins, emailAdmins } from '../models/notification.model.js';

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * PRAC-001: GET /api/practitioners
 */
export const getPractitioners = async (req, res) => {
    try {
        const { data, pagination } = await listPractitioners(req.query);
        res.status(200).json({ practitioners: data, pagination });
    } catch (error) {
        console.error('getPractitioners error:', error);
        res.status(500).json({ error: 'Failed to fetch practitioners' });
    }
};

/**
 * PRAC-002: GET /api/practitioners/:slug
 */
export const getPractitionerProfile = async (req, res) => {
    try {
        const data = await getPractitionerBySlug(req.params.slug);
        if (!data) return res.status(404).json({ error: 'Practitioner not found' });
        res.status(200).json({ practitioner: data });
    } catch (error) {
        console.error('getPractitionerProfile error:', error);
        res.status(404).json({ error: 'Practitioner not found' });
    }
};

/**
 * PRAC-002b: GET /api/practitioners/:slug/services
 */
export const getPractitionerServices = async (req, res) => {
    try {
        const services = await getServicesForPractitionerSlug(req.params.slug);
        res.status(200).json({ services });
    } catch (error) {
        console.error('getPractitionerServices error:', error);
        res.status(404).json({ error: 'Practitioner not found' });
    }
};

/**
 * PRAC-APPLY: POST /api/practitioners/apply
 */
export const applyToJoinAsPractitioner = async (req, res) => {
    try {
        const data = await applyPractitioner(req.body);

        // Notify admins asynchronously (non-blocking) — both the in-app bell
        // and a real email, since a new application shouldn't rely on an
        // admin happening to be logged in and looking at the bell.
        try {
            await notifyAdmins(
                'New Practitioner Application',
                `${data.name} applied for ${data.craft || 'Holistic Practitioner'}.`,
                'practitioner',
                data.id
            );
            await emailAdmins(
                `New Practitioner Application — ${data.name}`,
                `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
                    <h1 style="font-size:20px;color:#1a5c38;margin-bottom:4px;">New Practitioner Application</h1>
                    <p style="color:#555;">A new practitioner has applied to join Kusala.</p>
                    <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;margin-top:12px;">
                      <tr><td style="padding:6px 0;color:#888;">Name</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.name}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">Craft</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.craft || 'Holistic Practitioner'}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">City</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.city || '—'}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">Application Email</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.application_email || '—'}</td></tr>
                    </table>
                    <p style="color:#888;font-size:12px;margin-top:20px;">Review and approve this application from the Admin Dashboard.</p>
                  </div>
                `
            );
        } catch (_) {}

        res.status(201).json({ message: 'Application submitted successfully', practitioner: data });
    } catch (error) {
        console.error('applyToJoinAsPractitioner error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to submit application' });
    }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * Admin: GET /api/admin/practitioners
 */
export const adminGetAllPractitioners = async (req, res) => {
    try {
        const { data, pagination } = await adminListPractitioners(req.query);
        res.status(200).json({ practitioners: data, pagination });
    } catch (error) {
        console.error('adminGetAllPractitioners error:', error);
        res.status(500).json({ error: 'Failed to fetch practitioners' });
    }
};

/**
 * Admin: GET /api/admin/practitioners/:id
 */
export const adminGetPractitionerById = async (req, res) => {
    try {
        const data = await getPractitionerById(req.params.id);
        if (!data) return res.status(404).json({ error: 'Practitioner not found' });
        res.status(200).json({ practitioner: data });
    } catch (error) {
        console.error('adminGetPractitionerById error:', error);
        res.status(404).json({ error: 'Practitioner not found' });
    }
};

/**
 * PRAC-003: POST /api/admin/practitioners
 */
export const adminCreatePractitioner = async (req, res) => {
    try {
        const { practitioner, email } = await createPractitioner(req.body);
        res.status(201).json({
            message: `Practitioner created — an invite email has been sent to ${email}.`,
            practitioner,
            email,
        });
    } catch (error) {
        console.error('adminCreatePractitioner error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to create practitioner' });
    }
};

/**
 * PRAC-004: PATCH /api/admin/practitioners/:id
 */
export const adminUpdatePractitioner = async (req, res) => {
    try {
        // rating and sessions are system-computed from customer reviews —
        // admins cannot set them directly, even through a generic update payload.
        const { rating, sessions, ...fields } = req.body;
        const data = await updatePractitionerById(req.params.id, fields);
        res.status(200).json({ message: 'Practitioner updated successfully', practitioner: data });
    } catch (error) {
        console.error('adminUpdatePractitioner error:', error);
        res.status(500).json({ error: 'Failed to update practitioner' });
    }
};

/**
 * PRAC-005: DELETE /api/admin/practitioners/:id
 */
export const adminDeletePractitioner = async (req, res) => {
    try {
        await deactivatePractitioner(req.params.id);
        res.status(200).json({ message: 'Practitioner deactivated successfully' });
    } catch (error) {
        console.error('adminDeletePractitioner error:', error);
        res.status(500).json({ error: 'Failed to deactivate practitioner' });
    }
};

/**
 * PRAC-008: PATCH /api/admin/practitioners/:id/status
 */
export const adminUpdatePractitionerStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (typeof status !== 'boolean') {
            return res.status(400).json({ error: 'Body must contain a boolean "status" field' });
        }
        const data = await updatePractitionerStatus(req.params.id, status);
        res.status(200).json({ message: 'Practitioner status updated successfully', practitioner: data });
    } catch (error) {
        console.error('adminUpdatePractitionerStatus error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update status' });
    }
};

/**
 * PRAC-APPROVE: POST /api/admin/practitioners/:id/approve
 */
export const adminApprovePractitioner = async (req, res) => {
    try {
        const data = await approvePractitioner(req.params.id);
        res.status(200).json({ message: 'Practitioner approved and credentials generated', ...data });
    } catch (error) {
        console.error('adminApprovePractitioner error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to approve practitioner' });
    }
};

// ─── Practitioner Self-Service ────────────────────────────────────────────────

/**
 * Helper: get practitioner_slug for the logged-in practitioner from their profile
 */
const getPractitionerSlug = async (userId) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('practitioner_slug')
        .eq('id', userId)
        .single();
    if (error || !data?.practitioner_slug) throw Object.assign(new Error('Practitioner profile not linked. Set practitioner_slug on your user profile.'), { statusCode: 404 });
    return data.practitioner_slug;
};

/**
 * PRAC-006: GET /api/practitioners/me
 */
export const getMyPractitionerProfile = async (req, res) => {
    try {
        const slug = await getPractitionerSlug(req.user.id);
        const data = await getOwnPractitionerProfile(slug);
        res.status(200).json({ practitioner: data });
    } catch (error) {
        console.error('getMyPractitionerProfile error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to fetch practitioner profile' });
    }
};

/**
 * PRAC-007: PATCH /api/practitioners/me
 */
export const updateMyPractitionerProfile = async (req, res) => {
    try {
        const slug = await getPractitionerSlug(req.user.id);

        // Handle multipart fields manually since formData turns everything into strings
        const updatePayload = { ...req.body };

        if (updatePayload.price_inr) {
            updatePayload.price_inr = Number(updatePayload.price_inr);
        }
        // rating and sessions are system-computed from customer reviews —
        // updateOwnPractitionerProfile's allowedFields whitelist already
        // excludes them regardless of what's sent here.

        // Try to parse keywords if it's sent as a JSON string array from FormData
        if (typeof updatePayload.keywords === 'string') {
            try {
                updatePayload.keywords = JSON.parse(updatePayload.keywords);
            } catch (e) {
                // if it fails to parse, it could be a comma separated string
                updatePayload.keywords = updatePayload.keywords.split(',').map(k => k.trim());
            }
        }

        if (req.file) {
            const ext = req.file.originalname.split('.').pop() || 'jpg';
            const filename = `${req.user.id}/${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('practitioner-photos')
                .upload(filename, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true,
                });

            if (uploadError) {
                return res.status(400).json({ error: `Image upload failed: ${uploadError.message}` });
            }

            const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 years
            const { data: signed, error: signErr } = await supabase.storage
                .from('practitioner-photos')
                .createSignedUrl(filename, SIGNED_URL_TTL);

            if (signErr || !signed) {
                return res.status(500).json({ error: signErr?.message ?? 'Could not create photo link' });
            }

            updatePayload.image_url = signed.signedUrl;
        }

        const data = await updateOwnPractitionerProfile(slug, updatePayload);
        res.status(200).json({ message: 'Practitioner profile updated', practitioner: data });
    } catch (error) {
        console.error('updateMyPractitionerProfile error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to update practitioner profile' });
    }
};

/**
 * POST /api/admin/practitioners/:id/photo
 * Admin only. Upload a practitioner photo using Supabase Service Role Key (bypassing RLS).
 */
export const adminUploadPractitionerPhoto = async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Image file is required.' });
        }

        const ext = file.originalname.split('.').pop() || 'jpg';
        const filename = `${req.params.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('practitioner-photos')
            .upload(filename, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            });

        if (uploadError) {
            return res.status(400).json({ error: `Image upload failed: ${uploadError.message}` });
        }

        const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 years
        const { data: signed, error: signErr } = await supabase.storage
            .from('practitioner-photos')
            .createSignedUrl(filename, SIGNED_URL_TTL);

        if (signErr || !signed) {
            return res.status(500).json({ error: signErr?.message ?? 'Could not create photo link' });
        }

        const updated = await updatePractitionerById(req.params.id, { image_url: signed.signedUrl });

        res.status(200).json({
            message: 'Practitioner photo updated successfully',
            imageUrl: signed.signedUrl,
            practitioner: updated,
        });
    } catch (error) {
        console.error('adminUploadPractitionerPhoto error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to upload practitioner photo' });
    }
};

