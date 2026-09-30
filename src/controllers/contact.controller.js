import * as contactModel from '../models/contact.model.js';

export const submitEnquiry = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'name, email, and message are required.' });
        }
        const data = await contactModel.createEnquiry({ name, email, phone: phone || null, message });
        res.status(201).json({ message: 'Enquiry submitted successfully.', data });
    } catch (error) {
        console.error('submitEnquiry error:', error);
        res.status(500).json({ error: error.message || 'Failed to submit enquiry' });
    }
};

export const listEnquiries = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const result = await contactModel.listEnquiries(page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('listEnquiries error:', error);
        res.status(500).json({ error: error.message || 'Failed to list enquiries' });
    }
};
