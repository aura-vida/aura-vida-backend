import express from 'express';
import { createOrder, verifyPayment, handleWebhook, refundPayment, reconcilePaymentsHandler } from '../controllers/payment.controller.js';
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
 *       Called by the frontend to initiate payment for a session the customer wants to book.
 *       No `bookings` row is created yet — the booking details are validated, priced, and
 *       stashed on the `orders` row. The appointment is only registered once payment is
 *       verified (PAY-002/PAY-003), so an abandoned or failed checkout never creates a booking.
 *       A flat 5% tax is added to the session subtotal (price × group multiplier) before any
 *       referral credit is applied; credit never reduces the final amount below ₹100.
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
 *             required: [service_id, practitioner_slug, date, time]
 *             properties:
 *               service_id: { type: string, format: uuid, example: "064dbf93-480e-47e9-b7f3-a57e1868f599" }
 *               practitioner_slug: { type: string, example: "alex-practitioner" }
 *               date: { type: string, format: date, example: "2026-10-10" }
 *               time: { type: string, example: "10:00" }
 *               mode: { type: string, enum: [host, centre, online], default: offline }
 *               pin: { type: string, nullable: true }
 *               group_size: { type: integer, default: 1, minimum: 1, maximum: 6 }
 *               attendees: { type: array, items: { type: object }, example: [] }
 *               meeting_location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number, example: 19.0522 }
 *                   lng: { type: number, example: 72.8427 }
 *                   address: { type: string, example: "Starbucks, Bandra Kurla Complex" }
 *                   place_id: { type: string, example: "ChIJ_z_mFnb55zsR2wZ" }
 *                   pincode: { type: string, example: "400051" }
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
 *                 subtotalInr: { type: number, description: "Session price before tax (in INR)" }
 *                 taxInr: { type: number, description: "5% tax on the subtotal (in INR)" }
 *                 taxRate: { type: number, example: 0.05 }
 *       400:
 *         description: Missing/invalid booking details
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Practitioner or service not found
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
 *       On success → marks the `orders` record as `paid` and creates the `bookings` record
 *       directly as `confirmed` from the payload stashed at order-creation time.
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
 *     description: |
 *       Admin initiates a refund for a paid booking. Refunds only the session price —
 *       the 5% tax is non-refundable and is excluded from the amount sent to Razorpay.
 *       Calls Razorpay's Refund API, marks the order as refunded, and cancels the booking.
 *       This endpoint and the auto-refund triggered by cancellation (APT-004) share the
 *       same underlying logic, so the refund is only ever processed once per booking.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refund_id: { type: string }
 *                 amount_refunded_inr: { type: number, description: "Session price only — excludes tax" }
 *                 non_refundable_tax_inr: { type: number }
 *                 status: { type: string }
 *       404:
 *         description: No paid order found for this booking
 */
router.post('/payments/refund', requireAuth, requireRole('admin'), refundPayment);

/**
 * @swagger
 * /api/admin/payments/reconcile:
 *   post:
 *     summary: Reconcile local payment records against Razorpay (PAY-005)
 *     description: |
 *       Pulls Razorpay's actual captured payments for a date range and cross-checks
 *       them against the local `orders` table — the source the admin dashboard's
 *       revenue figures are read from. Self-heals any payment Razorpay captured but
 *       that was never marked paid locally (the rare case where both the client's
 *       verify call and the webhook failed to reach us), and flags anything it
 *       can't safely auto-fix (e.g. an amount mismatch, or a captured payment with
 *       no matching local order at all) for manual review.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Start of range (ISO date). Defaults to 48 hours before `to`.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: End of range (ISO date). Defaults to now.
 *     responses:
 *       200:
 *         description: Reconciliation results.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched: { type: integer }
 *                 autoFixed: { type: integer }
 *                 anomalies: { type: array, items: { type: object } }
 *       403:
 *         description: Forbidden — admin only
 */
router.post('/admin/payments/reconcile', requireAuth, requireRole('admin'), reconcilePaymentsHandler);

export default router;
