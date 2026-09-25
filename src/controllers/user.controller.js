import { getUserProfile, updateUserProfile, getUserAppointments, linkPractitionerSlug, deleteUserAccount } from '../models/user.model.js';

/**
 * USER-001: GET /api/users/me
 * Access: Customer, Practitioner (any logged-in user)
 */
export const getMe = async (req, res) => {
    try {
        const profile = await getUserProfile(req.user.id);
        res.status(200).json({ profile });
    } catch (error) {
        console.error('getMe error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

/**
 * USER-002: PATCH /api/users/me
 * Access: Customer, Practitioner (any logged-in user)
 */
export const updateMe = async (req, res) => {
    try {
        const updatedProfile = await updateUserProfile(req.user.id, req.body);
        res.status(200).json({ message: 'Profile updated successfully', profile: updatedProfile });
    } catch (error) {
        console.error('updateMe error:', error);
        const status = error.statusCode || 500;
        const message = error.statusCode ? error.message : 'Failed to update profile';
        res.status(status).json({ error: message });
    }
};

/**
 * USER-003: GET /api/users/me/appointments
 * Access: Customer only
 */
export const getMyAppointments = async (req, res) => {
    try {
        const { data, pagination } = await getUserAppointments(req.user.id, req.query);
        res.status(200).json({ appointments: data, pagination });
    } catch (error) {
        console.error('getMyAppointments error:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
};

/**
 * USER-004: DELETE /api/users/me
 * Access: Customer only
 * Body: { confirmation: true }
 */
export const deleteMe = async (req, res) => {
    try {
        const { confirmation } = req.body;
        if (confirmation !== true) {
            return res.status(400).json({ error: 'confirmation must be true to delete your account' });
        }
        await deleteUserAccount(req.user.id);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('deleteMe error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
};

/**
 * USER-ADMIN: PATCH /api/users/admin/:id/link-practitioner
 * Access: Admin only
 */
export const adminLinkPractitioner = async (req, res) => {
    try {
        const { practitioner_slug } = req.body;
        if (!practitioner_slug) return res.status(400).json({ error: 'practitioner_slug is required' });

        const profile = await linkPractitionerSlug(req.params.id, practitioner_slug);
        res.status(200).json({ message: 'Practitioner profile successfully linked to user', profile });
    } catch (error) {
        console.error('adminLinkPractitioner error:', error);
        res.status(500).json({ error: 'Failed to link practitioner' });
    }
};
