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

// ─── PAY-001: Create a Razorpay order for a not-yet-created booking ──────────
// No `bookings` row exists at this point. The full booking payload is stashed
// on the `orders` row (`booking_payload`) and only materialized into
// `bookings` once payment is verified (see markOrderPaidAndConfirmBooking) —
// this guarantees abandoned/failed checkouts never register an appointment.
export const createRazorpayOrder = async ({
    serviceId, amountPaise, subtotalInr, taxInr, originalSubtotalInr, couponCode, discountPercent, discountInr,
    serviceName, groupSize = 1, customer, referralCredit = 0, bookingPayload,
}) => {
    // Apply referral credit on top (never go below ₹1 i.e. 100 paise, which is Razorpay's minimum)
    const creditPaise = referralCredit * 100;
    const finalAmount = Math.max(amountPaise - creditPaise, 100);

    const itemLabel = groupSize > 1 ? `${serviceName} (group of ${groupSize})` : serviceName;

    const order = await razorpayRequest('/orders', 'POST', {
        amount: finalAmount,
        currency: 'INR',
        receipt: `avida_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        notes: {
            service_id: serviceId,
            item_name: itemLabel,
            group_size: String(groupSize),
            subtotal_inr: String(subtotalInr ?? ''),
            tax_inr: String(taxInr ?? ''),
            ...(couponCode ? { coupon_code: couponCode, discount_inr: String(discountInr ?? '') } : {}),
        },
    });

    // Persist to orders table (booking_id stays null until payment succeeds)
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            booking_id: null,
            razorpay_order_id: order.id,
            amount: finalAmount,
            currency: 'INR',
            item_id: serviceId,
            item_name: itemLabel,
            item_type: 'booking',
            customer_name: customer?.name || null,
            customer_email: customer?.email || null,
            customer_phone: customer?.phone || null,
            details: {
                group_size: groupSize,
                credit_applied_inr: referralCredit,
                user_id: customer?.userId || null,
                subtotal_inr: subtotalInr,
                tax_inr: taxInr,
                original_subtotal_inr: originalSubtotalInr,
                coupon_code: couponCode || null,
                discount_percent: discountPercent || 0,
                discount_inr: discountInr || 0,
            },
            booking_payload: bookingPayload,
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

// ─── PAY-002/003: Email the customer a payment receipt ───────────────────────
// Fetches the authoritative payment record from Razorpay (amount, method,
// timestamp) and emails it to the paying customer. Called right after the
// order is marked 'paid' — independent of booking confirmation outcome,
// since the receipt documents the payment itself, not the appointment.
const sendPaymentReceiptEmail = async (order, paymentId) => {
    if (!order.customer_email) {
        console.warn('[PAYMENT MODEL] No customer_email on order — skipping receipt email.');
        return;
    }

    const payment = await razorpayRequest(`/payments/${paymentId}`, 'GET');

    // Validate the amount Razorpay actually captured matches what we charged —
    // a mismatch here would mean something is wrong upstream (tax/credit math,
    // a tampered client request, etc.) and should never silently happen.
    if (Number(payment.amount) !== Number(order.amount)) {
        console.error(
            `🚨 [PAYMENT MODEL] Amount mismatch for order ${order.razorpay_order_id}: ` +
            `Razorpay captured ${payment.amount}, expected ${order.amount}.`
        );
    }

    const subtotalInr = Number(order.details?.subtotal_inr ?? 0);
    const taxInr = Number(order.details?.tax_inr ?? 0);
    const creditInr = Number(order.details?.credit_applied_inr ?? 0);
    const originalSubtotalInr = Number(order.details?.original_subtotal_inr ?? subtotalInr);
    const couponCode = order.details?.coupon_code || null;
    const discountInr = Number(order.details?.discount_inr ?? 0);

    const methodLabels = { card: 'Card', upi: 'UPI', netbanking: 'Net Banking', wallet: 'Wallet', emi: 'EMI' };
    const methodLabel = methodLabels[payment.method] || payment.method || 'Online Payment';
    const methodDetail = payment.method === 'card' && payment.card
        ? ` (${payment.card.network || ''} •••• ${payment.card.last4 || ''})`.trim()
        : payment.method === 'upi' && payment.vpa
            ? ` (${payment.vpa})`
            : payment.method === 'netbanking' && payment.bank
                ? ` (${payment.bank})`
                : '';

    const paidAt = new Date((payment.created_at || Math.floor(Date.now() / 1000)) * 1000)
        .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

    const amountInr = (Number(payment.amount ?? order.amount) / 100).toLocaleString('en-IN');

    const { sendEmail } = await import('../services/email.service.js');
    await sendEmail({
        to: order.customer_email,
        subject: `Your Kusala Payment Receipt — ₹${amountInr}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
            <h1 style="font-size:22px;color:#1a5c38;margin-bottom:4px;">Payment Receipt</h1>
            <p style="color:#555;margin-top:0;">Hi ${order.customer_name || 'there'}, thank you for your payment. Here's your receipt.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#888;">Receipt No.</td><td style="padding:8px 0;font-weight:600;text-align:right;">${payment.id}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Order ID</td><td style="padding:8px 0;font-weight:600;text-align:right;">${order.razorpay_order_id}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Item</td><td style="padding:8px 0;font-weight:600;text-align:right;">${order.item_name || 'Kusala Session'}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Date</td><td style="padding:8px 0;font-weight:600;text-align:right;">${paidAt} IST</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Payment Method</td><td style="padding:8px 0;font-weight:600;text-align:right;">${methodLabel}${methodDetail}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Status</td><td style="padding:8px 0;font-weight:600;text-align:right;color:#1a5c38;">Paid</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <table style="width:100%;font-size:14px;color:#333;">
              ${originalSubtotalInr ? `<tr><td style="padding:6px 0;color:#888;">Session Price</td><td style="padding:6px 0;text-align:right;">₹${originalSubtotalInr.toLocaleString('en-IN')}</td></tr>` : ''}
              ${couponCode && discountInr > 0 ? `<tr><td style="padding:6px 0;color:#1a5c38;">Coupon ${couponCode} (−${order.details?.discount_percent}%)</td><td style="padding:6px 0;text-align:right;color:#1a5c38;">−₹${discountInr.toLocaleString('en-IN')}</td></tr>` : ''}
              ${taxInr ? `<tr><td style="padding:6px 0;color:#888;">Tax (5%)</td><td style="padding:6px 0;text-align:right;">₹${taxInr.toLocaleString('en-IN')}</td></tr>` : ''}
              ${creditInr > 0 ? `<tr><td style="padding:6px 0;color:#1a5c38;">Referral Credit Applied</td><td style="padding:6px 0;text-align:right;color:#1a5c38;">−₹${creditInr.toLocaleString('en-IN')}</td></tr>` : ''}
            </table>
            <table style="width:100%;font-size:15px;color:#111;">
              <tr><td style="padding:8px 0;font-weight:700;">Total Paid</td><td style="padding:8px 0;font-weight:700;text-align:right;">₹${amountInr}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <p style="font-size:12px;color:#aaa;">This is an automated receipt for your records. Kusala &bull; Questions? Reply to this email or visit kusala.in</p>
          </div>
        `,
    });

    console.log(`✅ [EMAIL] Payment receipt sent to ${order.customer_email} for payment ${paymentId}`);
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
    console.log(`[PAYMENT MODEL] Marking order ${orderId} as paid with payment ${paymentId}...`);
    const { error: updateErr } = await supabase
        .from('orders')
        .update({ razorpay_payment_id: paymentId, status: 'paid', paid_at: new Date().toISOString() })
        .eq('razorpay_order_id', orderId);

    if (updateErr) throw updateErr;

    // 3b. Email the customer their payment receipt. Non-blocking and
    // independent of booking confirmation below — the payment succeeded
    // regardless of what happens to the booking record.
    try {
        await sendPaymentReceiptEmail(order, paymentId);
    } catch (receiptErr) {
        console.error('❌ [PAYMENT MODEL] Failed to send payment receipt email:', receiptErr.message);
    }

    // 4. Materialize (or confirm) the booking ← KEY STEP
    // Payment-first flow: no `bookings` row exists yet — it's created here,
    // already `confirmed`, from the payload stashed at order-creation time.
    // Legacy orders (created under the old pre-payment-booking flow, if any
    // are still in flight at deploy time) fall back to updating the existing
    // pending row instead of inserting a new one.
    let bookingId = order.booking_id;
    const booking = bookingId
        ? (await supabase
            .from('bookings')
            .select('mode, scheduled_at, meeting_location, practitioner_slug, attendees, group_size')
            .eq('id', bookingId)
            .maybeSingle()).data
        : order.booking_payload;

    if (booking) {
        console.log(`[PAYMENT MODEL] Confirming booking ${bookingId || '(new)'}...`);

        let updatedLocation = booking?.meeting_location || null;

        if (booking?.mode === 'online') {
            try {
                // Dynamically import to avoid top-level issues if the file misses env vars globally
                const { createMeetEvent } = await import('../services/calendar.service.js');
                const meetRes = await createMeetEvent({
                    summary: `Kusala Session: ${order.item_name || ''}`,
                    description: `Booking Reference: ${bookingId || orderId}`,
                    startTime: new Date(booking.scheduled_at),
                    attendeeEmails: [order.customer_email].filter(Boolean)
                });

                if (meetRes) {
                    updatedLocation = { ...(booking.meeting_location || {}), meet_link: meetRes.meetLink, event_id: meetRes.eventId };
                    console.log(`✅ [CALENDAR] Meet link generated: ${meetRes.meetLink}`);
                }
            } catch (err) {
                console.error('[PAYMENT MODEL] Could not generate Meet Link:', err.message);
            }
        }

        let bookingErr;
        if (bookingId) {
            // Legacy path: flip the pre-existing pending booking to confirmed
            const res = await supabase
                .from('bookings')
                .update({ status: 'confirmed', razorpay_order_id: orderId, meeting_location: updatedLocation })
                .eq('id', bookingId)
                .eq('status', 'pending'); // only if still pending
            bookingErr = res.error;
        } else {
            // New payment-first path: payment is verified, so create the
            // booking now — directly as `confirmed`. Nothing is registered
            // if the customer never reaches this point.
            const { data: newBooking, error } = await supabase
                .from('bookings')
                .insert([{
                    client_id: booking.client_id,
                    client_name: booking.client_name,
                    practitioner_slug: booking.practitioner_slug,
                    practitioner_name: booking.practitioner_name,
                    item_id: booking.item_id,
                    amount: booking.amount,
                    currency: booking.currency || 'INR',
                    mode: booking.mode,
                    pin: booking.pin || null,
                    scheduled_at: booking.scheduled_at,
                    status: 'confirmed',
                    group_size: booking.group_size || 1,
                    attendees: booking.attendees || [],
                    meeting_location: updatedLocation,
                    razorpay_order_id: orderId,
                }])
                .select()
                .single();
            bookingErr = error;
            if (!error) {
                bookingId = newBooking.id;
                await supabase.from('orders').update({ booking_id: bookingId }).eq('razorpay_order_id', orderId);
            }
        }

        if (!bookingErr) {
            console.log(`✅ [PAYMENT MODEL] Booking ${bookingId} confirmed successfully!`);

            // 5. SEND CONFIRMATION NOTIFICATIONS TO BOTH CUSTOMER AND PRACTITIONER
            try {
                const isOnline = booking?.mode === 'online';
                const meetLink = updatedLocation?.meet_link;

                const clientMsg = isOnline && meetLink
                    ? `Your online session is confirmed. Join here: ${meetLink}`
                    : `Your session booking has been confirmed and paid.`;

                const pracMsg = isOnline && meetLink
                    ? `A customer has booked an online session. Meet link: ${meetLink}`
                    : `A customer has confirmed and paid for a session booking.`;

                // Notify Customer
                if (order.details?.user_id) {
                    await supabase.from('notifications').insert({
                        user_id: order.details.user_id,
                        title: 'Booking Confirmed!',
                        message: clientMsg,
                        type: 'booking',
                        reference_id: bookingId,
                    });
                }

                // Notify Practitioner
                const { data: prac } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('practitioner_slug', booking?.practitioner_slug)
                    .maybeSingle();

                if (prac?.id) {
                    await supabase.from('notifications').insert({
                        user_id: prac.id,
                        title: 'New Confirmed Booking',
                        message: pracMsg,
                        type: 'booking',
                        reference_id: bookingId,
                    });
                }
            } catch (notifErr) {
                console.error('❌ [PAYMENT MODEL] Failed to send push notifications:', notifErr.message);
            }

            // 6. SEND CONFIRMATION EMAILS TO ALL ATTENDEES (group circle support)
            try {
                const { sendEmail } = await import('../services/email.service.js');
                const isOnline = booking?.mode === 'online';
                const meetLink = updatedLocation?.meet_link;

                // Build the list of recipients from the attendees stored on the booking.
                // Normalize: attendees can be { name, email } objects (new) or plain strings (old).
                const rawAttendees = Array.isArray(booking?.attendees) ? booking.attendees : [];
                const normalizedAttendees = rawAttendees.map(a => {
                    if (typeof a === 'string') {
                        // attendees column is text[] — objects get stored as JSON strings like '{"name":"...","email":"..."}'
                        if (a.trim().startsWith('{')) {
                            try {
                                const parsed = JSON.parse(a);
                                return { name: parsed.name || '', email: parsed.email || null };
                            } catch (_) { }
                        }
                        // Plain string: only use as email if it looks like one
                        return { name: a, email: a.includes('@') && !a.includes('{') ? a.trim() : null };
                    }
                    if (a && typeof a === 'object') return { name: a.name || '', email: a.email || null };
                    return null;
                }).filter(a => a && a.email);

                console.log(`[EMAIL DEBUG] Raw attendees from DB:`, JSON.stringify(rawAttendees));
                console.log(`[EMAIL DEBUG] Normalized attendees with emails:`, JSON.stringify(normalizedAttendees));

                // Primary customer email from order (the person who paid)
                const primaryEmail = order.customer_email;
                const primaryName = order.customer_name || 'Guest';

                // Union: primary customer first, then all OTHER attendees (dedup by email)
                const seenEmails = new Set(primaryEmail ? [primaryEmail.toLowerCase()] : []);
                const allRecipients = [
                    ...(primaryEmail ? [{ name: primaryName, email: primaryEmail }] : []),
                    ...normalizedAttendees.filter(a => {
                        const lc = a.email.toLowerCase();
                        if (seenEmails.has(lc)) return false;
                        seenEmails.add(lc);
                        return true;
                    }),
                ];

                const scheduledDate = booking?.scheduled_at
                    ? new Date(booking.scheduled_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'full',
                        timeStyle: 'short',
                    })
                    : 'As scheduled';

                const meetSection = isOnline && meetLink
                    ? `
                      <div style="margin: 24px 0; text-align: center;">
                        <a href="${meetLink}" style="display:inline-block;background:#1a5c38;color:#fff;padding:14px 32px;border-radius:9999px;font-weight:600;font-size:15px;text-decoration:none;">🎥 Join Your Session</a>
                        <p style="margin-top:12px;font-size:12px;color:#888;">${meetLink}</p>
                      </div>`
                    : `<p style="color:#555;">Your practitioner will share the session location details separately.</p>`;

                const emailPromises = allRecipients.map(({ name, email }) =>
                    sendEmail({
                        to: email,
                        subject: `Your Kusala Session is Confirmed ✨`,
                        html: `
                          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
                            <h1 style="font-size:24px;color:#1a5c38;margin-bottom:4px;">Session Confirmed!</h1>
                            <p style="color:#555;margin-top:0;">Hi ${name || 'there'} 👋, your booking has been confirmed and payment received.</p>
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                            <table style="width:100%;font-size:14px;color:#333;">
                              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;font-weight:600;">${order.item_name || 'Kusala Session'}</td></tr>
                              <tr><td style="padding:8px 0;color:#888;">Date &amp; Time</td><td style="padding:8px 0;font-weight:600;">${scheduledDate} IST</td></tr>
                              <tr><td style="padding:8px 0;color:#888;">Mode</td><td style="padding:8px 0;font-weight:600;">${booking?.mode || 'session'}</td></tr>
                              ${booking?.group_size > 1 ? `<tr><td style="padding:8px 0;color:#888;">Group size</td><td style="padding:8px 0;font-weight:600;">${booking.group_size} people</td></tr>` : ''}
                            </table>
                            ${meetSection}
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                            <p style="font-size:12px;color:#aaa;">Kusala &bull; Questions? Reply to this email or visit kusala.in</p>
                          </div>
                        `,
                    })
                );

                await Promise.allSettled(emailPromises);
                console.log(`✅ [EMAIL] Sent confirmation emails to ${allRecipients.length} attendee(s).`);
            } catch (emailErr) {
                console.error('❌ [PAYMENT MODEL] Failed to send attendee emails:', emailErr.message);
            }
        } else {
            console.error('❌ [PAYMENT MODEL] Booking confirm error:', bookingErr);
        }
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
// Only the session price is refundable — the 5% tax is not. The `.eq('status',
// 'paid')` guard below also makes this idempotent: once an order is marked
// 'refunded' here, a second call for the same booking finds no 'paid' order
// and safely throws instead of double-refunding.
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

    // Refund only the session price, excluding the non-refundable 5% tax.
    // Orders created before the tax feature have no `subtotal_inr` on record —
    // those never had tax applied in the first place, so refund them in full.
    const subtotalInr = Number(order.details?.subtotal_inr ?? 0);
    const subtotalPaise = Math.round(subtotalInr * 100);
    // Never refund more than was actually charged (covers the case where
    // referral credit reduced the amount actually paid below the subtotal).
    const refundAmount = subtotalPaise > 0 ? Math.min(subtotalPaise, order.amount) : order.amount;
    const nonRefundableTaxPaise = order.amount - refundAmount;

    // Call Razorpay refund API
    const refund = await razorpayRequest(`/payments/${order.razorpay_payment_id}/refund`, 'POST', {
        amount: refundAmount,
        notes: {
            reason,
            booking_id: bookingId,
            non_refundable_tax_inr: String(nonRefundableTaxPaise / 100),
        },
        speed: 'normal',
    });

    // Update order status, keeping the refund breakdown alongside the
    // existing payment details for consistent display anywhere this order
    // is read (admin payments list, receipts, etc).
    await supabase
        .from('orders')
        .update({
            status: 'refunded',
            details: {
                ...order.details,
                refund_amount_inr: refundAmount / 100,
                non_refundable_tax_inr: nonRefundableTaxPaise / 100,
            },
        })
        .eq('id', order.id);

    // Mark booking as cancelled
    await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

    return { ...refund, non_refundable_tax_inr: nonRefundableTaxPaise / 100 };
};

// ─── PAY-005: Reconcile local `orders` against Razorpay's actual payments ────
// The admin dashboard's revenue figures are read from our own `orders` table,
// which is only as accurate as our webhook/verify-call recording of each
// payment. This cross-checks Razorpay's own payment records (the ground
// truth) against what we have stored, and self-heals the common failure mode
// (a payment captured on Razorpay but never recorded locally because both the
// client's verify call AND the webhook failed to reach us) by re-running the
// same confirmation logic the webhook itself uses.
const RECONCILE_PAGE_SIZE = 100;
const RECONCILE_MAX_PAYMENTS = 1000; // safety cap per run

export const reconcilePayments = async ({ fromUnix, toUnix }) => {
    const results = { matched: 0, autoFixed: 0, anomalies: [] };

    let skip = 0;
    let fetched = 0;
    while (fetched < RECONCILE_MAX_PAYMENTS) {
        const page = await razorpayRequest(
            `/payments?from=${fromUnix}&to=${toUnix}&count=${RECONCILE_PAGE_SIZE}&skip=${skip}`,
            'GET'
        );
        const payments = page.items || [];
        if (payments.length === 0) break;

        for (const payment of payments) {
            // Only payments that actually took the customer's money matter here.
            if (payment.status !== 'captured') continue;

            const { data: order } = await supabase
                .from('orders')
                .select('*')
                .eq('razorpay_order_id', payment.order_id)
                .maybeSingle();

            if (!order) {
                // Razorpay has a captured payment for an order we have no record
                // of at all — nothing to self-heal (no booking payload to
                // materialize), so just flag it for manual review.
                results.anomalies.push({
                    type: 'no_local_order',
                    razorpay_order_id: payment.order_id,
                    razorpay_payment_id: payment.id,
                    amount: payment.amount,
                });
                continue;
            }

            if (order.status === 'paid') {
                if (Number(order.amount) !== Number(payment.amount)) {
                    results.anomalies.push({
                        type: 'amount_mismatch',
                        razorpay_order_id: payment.order_id,
                        razorpay_payment_id: payment.id,
                        razorpay_amount: payment.amount,
                        local_amount: order.amount,
                    });
                } else {
                    results.matched += 1;
                }
                continue;
            }

            // Razorpay says captured, but our order never got marked paid —
            // the exact gap both the webhook and verify-call exist to cover
            // for each other against. Self-heal using the same logic.
            try {
                await markOrderPaidAndConfirmBooking(payment.order_id, payment.id);
                results.autoFixed += 1;
                results.anomalies.push({
                    type: 'auto_fixed',
                    razorpay_order_id: payment.order_id,
                    razorpay_payment_id: payment.id,
                    amount: payment.amount,
                });
            } catch (fixErr) {
                results.anomalies.push({
                    type: 'fix_failed',
                    razorpay_order_id: payment.order_id,
                    razorpay_payment_id: payment.id,
                    amount: payment.amount,
                    error: fixErr.message,
                });
            }
        }

        fetched += payments.length;
        skip += RECONCILE_PAGE_SIZE;
        if (!page.count || page.count < RECONCILE_PAGE_SIZE) break; // last page
    }

    return results;
};
