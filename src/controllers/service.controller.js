import {
    listServices,
    getServiceById,
    createService,
    updateServiceById,
    deactivateService,
} from '../models/service.model.js';
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

// SERVICE-003 — multipart/form-data
export const adminCreateService = async (req, res) => {
    try {
        const { name, description, duration_min, price_inr, category, sort_order } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required.' });

        let image_url = req.body.image_url || null;

        // If a file was uploaded via form-data, push it to Supabase Storage
        if (req.file) {
            image_url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'services');
        }

        const service = await createService({
            name,
            description: description || null,
            duration_min: duration_min ? parseInt(duration_min) : 60,
            price_inr: price_inr ? parseFloat(price_inr) : 0,
            category: category || null,
            image_url,
            sort_order: sort_order ? parseInt(sort_order) : 0,
        });
        res.status(201).json({ message: 'Service created successfully', service });
    } catch (err) {
        console.error('adminCreateService error:', err);
        if (err.code === '23505') return res.status(409).json({ error: 'A service with this name already exists.' });
        res.status(500).json({ error: err.message || 'Failed to create service' });
    }
};

// SERVICE-004 — multipart/form-data
export const adminUpdateService = async (req, res) => {
    try {
        const fields = { ...req.body };

        // Parse numeric fields that come in as strings in form-data
        if (fields.duration_min) fields.duration_min = parseInt(fields.duration_min);
        if (fields.price_inr) fields.price_inr = parseFloat(fields.price_inr);
        if (fields.sort_order) fields.sort_order = parseInt(fields.sort_order);
        if (fields.is_active !== undefined) fields.is_active = fields.is_active === 'true';

        // If a new image was uploaded, push to Supabase Storage
        if (req.file) {
            fields.image_url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'services');
        }

        const service = await updateServiceById(req.params.id, fields);
        res.status(200).json({ message: 'Service updated successfully', service });
    } catch (err) {
        console.error('adminUpdateService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to update service' });
    }
};

// SERVICE-005
export const adminDeleteService = async (req, res) => {
    try {
        await deactivateService(req.params.id);
        res.status(200).json({ message: 'Service deactivated successfully' });
    } catch (err) {
        console.error('adminDeleteService error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to delete service' });
    }
};
