import {
    createSpace,
    listPublicSpaces,
    listSpaces,
    updateSpaceStatus,
    deleteSpace,
} from '../models/space.model.js';
import { notifyAdmins } from '../models/notification.model.js';

const VALID_STATUSES = ['new', 'contacted', 'approved', 'declined'];

// POST /api/spaces  — public
export const submitSpace = async (req, res) => {
    try {
        const { contact_name, email, space_name, address, city, pin, capacity, phone, space_type, amenities, availability, notes } = req.body;

        if (!contact_name || !email || !space_name || !address || !city || !pin || !capacity) {
            return res.status(400).json({ error: 'contact_name, email, space_name, address, city, pin, and capacity are required.' });
        }

        const data = await createSpace({
            contact_name,
            email: email.toLowerCase().trim(),
            space_name,
            address,
            city,
            pin,
            capacity: parseInt(capacity),
            phone: phone || null,
            space_type: space_type || null,
            amenities: amenities || [],
            availability: availability || null,
            notes: notes || null,
        });

        // Notify admins asynchronously (non-blocking)
        try {
            await notifyAdmins(
                'New Space Submission',
                `${data.space_name} in ${data.city} submitted by ${data.contact_name}.`,
                'space',
                data.id
            );
        } catch (_) {}

        res.status(201).json({ message: 'Space submission received! We will be in touch.', space: data });
    } catch (err) {
        console.error('submitSpace error:', err);
        res.status(500).json({ error: 'Failed to submit space' });
    }
};

// GET /api/spaces  — public search by PIN
export const getPublicSpaces = async (req, res) => {
    try {
        const { pin } = req.query;
        if (!pin) {
            return res.status(400).json({ error: 'pin query parameter is required.' });
        }

        const spaces = await listPublicSpaces(pin);
        res.status(200).json({ spaces });
    } catch (err) {
        console.error('getPublicSpaces error:', err);
        res.status(500).json({ error: 'Failed to fetch spaces' });
    }
};

// GET /api/admin/spaces  — admin only
export const adminListSpaces = async (req, res) => {
    try {
        const { data, pagination } = await listSpaces(req.query);
        res.status(200).json({ spaces: data, pagination });
    } catch (err) {
        console.error('adminListSpaces error:', err);
        res.status(500).json({ error: 'Failed to fetch spaces' });
    }
};

// PATCH /api/admin/spaces/:id/status  — admin only
export const adminUpdateSpaceStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        }
        const data = await updateSpaceStatus(req.params.id, status);
        res.status(200).json({ message: 'Space status updated', space: data });
    } catch (err) {
        console.error('adminUpdateSpaceStatus error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update status' });
    }
};

// DELETE /api/admin/spaces/:id  — admin only
export const adminDeleteSpace = async (req, res) => {
    try {
        await deleteSpace(req.params.id);
        res.status(200).json({ message: 'Space submission deleted successfully' });
    } catch (err) {
        console.error('adminDeleteSpace error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete space' });
    }
};
