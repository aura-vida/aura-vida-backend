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
import { uploadImage } from '../middleware/upload.middleware.js';

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
            image_url = await uploadImage(req.file.buffer, req.file.originalname, 'services');
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
            fields.image_url = await uploadImage(req.file.buffer, req.file.originalname, 'services');
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

// GET /api/modalities (For mobile app and external clients)
export const getModalities = async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const modalities = [
            {
                name: "Yoga",
                slug: "yoga",
                image_url: `${baseUrl}/images/modalities/modality-yoga.jpg`,
                description: "Mindful movement and breath to build strength, flexibility, and inner calm."
            },
            {
                name: "Energy Healing",
                slug: "energy-healing",
                image_url: `${baseUrl}/images/modalities/modality-energy-healing.jpg`,
                description: "Gentle hands-on work to restore your nervous system and energetic flow."
            },
            {
                name: "Sound Healing",
                slug: "sound-healing",
                image_url: `${baseUrl}/images/modalities/modality-sound-healing.jpg`,
                description: "Tibetan and crystal bowls tuned to bring deep coherence to body and mind."
            },
            {
                name: "Astrology & Tarot",
                slug: "astrology-tarot",
                image_url: `${baseUrl}/images/modalities/modality-astrology-tarot.jpg`,
                description: "Intuitive guidance, astrological insight, and archetypal card readings."
            },
            {
                name: "Meditation",
                slug: "meditation",
                image_url: `${baseUrl}/images/modalities/modality-meditation.jpg`,
                description: "Guided presence and mindfulness practices for mental clarity and stillness."
            },
            {
                name: "Breathwork",
                slug: "breathwork",
                image_url: `${baseUrl}/images/modalities/modality-breathwork.jpg`,
                description: "Conscious connected breathing for somatic release and nervous system regulation."
            },
            {
                name: "Craniosacral therapy",
                slug: "craniosacral-therapy",
                image_url: `${baseUrl}/images/modalities/modality-craniosacral.jpg`,
                description: "Subtle osteopathic touch releasing deep-seated tension in the central nervous system."
            },
            {
                name: "Theta Healing",
                slug: "theta-healing",
                image_url: `${baseUrl}/images/modalities/modality-theta-healing.jpg`,
                description: "Meditative technique accessing theta brainwaves to transform limiting beliefs."
            },
            {
                name: "Holistic Life Coaching",
                slug: "holistic-life-coaching",
                image_url: `${baseUrl}/images/modalities/modality-meditation.jpg`,
                description: "Integrative lifestyle, wellness guidance, and personal empowerment."
            }
        ];
        res.status(200).json({ modalities });
    } catch (err) {
        console.error('getModalities error:', err);
        res.status(500).json({ error: 'Failed to fetch modalities' });
    }
};
