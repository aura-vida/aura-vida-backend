import {
    listServices,
    adminListServices,
    getServiceById,
    listServicesByPractitioner,
    createServiceForPractitioner,
    updateServiceForPractitioner,
    deleteServiceForPractitioner,
} from '../models/service.model.js';
import { getPractitionerByUserId } from '../models/practitioner.model.js';
import { uploadToSupabase } from '../middleware/upload.middleware.js';

// SERVICE-001
export const getServices = async (req, res) => {
    try {
        const { data, pagination } = await listServices(req.query);
        res.status(200).json({ services: data, pagination });
    } catch (err) {
        console.error('getServices error:', err);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
};

// Admin: list all services (active + hidden), read-only — each row carries
// which practitioner created it.
export const getAdminServices = async (req, res) => {
    try {
        const { data, pagination } = await adminListServices(req.query);
        res.status(200).json({ services: data, pagination });
    } catch (err) {
        console.error('getAdminServices error:', err);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
};

// SERVICE-002
export const getService = async (req, res) => {
    try {
        const service = await getServiceById(req.params.id);
        res.status(200).json({ service });
    } catch (err) {
        console.error('getService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to fetch service' });
    }
};

// ─── Practitioner self-service ──────────────────────────────────────────────

// GET /api/practitioners/me/services
export const getMyServices = async (req, res) => {
    try {
        const practitioner = await getPractitionerByUserId(req.user.id);
        const services = await listServicesByPractitioner(practitioner.id);
        res.status(200).json({ services });
    } catch (err) {
        console.error('getMyServices error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to fetch your services' });
    }
};

// POST /api/practitioners/me/services — multipart/form-data
export const createMyService = async (req, res) => {
    try {
        const practitioner = await getPractitionerByUserId(req.user.id);
        const { name, description, price_inr, category, sort_order } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required.' });

        let image_url = req.body.image_url || null;
        if (req.file) {
            image_url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'services');
        }

        const service = await createServiceForPractitioner(practitioner.id, {
            name,
            description: description || null,
            price_inr: price_inr ? parseFloat(price_inr) : 0,
            category: category || null,
            image_url,
            sort_order: sort_order ? parseInt(sort_order) : 0,
        });
        res.status(201).json({ message: 'Service created successfully', service });
    } catch (err) {
        console.error('createMyService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create service' });
    }
};

// PATCH /api/practitioners/me/services/:id — multipart/form-data
export const updateMyService = async (req, res) => {
    try {
        const practitioner = await getPractitionerByUserId(req.user.id);
        const fields = { ...req.body };

        if (fields.price_inr) fields.price_inr = parseFloat(fields.price_inr);
        if (fields.sort_order) fields.sort_order = parseInt(fields.sort_order);
        // is_active arrives as a real boolean on a plain JSON request, but as
        // the string "true"/"false" on multipart/form-data — `=== 'true'`
        // alone would silently turn every JSON boolean (true included) into
        // false, since `true === 'true'` is false.
        if (fields.is_active !== undefined) {
            fields.is_active = typeof fields.is_active === 'string' ? fields.is_active === 'true' : !!fields.is_active;
        }

        if (req.file) {
            fields.image_url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'services');
        }

        const service = await updateServiceForPractitioner(req.params.id, practitioner.id, fields);
        res.status(200).json({ message: 'Service updated successfully', service });
    } catch (err) {
        console.error('updateMyService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to update service' });
    }
};

// DELETE /api/practitioners/me/services/:id
export const deleteMyService = async (req, res) => {
    try {
        const practitioner = await getPractitionerByUserId(req.user.id);
        await deleteServiceForPractitioner(req.params.id, practitioner.id);
        res.status(200).json({ message: 'Service deleted successfully' });
    } catch (err) {
        console.error('deleteMyService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to delete service' });
    }
};
