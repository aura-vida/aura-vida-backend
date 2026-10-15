import {
    createRazorpayOrder,
    verifyPaymentSignature,
    markOrderPaidAndConfirmBooking,
    verifyWebhookSignature,
    createRefund,
    reconcilePayments,
} from '../models/payment.model.js';
import { supabase } from '../config/supabase.js';
import { getPractitionerBySlug } from '../models/practitioner.model.js';
import { getServiceById } from '../models/service.model.js';
import { istToUtcIso } from '../utils/timezone.js';
import { resolveCoupon } from '../models/coupon.model.js';

// Flat tax applied to the session subtotal, client-requested for now.
// Keep in sync with SESSION_TAX_RATE in aura-vida-connect/src/lib/pricing.ts
// (that copy is display-only — this is the authoritative one).
export const SESSION_TAX_RATE = 0.05;

// ─── Helper: fetch profile full_name for client_name denorm ──────────────────
const getProfileName = async (userId) => {
    const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
    return data?.full_name || null;
};

// ─── PAY-001: Create Razorpay Order ──────────────────────────────────────────
// No booking is created here. The booking is only persisted once payment is
// verified (see markOrderPaidAndConfirmBooking) so that abandoned/failed
// checkouts never leave a registered appointment behind.
export const createOrder = async (req, res) => {
    try {
        const {
            service_id, practitioner_slug, date, time,
            mode = 'offline', pin, meeting_location,
            group_size = 1, attendees = [], coupon_code,
        } = req.body;

        if (!service_id || !practitioner_slug || !date || !time) {
            return res.status(400).json({ error: 'service_id, practitioner_slug, date, and time are required.' });
        }

        // `date`/`time` are always IST wall-clock (this platform is India-only) —
        // convert to the correct UTC instant rather than treating them as UTC.
        const scheduled_at = istToUtcIso(date, time);

        // 1. Fetch denormalized fields the eventual booking row requires
        const [practitioner, service, clientName] = await Promise.all([
            getPractitionerBySlug(practitioner_slug),
            getServiceById(service_id),
            getProfileName(req.user.id),
        ]);

        // 2. Compute amount based on selected mode (studio, online, centre, host) and group size.
        const size = Math.max(1, group_size || 1);
        const normalizedMode = (mode || '').toLowerCase();
        let privatePrice = 0;
        let groupPricePerPerson = 0;

        if (normalizedMode === 'studio') {
            privatePrice = Number(practitioner.price_studio_private) || 0;
            groupPricePerPerson = Number(practitioner.price_studio_group) || 0;
        } else if (normalizedMode === 'online') {
            privatePrice = Number(practitioner.price_online_private) || 0;
            groupPricePerPerson = Number(practitioner.price_online_group) || 0;
        } else if (normalizedMode === 'centre') {
            privatePrice = Number(practitioner.price_centre_private) || 0;
            groupPricePerPerson = Number(practitioner.price_centre_group) || 0;
        } else if (normalizedMode === 'host') {
            privatePrice = Number(practitioner.price_host_private) || 0;
            groupPricePerPerson = Number(practitioner.price_host_group) || 0;
        }

        let originalSubtotalInr = 0;
        if (size > 1 && groupPricePerPerson > 0) {
            originalSubtotalInr = groupPricePerPerson * size;
        } else if (size === 1 && privatePrice > 0) {
            originalSubtotalInr = privatePrice;
        } else if (size > 1 && privatePrice > 0) {
            originalSubtotalInr = privatePrice + Math.round(privatePrice * 0.6) * (size - 1);
        } else {
            const fallbackInr = practitioner.price_inr || 0;
            originalSubtotalInr = fallbackInr + Math.round(fallbackInr * 0.6) * Math.max(0, size - 1);
        }

        // Admin-managed coupon (see coupon.model.js) — eligibility rules
        // (first-booking-only, minimum booking amount) re-validated here
        // regardless of any earlier /api/coupons/validate preview call,
        // since that endpoint is never trusted as the source of truth.
        let couponCode = null;
        let discountPercent = 0;
        if (coupon_code) {
            const coupon = await resolveCoupon(coupon_code, req.user.id, originalSubtotalInr);
            couponCode = coupon.code;
            discountPercent = Number(coupon.discount_percent);
        }
        const discountInr = Math.round(originalSubtotalInr * discountPercent / 100);
        const subtotalInr = originalSubtotalInr - discountInr; // post-coupon, pre-tax

        // Flat tax on the (post-coupon) session subtotal. This, not any
        // client-sent value, is the authoritative amount — the frontend only
        // mirrors this for preview.
        const taxInr = Math.round(subtotalInr * SESSION_TAX_RATE);
        const totalInr = subtotalInr + taxInr;
        const amountPaise = Math.round(totalInr * 100);

        // 3. Fetch referral credit for the customer
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, credit_inr')
            .eq('id', req.user.id)
            .maybeSingle();

        const referralCredit = Number(profile?.credit_inr ?? 0);

        // 4. Create the Razorpay order, stashing the full booking payload on
        // the `orders` row so it can be materialized into `bookings` on
        // successful payment verification — never before.
        const result = await createRazorpayOrder({
            amountPaise,
            subtotalInr,
            taxInr,
            originalSubtotalInr,
            couponCode,
            discountPercent,
            discountInr,
            serviceId: service_id,
            serviceName: service.name || 'Aura Vida Session',
            groupSize: size,
            customer: {
                name: profile?.full_name || clientName || '',
                email: req.user.email || '',
                phone: '',
                userId: req.user.id,
            },
            referralCredit,
            bookingPayload: {
                client_id: req.user.id,
                client_name: clientName,
                practitioner_slug,
                practitioner_name: practitioner.name,
                item_id: service_id,
                amount: amountPaise,
                currency: 'INR',
                mode,
                scheduled_at,
                group_size: size,
                attendees: attendees || [],
                meeting_location: meeting_location || null,
                pin: pin || null,
            },
        });

        res.status(201).json({
            orderId: result.orderId,
            amount: result.amount,
            currency: result.currency,
            keyId: result.keyId,
            itemName: result.itemName,
            groupSize: result.groupSize,
            creditAppliedInr: result.creditAppliedInr,
            originalSubtotalInr,
            subtotalInr,
            taxInr,
            taxRate: SESSION_TAX_RATE,
            couponCode,
            discountPercent,
            discountInr,
        });
    } catch (err) {
        console.error('createOrder error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create payment order' });
    }
};

// ─── PAY-002: Verify Payment (called by frontend after Razorpay modal closes) ─
export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are all required.' });
        }

        const valid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!valid) {
            return res.status(400).json({ error: 'Payment signature verification failed. Payment may be fraudulent.' });
        }

        const { alreadyProcessed } = await markOrderPaidAndConfirmBooking(razorpay_order_id, razorpay_payment_id);

        res.status(200).json({
            verified: true,
            alreadyProcessed,
            message: alreadyProcessed ? 'Payment was already recorded.' : 'Payment verified. Booking confirmed!',
        });
    } catch (err) {
        console.error('verifyPayment error:', err);
        res.status(500).json({ error: err.message || 'Failed to verify payment' });
    }
};

// ─── PAY-003: Razorpay Webhook (background fallback) ─────────────────────────
// Razorpay calls this automatically when a payment completes/fails.
// Acts as a safety net if the customer closes the browser before frontend verify runs.
export const handleWebhook = async (req, res) => {
    try {
        console.log('🔔 [WEBHOOK] Received event from Razorpay...');
        // req.rawBody is set by express.raw() middleware on this route
        const rawBody = req.rawBody;
        const receivedSig = req.headers['x-razorpay-signature'];

        if (!verifyWebhookSignature(rawBody, receivedSig)) {
            console.error('❌ [WEBHOOK] Invalid signature match!');
            return res.status(400).json({ error: 'Invalid webhook signature.' });
        }

        const event = req.body;
        const eventType = event?.event;

        console.log(`✅ [WEBHOOK] Valid signature. Event Type: ${eventType}`);

        if (eventType === 'payment.captured') {
            console.log('✅ [WEBHOOK] Found payment.captured event. Attempting database update...');
            const payment = event.payload?.payment?.entity;
            if (payment?.order_id && payment?.id) {
                await markOrderPaidAndConfirmBooking(payment.order_id, payment.id);
                console.log(`✅ [WEBHOOK] Successfully recorded payment for order ${payment.order_id}!`);
            } else {
                console.log('⚠️ [WEBHOOK] Missing order_id or payment_id in the payload entity.');
            }
        }

        // Always respond 200 quickly to Razorpay to avoid retries
        res.status(200).json({ received: true });
    } catch (err) {
        console.error('handleWebhook error:', err);
        // Still respond 200 to avoid Razorpay sending the webhook again unnecessarily
        res.status(200).json({ received: true });
    }
};

// ─── PAY-004: Refund Payment ─────────────────────────────────────────────────
export const refundPayment = async (req, res) => {
    try {
        const { booking_id, reason } = req.body;
        if (!booking_id) return res.status(400).json({ error: 'booking_id is required.' });

        const refund = await createRefund(booking_id, reason || 'requested_by_customer');

        res.status(200).json({
            message: 'Refund initiated successfully.',
            refund_id: refund.id,
            amount_refunded_inr: refund.amount / 100,
            non_refundable_tax_inr: refund.non_refundable_tax_inr,
            status: refund.status,
        });
    } catch (err) {
        console.error('refundPayment error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to initiate refund' });
    }
};

// ─── PAY-005: Reconcile local orders against Razorpay's own payment records ──
// Admin-triggered audit: pulls Razorpay's actual captured payments for a date
// range and cross-checks them against our `orders` table — the source the
// admin dashboard's revenue figures are read from. Self-heals any payment
// Razorpay captured but that never got marked paid locally (both the client
// verify call and the webhook failing is rare, but this is the safety net
// for it), and flags anything it can't safely auto-fix for manual review.
export const reconcilePaymentsHandler = async (req, res) => {
    try {
        const { from, to } = req.query;

        // Default to the last 48 hours if no range is given.
        const toUnix = to ? Math.floor(new Date(to).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const fromUnix = from
            ? Math.floor(new Date(from).getTime() / 1000)
            : toUnix - 48 * 60 * 60;

        if (Number.isNaN(fromUnix) || Number.isNaN(toUnix)) {
            return res.status(400).json({ error: 'from/to must be valid dates.' });
        }

        const results = await reconcilePayments({ fromUnix, toUnix });
        res.status(200).json({
            message: 'Reconciliation complete.',
            range: { from: new Date(fromUnix * 1000).toISOString(), to: new Date(toUnix * 1000).toISOString() },
            ...results,
        });
    } catch (err) {
        console.error('reconcilePaymentsHandler error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to reconcile payments' });
    }
};
