import {
    createSpace,
    listPublicSpaces,
    listSpaces,
    adminCreateSpace,
    adminUpdateSpace,
    updateSpaceStatus,
    deleteSpace,
    packSpaceSlot,
    releaseSpaceSlot,
    addSpaceImages,
    deleteSpaceImage,
} from '../models/space.model.js';
import { notifyAdmins, emailAdmins } from '../models/notification.model.js';
import { uploadImageWithPath } from '../middleware/upload.middleware.js';

const VALID_STATUSES = ['new', 'contacted', 'approved', 'declined'];

// POST /api/admin/spaces  — admin create
export const adminCreateSpaceController = async (req, res) => {
    try {
        const { contact_name, email, space_name, address, city, pin, capacity, phone, space_type, amenities, availability, notes, status } = req.body;
        if (!space_name || !address || !city || !pin) {
            return res.status(400).json({ error: 'space_name, address, city, and pin are required.' });
        }
        const data = await adminCreateSpace({
            contact_name: contact_name || 'Admin Created',
            email: (email || 'admin@kusala.in').toLowerCase().trim(),
            space_name,
            address,
            city,
            pin,
            capacity: parseInt(capacity) || 10,
            phone: phone || null,
            space_type: space_type || null,
            amenities: Array.isArray(amenities) ? amenities : (amenities ? String(amenities).split(',').map(s => s.trim()).filter(Boolean) : []),
            availability: availability || null,
            notes: notes || null,
            status: status || 'approved',
        });
        res.status(201).json({ message: 'Space created successfully', space: data });
    } catch (err) {
        console.error('adminCreateSpaceController error:', err);
        res.status(500).json({ error: err.message || 'Failed to create space' });
    }
};

// PUT /api/admin/spaces/:id  — admin update full space
export const adminUpdateSpaceController = async (req, res) => {
    try {
        const updateFields = { ...req.body };
        if (updateFields.email) updateFields.email = updateFields.email.toLowerCase().trim();
        if (updateFields.capacity) updateFields.capacity = parseInt(updateFields.capacity);
        if (typeof updateFields.amenities === 'string') {
            updateFields.amenities = updateFields.amenities.split(',').map(s => s.trim()).filter(Boolean);
        }
        delete updateFields.id;
        delete updateFields.created_at;
        // space_images is a related table embedded into list responses for
        // display, not a real column on partner_spaces — the admin edit form
        // sends the whole row back on save, so this must be stripped or the
        // update fails with "column does not exist".
        delete updateFields.space_images;

        const data = await adminUpdateSpace(req.params.id, updateFields);
        res.status(200).json({ message: 'Space updated successfully', space: data });
    } catch (err) {
        console.error('adminUpdateSpaceController error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update space' });
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

// POST /api/spaces  — public, multipart/form-data (field name "images", up to 20 files, optional)
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
            // multipart/form-data sends this as a comma-separated string, a
            // plain JSON request sends it as an array already — handle both.
            amenities: Array.isArray(amenities) ? amenities : (amenities ? String(amenities).split(',').map(s => s.trim()).filter(Boolean) : []),
            availability: availability || null,
            notes: notes || null,
        });

        const files = req.files || [];
        if (files.length > 0) {
            try {
                const uploads = await Promise.all(
                    files.map((f) => uploadImageWithPath(f.buffer, f.originalname, `spaces/${data.id}`))
                );
                await addSpaceImages(data.id, uploads);
            } catch (uploadErr) {
                console.error('submitSpace image upload error:', uploadErr);
                // the submission itself already succeeded — don't fail the whole request over photos
            }
        }

        // Notify admins asynchronously (non-blocking) — both the in-app bell
        // and a real email, since a new submission shouldn't rely on an
        // admin happening to be logged in and looking at the bell.
        try {
            await notifyAdmins(
                'New Space Submission',
                `${data.space_name} in ${data.city} submitted by ${data.contact_name}.`,
                'space',
                data.id
            );
            await emailAdmins(
                `New Partner Space Submission — ${data.space_name}`,
                `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
                    <h1 style="font-size:20px;color:#1a5c38;margin-bottom:4px;">New Partner Space Submission</h1>
                    <p style="color:#555;">Someone has submitted a space to be listed as a Kusala partner location.</p>
                    <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;margin-top:12px;">
                      <tr><td style="padding:6px 0;color:#888;">Space Name</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.space_name}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">Contact</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.contact_name}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">Email</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.email}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">City</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.city}</td></tr>
                      <tr><td style="padding:6px 0;color:#888;">Capacity</td><td style="padding:6px 0;font-weight:600;text-align:right;">${data.capacity}</td></tr>
                    </table>
                    <p style="color:#888;font-size:12px;margin-top:20px;">Review and approve this space from the Admin Dashboard.</p>
                  </div>
                `
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

// POST /api/admin/spaces/:id/pack-slot — pack/reserve slot
export const adminPackSpaceSlotController = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, start_time, end_time, reason, notify_owner } = req.body;

        if (!date || !start_time || !end_time) {
            return res.status(400).json({ error: 'date, start_time, and end_time are required.' });
        }

        const result = await packSpaceSlot(id, { date, start_time, end_time, reason, notify_owner });
        res.status(201).json({ message: 'Slot successfully packed / reserved.', ...result });
    } catch (err) {
        console.error('adminPackSpaceSlotController error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to pack slot' });
    }
};

// DELETE /api/admin/spaces/:id/packed-slots/:slotId — release slot
export const adminReleaseSpaceSlotController = async (req, res) => {
    try {
        const { id, slotId } = req.params;
        const updatedSpace = await releaseSpaceSlot(id, slotId);
        res.status(200).json({ message: 'Slot successfully released.', space: updatedSpace });
    } catch (err) {
        console.error('adminReleaseSpaceSlotController error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to release slot' });
    }
};

// POST /api/admin/spaces/:id/images  — admin only, multipart ("images" field, up to 20 files)
export const adminUploadSpaceImages = async (req, res) => {
    try {
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ error: 'At least one image file is required.' });
        }

        const uploads = await Promise.all(
            files.map((f) => uploadImageWithPath(f.buffer, f.originalname, `spaces/${req.params.id}`))
        );
        const images = await addSpaceImages(req.params.id, uploads);
        res.status(201).json({ message: 'Images uploaded successfully', images });
    } catch (err) {
        console.error('adminUploadSpaceImages error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to upload images' });
    }
};

// DELETE /api/admin/spaces/:id/images/:imageId  — admin only
export const adminDeleteSpaceImage = async (req, res) => {
    try {
        await deleteSpaceImage(req.params.imageId);
        res.status(200).json({ message: 'Image deleted successfully' });
    } catch (err) {
        console.error('adminDeleteSpaceImage error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete image' });
    }
};
