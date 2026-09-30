import {
    createRazorpayOrder,
    verifyPaymentSignature,
    markOrderPaidAndConfirmBooking,
    verifyWebhookSignature,
    createRefund,
} from '../models/payment.model.js';
import { supabase } from '../config/supabase.js';

// ─── PAY-001: Create Razorpay Order ──────────────────────────────────────────
export const createOrder = async (req, res) => {
    try {
        const { booking_id } = req.body;
        if (!booking_id) return res.status(400).json({ error: 'booking_id is required.' });

        // 1. Fetch the booking + service price
        const { data: booking, error: bErr } = await supabase
            .from('bookings')
            .select('*, item_id, amount, group_size, client_id, status')
            .eq('id', booking_id)
            .single();

        if (bErr || !booking) return res.status(404).json({ error: 'Booking not found.' });
        if (booking.client_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        if (booking.status !== 'pending') return res.status(400).json({ error: `Booking is already '${booking.status}'. Cannot create a payment for it.` });

        // Check if order already exists for this booking
        const { data: existing } = await supabase
            .from('orders')
            .select('razorpay_order_id, amount, status')
            .eq('booking_id', booking_id)
            .maybeSingle();

        if (existing && existing.status === 'paid') {
            return res.status(409).json({ error: 'This booking has already been paid.' });
        }

        // 2. Fetch referral credit for the customer
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, credit_inr')
            .eq('id', req.user.id)
            .maybeSingle();

        const referralCredit = Number(profile?.credit_inr ?? 0);

        // 3. Get service name
        const { data: service } = await supabase
            .from('services')
            .select('name')
            .eq('id', booking.item_id)
            .maybeSingle();

        // 4. Create Razorpay order (amount already stored in booking as paise)
        const result = await createRazorpayOrder({
            bookingId: booking_id,
            amountPaise: booking.amount,  // already in paise from APT-001
            serviceName: service?.name || 'Aura Vida Session',
            groupSize: booking.group_size || 1,
            customer: {
                name: profile?.full_name || '',
                email: req.user.email || '',
                phone: '',
                userId: req.user.id,
            },
            referralCredit,
        });

        res.status(201).json({
            orderId: result.orderId,
            amount: result.amount,
            currency: result.currency,
            keyId: result.keyId,
            itemName: result.itemName,
            groupSize: result.groupSize,
            creditAppliedInr: result.creditAppliedInr,
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
            const payment = event.payload?.payment?.entity;
            if (payment?.order_id && payment?.id) {
                await markOrderPaidAndConfirmBooking(payment.order_id, payment.id);
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
            status: refund.status,
        });
    } catch (err) {
        console.error('refundPayment error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to initiate refund' });
    }
};
