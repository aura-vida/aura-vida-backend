import express from 'express';
import { createOrder, verifyPayment, handleWebhook, refundPayment } from '../controllers/payment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Razorpay payment flow (create order → verify → webhook → refund)
 */

/**
 * @swagger
 * /api/payments/create-order:
 *   post:
 *     summary: Create Razorpay payment order (PAY-001)
 *     description: |
 *       Called by the frontend after APT-001 to initiate payment.
 *       Reads the price from the existing booking record instead of a hardcoded catalog.
 *       Applies any referral credit stored in the customer's profile (credit never reduces amount below ₹100).
 *       Returns the Razorpay `orderId` and `keyId` to open the checkout modal.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id]
 *             properties:
 *               booking_id: { type: string, format: uuid, description: "ID of the pending booking to pay for" }
 *     responses:
 *       201:
 *         description: Razorpay order created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId: { type: string }
 *                 amount: { type: integer, description: "Amount in paise (INR × 100)" }
 *                 currency: { type: string, example: INR }
 *                 keyId: { type: string, description: "Razorpay public key — pass to checkout modal" }
 *                 itemName: { type: string }
 *                 groupSize: { type: integer }
 *                 creditAppliedInr: { type: number, description: "Referral credit deducted (in INR)" }
 *       400:
 *         description: Booking not pending or already paid
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 */
router.post('/payments/create-order', requireAuth, requireRole('client'), createOrder);

/**
 * @swagger
 * /api/payments/verify:
 *   post:
 *     summary: Verify Razorpay payment signature (PAY-002)
 *     description: |
 *       Called by the frontend inside the Razorpay `handler` callback after payment is completed.
 *       Verifies the HMAC-SHA256 signature to ensure payment is genuine.
 *       On success → marks the `orders` record as `paid` and the linked `bookings` record as `confirmed`.
 *       Deducts referral credit exactly once.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified. Booking auto-confirmed.
 *       400:
 *         description: Invalid signature or missing fields
 */
router.post('/payments/verify', requireAuth, verifyPayment);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Razorpay webhook receiver (PAY-003)
 *     description: |
 *       Registered in the Razorpay Dashboard as a webhook endpoint.
 *       Acts as a safety net in case the customer closes the browser before the frontend verify call runs.
 *       Validates the `x-razorpay-signature` header using the webhook secret, then triggers the same
 *       payment confirmation + booking status update. Idempotent — safe to receive multiple times.
 *       
 *       **No Bearer auth** — authenticated via `x-razorpay-signature` header.
 *     tags: [Payments]
 *     parameters:
 *       - in: header
 *         name: x-razorpay-signature
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Webhook received (always 200 to prevent Razorpay retrying)
 */
// NOTE: This route uses express.raw() to get the raw body for signature verification
// The rawBody is attached in index.js using a special middleware before express.json()
router.post('/payments/webhook', handleWebhook);

/**
 * @swagger
 * /api/payments/refund:
 *   post:
 *     summary: Refund a payment (PAY-004)
 *     description: Admin initiates a full refund for a paid booking. Calls Razorpay Refund API, marks the order as refunded, and cancels the booking.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id]
 *             properties:
 *               booking_id: { type: string, format: uuid }
 *               reason: { type: string, example: "requested_by_customer" }
 *     responses:
 *       200:
 *         description: Refund initiated.
 *       404:
 *         description: No paid order found for this booking
 */
router.post('/payments/refund', requireAuth, requireRole('admin'), refundPayment);

export default router;
