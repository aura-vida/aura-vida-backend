import express from 'express';
import {
    getEventsList,
    getEventDetail,
    createOrder,
    verifyPayment,
    listBookings,
    getBooking,
    getBookingStatus,
} from '../controllers/event.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

// ── Event Information & Catalog ──────────────────────────────
router.get('/', getEventsList);

// ── Event Booking & Razorpay Flow ────────────────────────────
// Note: Bookings routes are defined before `/:id` to prevent route collision
router.post('/bookings/create-order', requireAuth, createOrder);
router.post('/bookings/verify-payment', requireAuth, verifyPayment);
router.get('/bookings/status/:eventId', requireAuth, getBookingStatus);
router.get('/bookings', requireAuth, listBookings);
router.get('/bookings/:id', optionalAuth, getBooking);

// ── Specific Event Details ───────────────────────────────────
router.get('/:id', getEventDetail);

export default router;

