import {
    listStaticEvents,
    getStaticEvent,
    createEventBookingOrder,
    verifyEventPaymentAndConfirm,
    getEventBookings,
    getEventBookingById,
} from '../models/event.model.js';

/**
 * GET /events or /api/events
 * List all available static events with pricing breakdown
 */
export const getEventsList = async (req, res) => {
    try {
        const events = listStaticEvents();
        res.status(200).json({ events });
    } catch (err) {
        console.error('getEventsList error:', err);
        res.status(500).json({ error: 'Failed to retrieve events' });
    }
};

/**
 * GET /events/:id or /api/events/:id
 * Get single event details with pricing breakdown
 */
export const getEventDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const event = getStaticEvent(id);
        if (!event) {
            return res.status(404).json({ error: `Event '${id}' not found` });
        }
        res.status(200).json({ event });
    } catch (err) {
        console.error('getEventDetail error:', err);
        res.status(500).json({ error: 'Failed to retrieve event details' });
    }
};

/**
 * POST /events/bookings/create-order or /api/events/bookings/create-order
 * Create Razorpay order for an event booking
 */
export const createOrder = async (req, res) => {
    try {
        const { eventId, customerName, customerEmail, customerPhone } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: 'eventId is required' });
        }

        // Use logged-in user profile details if customer details are missing
        const name = customerName || req.user?.name || req.user?.full_name;
        const email = customerEmail || req.user?.email;
        const phone = customerPhone || req.user?.phone;
        const userId = req.user?.id || null;

        if (!name || !email || !phone) {
            return res.status(400).json({
                error: 'customerName, customerEmail, and customerPhone are required to book an event.',
            });
        }

        const result = await createEventBookingOrder({
            eventId,
            customerName: name,
            customerEmail: email,
            customerPhone: phone,
            userId,
        });

        res.status(200).json(result);
    } catch (err) {
        console.error('createEventOrder error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create event booking order' });
    }
};

/**
 * POST /events/bookings/verify-payment or /api/events/bookings/verify-payment
 * Verify Razorpay payment signature and confirm booking
 */
export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                error: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
            });
        }

        const result = await verifyEventPaymentAndConfirm({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });

        res.status(200).json(result);
    } catch (err) {
        console.error('verifyEventPayment error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Payment verification failed' });
    }
};

/**
 * GET /events/bookings or /api/events/bookings
 * Get bookings for the authenticated user, or all if admin
 */
export const listBookings = async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'admin';
        const userId = req.user?.id || null;
        const email = req.user?.email || null;

        if (!userId && !email && !isAdmin) {
            return res.status(401).json({ error: 'Authentication required to view booking history' });
        }

        const bookings = await getEventBookings({ userId, email, isAdmin });
        res.status(200).json({ bookings });
    } catch (err) {
        console.error('listEventBookings error:', err);
        res.status(500).json({ error: 'Failed to retrieve event bookings' });
    }
};

/**
 * GET /events/bookings/:id or /api/events/bookings/:id
 * Get single booking by ID
 */
export const getBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await getEventBookingById(id);

        if (!booking) {
            return res.status(404).json({ error: 'Event booking not found' });
        }

        // Check ownership if user is logged in and not admin
        if (req.user && req.user.role !== 'admin') {
            const isOwner = booking.user_id === req.user.id || booking.customer_email === req.user.email;
            if (!isOwner) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        res.status(200).json({ booking });
    } catch (err) {
        console.error('getBooking error:', err);
        res.status(500).json({ error: 'Failed to retrieve event booking' });
    }
};

