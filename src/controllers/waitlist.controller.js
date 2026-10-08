import { addToWaitlist } from '../models/waitlist.model.js';

// POST /api/waitlist
export const joinWaitlist = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'A valid email is required.' });
        }

        const data = await addToWaitlist(email);
        res.status(201).json({ message: 'You have been added to the waitlist!', waitlist: data });
    } catch (err) {
        // Postgres unique violation code
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This email is already on the waitlist.' });
        }
        console.error('joinWaitlist error:', err);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
};
