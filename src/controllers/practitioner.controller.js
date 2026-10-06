import {
    listPractitioners,
    getPractitionerBySlug,
    createPractitioner,
    updatePractitionerById,
    deactivatePractitioner,
    getOwnPractitionerProfile,
    updateOwnPractitionerProfile,
    updatePractitionerStatus,
    assignPractitionerServices,
    adminListPractitioners,
    getPractitionerById,
} from '../models/practitioner.model.js';
import { supabase } from '../config/supabase.js';

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
        const data = await createPractitioner(req.body);
        res.status(201).json({ message: 'Practitioner created successfully', practitioner: data });
    } catch (error) {
        console.error('adminCreatePractitioner error:', error);
        res.status(500).json({ error: 'Failed to create practitioner' });
    }
};

/**
 * PRAC-004: PATCH /api/admin/practitioners/:id
 */
export const adminUpdatePractitioner = async (req, res) => {
    try {
        const data = await updatePractitionerById(req.params.id, req.body);
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
 * PRAC-009: PATCH /api/admin/practitioners/:id/services
 */
export const adminAssignServices = async (req, res) => {
    try {
        const { serviceIds } = req.body;
        if (!Array.isArray(serviceIds)) {
            return res.status(400).json({ error: 'Body must contain an array "serviceIds"' });
        }
        const result = await assignPractitionerServices(req.params.id, serviceIds);
        res.status(200).json({ message: 'Services assigned successfully', ...result });
    } catch (error) {
        console.error('adminAssignServices error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to assign services' });
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
        const data = await updateOwnPractitionerProfile(slug, req.body);
        res.status(200).json({ message: 'Practitioner profile updated', practitioner: data });
    } catch (error) {
        console.error('updateMyPractitionerProfile error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || 'Failed to update practitioner profile' });
    }
};
