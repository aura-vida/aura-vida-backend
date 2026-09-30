import { supabase } from '../config/supabase.js';
import crypto from 'crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ─── Helper: call Razorpay REST API ──────────────────────────────────────────
const razorpayRequest = async (path, method = 'POST', body = null) => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        throw Object.assign(new Error('Razorpay credentials are not configured.'), { statusCode: 503 });
    }
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data?.error?.description || 'Razorpay API error'), { statusCode: 502 });
    return data;
};

// ─── PAY-001: Create a Razorpay order linked to a booking ────────────────────
export const createRazorpayOrder = async ({ bookingId, amountPaise, serviceName, groupSize = 1, customer, referralCredit = 0 }) => {
    // Apply referral credit on top (never go below ₹100 i.e. 10000 paise)
    const creditPaise = referralCredit * 100;
    const finalAmount = Math.max(amountPaise - creditPaise, 10000);

    const itemLabel = groupSize > 1 ? `${serviceName} (group of ${groupSize})` : serviceName;

    const order = await razorpayRequest('/orders', 'POST', {
        amount: finalAmount,
        currency: 'INR',
        receipt: `avida_${bookingId.split('-')[0]}_${Date.now()}`,
        notes: { booking_id: bookingId, item_name: itemLabel, group_size: String(groupSize) },
    });

    // Persist to orders table
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            booking_id: bookingId,
            razorpay_order_id: order.id,
            amount: finalAmount,
            currency: 'INR',
            item_id: bookingId,           // item_id = booking reference
            item_name: itemLabel,
            item_type: 'booking',
            customer_name: customer?.name || null,
            customer_email: customer?.email || null,
            customer_phone: customer?.phone || null,
            details: { group_size: groupSize, credit_applied_inr: referralCredit, user_id: customer?.userId || null },
            status: 'created',
        }])
        .select()
        .single();

    if (error) throw error;

    return {
        orderId: order.id,
        amount: finalAmount,
        currency: 'INR',
        keyId: RAZORPAY_KEY_ID,
        itemName: itemLabel,
        groupSize,
        creditAppliedInr: referralCredit,
        dbOrder: data,
    };
};

// ─── PAY-002: Verify HMAC-SHA256 signature ────────────────────────────────────
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
    if (!RAZORPAY_KEY_SECRET) throw Object.assign(new Error('Razorpay not configured.'), { statusCode: 503 });
    const expected = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return expected === signature;
};

// ─── PAY-002 / PAY-003: Mark order paid & confirm booking ────────────────────
export const markOrderPaidAndConfirmBooking = async (orderId, paymentId) => {
    // 1. Fetch the order record
    const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

    if (orderErr || !order) throw new Error('Order record not found for this razorpay_order_id');

    // Guard: already processed (idempotency)
    if (order.status === 'paid') {
        return { alreadyProcessed: true, order };
    }

    // 2. Deduct referral credit (once only — copied from old Supabase function)
    const creditApplied = Number(order.details?.credit_applied_inr ?? 0);
    const userId = typeof order.details?.user_id === 'string' ? order.details.user_id : null;
    if (creditApplied > 0 && userId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('credit_inr')
            .eq('id', userId)
            .maybeSingle();
        if (profile) {
            await supabase
                .from('profiles')
                .update({ credit_inr: Math.max(0, Number(profile.credit_inr ?? 0) - creditApplied) })
                .eq('id', userId);
        }
    }

    // 3. Mark order as paid
    const { error: updateErr } = await supabase
        .from('orders')
        .update({ razorpay_payment_id: paymentId, status: 'paid', paid_at: new Date().toISOString() })
        .eq('razorpay_order_id', orderId);

    if (updateErr) throw updateErr;

    // 4. Auto-confirm the linked booking ← KEY NEW STEP
    if (order.booking_id) {
        const { error: bookingErr } = await supabase
            .from('bookings')
            .update({ status: 'confirmed', razorpay_order_id: orderId })
            .eq('id', order.booking_id)
            .eq('status', 'pending'); // only if still pending

        if (bookingErr) console.error('Booking confirm error:', bookingErr);
    }

    return { alreadyProcessed: false, order };
};

// ─── PAY-003: Verify Razorpay webhook signature ───────────────────────────────
export const verifyWebhookSignature = (rawBody, receivedSignature) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return false;
    const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
    return expected === receivedSignature;
};

// ─── PAY-004: Create a Razorpay refund ───────────────────────────────────────
export const createRefund = async (bookingId, reason = 'requested_by_customer') => {
    // Fetch the paid order
    const { data: order, error } = await supabase
        .from('orders')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('status', 'paid')
        .maybeSingle();

    if (error || !order) throw Object.assign(new Error('No paid order found for this booking.'), { statusCode: 404 });
    if (!order.razorpay_payment_id) throw Object.assign(new Error('Payment ID missing on order.'), { statusCode: 422 });

    // Call Razorpay refund API
    const refund = await razorpayRequest(`/payments/${order.razorpay_payment_id}/refund`, 'POST', {
        amount: order.amount,  // full refund
        notes: { reason, booking_id: bookingId },
        speed: 'normal',
    });

    // Update order status
    await supabase
        .from('orders')
        .update({ status: 'refunded' })
        .eq('id', order.id);

    // Mark booking as cancelled
    await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

    return refund;
};
