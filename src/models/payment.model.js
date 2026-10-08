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
    console.log(`[PAYMENT MODEL] Marking order ${orderId} as paid with payment ${paymentId}...`);
    const { error: updateErr } = await supabase
        .from('orders')
        .update({ razorpay_payment_id: paymentId, status: 'paid', paid_at: new Date().toISOString() })
        .eq('razorpay_order_id', orderId);

    if (updateErr) throw updateErr;

    // 4. Auto-confirm the linked booking ← KEY NEW STEP
    if (order.booking_id) {
        console.log(`[PAYMENT MODEL] Confirming linked booking ${order.booking_id}...`);

        // Fetch booking to see if it needs an online link
        const { data: booking } = await supabase
            .from('bookings')
            .select('mode, scheduled_at, meeting_location, practitioner_slug, attendees, group_size')
            .eq('id', order.booking_id)
            .maybeSingle();

        let updatedLocation = booking?.meeting_location || null;

        if (booking?.mode === 'online') {
            try {
                // Dynamically import to avoid top-level issues if the file misses env vars globally
                const { createMeetEvent } = await import('../services/calendar.service.js');
                const meetRes = await createMeetEvent({
                    summary: `Aura Vida Session: ${order.item_name || ''}`,
                    description: `Booking Reference: ${order.booking_id}`,
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

        const { error: bookingErr } = await supabase
            .from('bookings')
            .update({ status: 'confirmed', razorpay_order_id: orderId, meeting_location: updatedLocation })
            .eq('id', order.booking_id)
            .eq('status', 'pending'); // only if still pending

        if (!bookingErr) {
            console.log(`✅ [PAYMENT MODEL] Booking ${order.booking_id} confirmed successfully!`);

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
                        reference_id: order.booking_id,
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
                        reference_id: order.booking_id,
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
                        subject: `Your Aura Vida Session is Confirmed ✨`,
                        html: `
                          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
                            <h1 style="font-size:24px;color:#1a5c38;margin-bottom:4px;">Session Confirmed!</h1>
                            <p style="color:#555;margin-top:0;">Hi ${name || 'there'} 👋, your booking has been confirmed and payment received.</p>
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                            <table style="width:100%;font-size:14px;color:#333;">
                              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;font-weight:600;">${order.item_name || 'Aura Vida Session'}</td></tr>
                              <tr><td style="padding:8px 0;color:#888;">Date &amp; Time</td><td style="padding:8px 0;font-weight:600;">${scheduledDate} IST</td></tr>
                              <tr><td style="padding:8px 0;color:#888;">Mode</td><td style="padding:8px 0;font-weight:600;">${booking?.mode || 'session'}</td></tr>
                              ${booking?.group_size > 1 ? `<tr><td style="padding:8px 0;color:#888;">Group size</td><td style="padding:8px 0;font-weight:600;">${booking.group_size} people</td></tr>` : ''}
                            </table>
                            ${meetSection}
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                            <p style="font-size:12px;color:#aaa;">Aura Vida &bull; Questions? Reply to this email or visit auravida.com</p>
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
