import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { sendEmail } from '../services/email.service.js';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Configurable GST percentage (temporarily disabled platform-wide)
// To re-enable in the future, set ENABLE_GST = true or set ENABLE_GST=true in environment variables.
export const ENABLE_GST = process.env.ENABLE_GST === 'true'; // defaults to false (disabled)
export const ORIGINAL_EVENT_GST_PERCENTAGE = process.env.EVENT_GST_PERCENTAGE
    ? Number(process.env.EVENT_GST_PERCENTAGE)
    : 5;
export const EVENT_GST_PERCENTAGE = ENABLE_GST ? ORIGINAL_EVENT_GST_PERCENTAGE : 0;

// ─── Static Events Catalog ───────────────────────────────────────────────────
export const STATIC_EVENTS = {
    'breathe-release-return': {
        id: 'breathe-release-return',
        title: 'Breathe. Release. Return.',
        subtitle: 'A guided breathwork workshop with Neelam Chheda',
        guide: {
            name: 'Neelam Chheda',
            craft: 'Breathwork & Elemental Healing',
            slug: 'neelam-chheda',
            photo: '/images/journal/neelam-chheda.jpg',
        },
        description: `Most of us carry more than we realise: tension in the body, a mind that won’t settle, emotions we never found time to feel. Breathwork gives your body a safe, simple way to let go.\n\nJoin Neelam Chheda, a breathwork guide who works with all five elements, for a 2-hour workshop. You’ll learn the technique, then be guided through a deep breathwork journey. You’ll leave feeling lighter, calmer and more connected to yourself.`,
        schedule: {
            date: 'Sunday, 6 December 2026',
            isoDate: '2026-12-06',
            time: '11:00 AM – 1:00 PM',
            duration: '2 hours',
            venue: 'Eclipse Wellbeing – Yoga Studio, Santacruz (West), Mumbai',
            status: 'Open (limited seats)',
        },
        pricing: {
            basePriceInr: 2500,
            currency: 'INR',
        },
        whatToExpect: [
            'A short introduction to breathwork and what may come up, such as tingling, emotion, laughter or stillness.',
            'A step-by-step demonstration of the technique.',
            'A guided breathwork journey with music.',
            'Deep relaxation to bring you back gently.',
            'A short sharing circle.',
            'Two simple practices to take home: The 40 CCB breath (1 minute a round), and a daily solar plexus balance exercise (1 to 2 minutes).',
        ],
        goodToKnow: [
            'No prior experience needed.',
            'Wear comfortable clothes and bring a water bottle.',
            'Eye covers are provided.',
            'Not suitable for people who are pregnant or have epilepsy, heart conditions or recent surgery.',
            'Please message us before booking if you\'re unsure about suitability.',
        ],
        image: '/images/journal/neelam-chheda.jpg',
    },
};

/**
 * Dynamically calculates the pricing breakdown for an event based on its base price
 * and the configured GST rate.
 */
export const calculateEventPrice = (basePriceInr, gstPercent = EVENT_GST_PERCENTAGE, quantity = 1) => {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const unitPrice = Number(basePriceInr);
    const base = unitPrice * qty;
    const gstRate = ENABLE_GST ? Number(gstPercent) : 0;
    const gstAmount = ENABLE_GST ? Math.round((base * gstRate) / 100) : 0;
    const totalAmount = base + gstAmount;
    const amountPaise = totalAmount * 100;

    return {
        unitPrice,
        ticketQuantity: qty,
        baseAmount: base,
        gstPercentage: gstRate,
        gstAmount,
        totalAmount,
        amountPaise,
        currency: 'INR',
    };
};

/**
 * Returns all static events with calculated pricing breakdown.
 */
export const listStaticEvents = () => {
    return Object.values(STATIC_EVENTS).map((event) => ({
        ...event,
        pricingBreakdown: calculateEventPrice(event.pricing.basePriceInr, EVENT_GST_PERCENTAGE),
    }));
};

/**
 * Returns a single static event by ID with its calculated pricing breakdown.
 */
export const getStaticEvent = (eventId) => {
    const event = STATIC_EVENTS[eventId];
    if (!event) return null;
    return {
        ...event,
        pricingBreakdown: calculateEventPrice(event.pricing.basePriceInr, EVENT_GST_PERCENTAGE),
    };
};

// ─── Helper: Razorpay REST Call ──────────────────────────────────────────────
const razorpayRequest = async (path, method = 'POST', body = null) => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        throw Object.assign(new Error('Razorpay credentials are not configured in environment.'), { statusCode: 503 });
    }
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
        throw Object.assign(new Error(data?.error?.description || 'Razorpay API error'), { statusCode: 502 });
    }
    return data;
};

/**
 * Checks if a user already has a CONFIRMED booking for a specific event.
 * Matches by userId or customerEmail.
 */
export const hasUserBookedEvent = async ({ eventId, userId = null, email = null }) => {
    if (!eventId || (!userId && !email)) {
        return { isBooked: false, totalTickets: 0, booking: null, bookings: [] };
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : null;

    try {
        let query = supabase
            .from('event_bookings')
            .select('*')
            .eq('event_id', eventId)
            .eq('booking_status', 'CONFIRMED');

        if (userId && normalizedEmail) {
            query = query.or(`user_id.eq.${userId},customer_email.eq.${normalizedEmail}`);
        } else if (userId) {
            query = query.eq('user_id', userId);
        } else if (normalizedEmail) {
            query = query.eq('customer_email', normalizedEmail);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
            const totalTickets = data.reduce((acc, b) => acc + (Number(b.ticket_quantity) || 1), 0);
            return { isBooked: true, totalTickets, booking: data[0], bookings: data };
        }
    } catch (err) {
        console.warn('[EVENT MODEL] Error in hasUserBookedEvent event_bookings check, trying fallback:', err.message);
    }

    // Fallback check against orders table
    try {
        let query = supabase
            .from('orders')
            .select('*')
            .eq('item_id', eventId)
            .eq('status', 'paid');

        if (normalizedEmail) {
            query = query.eq('customer_email', normalizedEmail);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
            const mapped = data.map((d) => ({
                id: d.id,
                event_id: d.item_id,
                event_name: d.item_name,
                user_id: d.details?.user_id || userId,
                customer_name: d.customer_name,
                customer_email: d.customer_email,
                customer_phone: d.customer_phone,
                ticket_quantity: Number(d.details?.ticket_quantity) || 1,
                ticket_price: Number(d.details?.ticket_price) || Math.round((d.details?.base_amount || 2500) / (d.details?.ticket_quantity || 1)),
                base_amount: Number(d.details?.base_amount) || 2500,
                gst_percentage: Number(d.details?.gst_percentage) || 5,
                gst_amount: Number(d.details?.gst_amount) || 125,
                total_amount: Number(d.details?.total_amount) || 2625,
                currency: d.currency || 'INR',
                razorpay_order_id: d.razorpay_order_id,
                razorpay_payment_id: d.razorpay_payment_id,
                payment_status: 'SUCCESS',
                booking_status: 'CONFIRMED',
                created_at: d.created_at,
                updated_at: d.updated_at || d.created_at,
            }));
            const totalTickets = mapped.reduce((acc, b) => acc + (b.ticket_quantity || 1), 0);
            return { isBooked: true, totalTickets, booking: mapped[0], bookings: mapped };
        }
    } catch (err) {
        console.warn('[EVENT MODEL] Error in fallback orders check:', err.message);
    }

    return { isBooked: false, totalTickets: 0, booking: null, bookings: [] };
};

/**
 * Creates a Razorpay order for an event booking, persists initial booking as PENDING.
 * Supports multiple tickets per order.
 */
export const createEventBookingOrder = async ({
    eventId,
    customerName,
    customerEmail,
    customerPhone,
    ticketQuantity = 1,
    userId = null,
}) => {
    const event = getStaticEvent(eventId);
    if (!event) {
        throw Object.assign(new Error(`Event '${eventId}' not found.`), { statusCode: 404 });
    }

    if (!customerName || !customerEmail || !customerPhone) {
        throw Object.assign(new Error('customerName, customerEmail, and customerPhone are required.'), { statusCode: 400 });
    }

    const qty = Math.max(1, parseInt(ticketQuantity, 10) || 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        throw Object.assign(new Error('ticketQuantity must be an integer between 1 and 20.'), { statusCode: 400 });
    }

    const pricing = calculateEventPrice(event.pricing.basePriceInr, EVENT_GST_PERCENTAGE, qty);

    // Create order with Razorpay
    const receipt = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const razorpayOrder = await razorpayRequest('/orders', 'POST', {
        amount: pricing.amountPaise,
        currency: 'INR',
        receipt,
        notes: {
            event_id: event.id,
            event_name: event.title,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            ticket_quantity: String(pricing.ticketQuantity),
            ticket_price: String(pricing.unitPrice),
            base_amount: String(pricing.baseAmount),
            gst_amount: String(pricing.gstAmount),
            total_amount: String(pricing.totalAmount),
        },
    });

    const bookingRow = {
        event_id: event.id,
        event_name: event.title,
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail.trim().toLowerCase(),
        customer_phone: customerPhone.trim(),
        ticket_quantity: pricing.ticketQuantity,
        ticket_price: pricing.unitPrice,
        base_amount: pricing.baseAmount,
        gst_percentage: pricing.gstPercentage,
        gst_amount: pricing.gstAmount,
        total_amount: pricing.totalAmount,
        currency: 'INR',
        razorpay_order_id: razorpayOrder.id,
        payment_status: 'PENDING',
        booking_status: 'PENDING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    let savedBooking = null;

    try {
        // Primary persistence: event_bookings table
        const { data, error } = await supabase
            .from('event_bookings')
            .insert([bookingRow])
            .select()
            .single();

        if (error) throw error;
        savedBooking = data;
    } catch (dbErr) {
        console.warn('[EVENT MODEL] Could not insert into event_bookings, falling back to orders table:', dbErr.message);

        // Fallback persistence to existing orders table if migration not yet applied in Supabase
        await supabase
            .from('orders')
            .insert([{
                razorpay_order_id: razorpayOrder.id,
                amount: pricing.amountPaise,
                currency: 'INR',
                item_id: event.id,
                item_name: event.title,
                item_type: 'event',
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                details: {
                    user_id: userId,
                    ticket_quantity: pricing.ticketQuantity,
                    ticket_price: pricing.unitPrice,
                    base_amount: pricing.baseAmount,
                    gst_percentage: pricing.gstPercentage,
                    gst_amount: pricing.gstAmount,
                    total_amount: pricing.totalAmount,
                    event_id: event.id,
                    event_name: event.title,
                },
                status: 'created',
            }])
            .then();

        savedBooking = { id: razorpayOrder.id, ...bookingRow };
    }

    return {
        orderId: razorpayOrder.id,
        amount: pricing.amountPaise,
        currency: 'INR',
        keyId: RAZORPAY_KEY_ID,
        pricing,
        event: {
            id: event.id,
            title: event.title,
            subtitle: event.subtitle,
            schedule: event.schedule,
        },
        booking: savedBooking,
    };
};

/**
 * Verifies Razorpay payment signature and marks the event booking CONFIRMED.
 */
export const verifyEventPaymentAndConfirm = async ({ razorpay_order_id, razorpay_payment_id, razorpay_signature, userId = null }) => {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw Object.assign(new Error('razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.'), { statusCode: 400 });
    }

    // 1. Verify HMAC signature
    if (!RAZORPAY_KEY_SECRET) {
        throw Object.assign(new Error('Razorpay secret not configured.'), { statusCode: 503 });
    }

    const expected = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expected !== razorpay_signature) {
        throw Object.assign(new Error('Invalid payment signature.'), { statusCode: 400 });
    }

    const now = new Date().toISOString();

    // 2. Fetch and update in event_bookings
    let booking = null;

    try {
        const { data: existing, error: fetchErr } = await supabase
            .from('event_bookings')
            .select('*')
            .eq('razorpay_order_id', razorpay_order_id)
            .maybeSingle();

        if (existing) {
            // Guard: Idempotency
            if (existing.booking_status === 'CONFIRMED') {
                return { alreadyConfirmed: true, booking: existing };
            }

            const updateFields = {
                razorpay_payment_id,
                payment_status: 'SUCCESS',
                booking_status: 'CONFIRMED',
                updated_at: now,
            };
            if (!existing.user_id && userId) {
                updateFields.user_id = userId;
            }

            const { data: updated, error: updateErr } = await supabase
                .from('event_bookings')
                .update(updateFields)
                .eq('razorpay_order_id', razorpay_order_id)
                .select()
                .single();

            if (!updateErr && updated) {
                booking = updated;
            }
        }
    } catch (e) {
        console.warn('[EVENT MODEL] event_bookings update failed, checking orders table fallback:', e.message);
    }

    // Also update orders table if present
    await supabase
        .from('orders')
        .update({
            razorpay_payment_id,
            status: 'paid',
            paid_at: now,
        })
        .eq('razorpay_order_id', razorpay_order_id)
        .then();

    if (!booking) {
        // Reconstruct from orders table or static event if event_bookings table wasn't available
        const { data: ord } = await supabase
            .from('orders')
            .select('*')
            .eq('razorpay_order_id', razorpay_order_id)
            .maybeSingle();

        const evt = getStaticEvent(ord?.item_id || 'breathe-release-return') || STATIC_EVENTS['breathe-release-return'];
        const qty = Number(ord?.details?.ticket_quantity) || 1;
        const unitPrice = Number(ord?.details?.ticket_price) || Math.round((Number(ord?.details?.base_amount) || 2500) / qty);
        booking = {
            id: ord?.id || razorpay_order_id,
            event_id: evt.id,
            event_name: evt.title,
            user_id: ord?.details?.user_id || userId || null,
            customer_name: ord?.customer_name || 'Guest',
            customer_email: ord?.customer_email || '',
            customer_phone: ord?.customer_phone || '',
            ticket_quantity: qty,
            ticket_price: unitPrice,
            base_amount: Number(ord?.details?.base_amount) || (unitPrice * qty),
            gst_percentage: Number(ord?.details?.gst_percentage) || 5,
            gst_amount: Number(ord?.details?.gst_amount) || 0,
            total_amount: Number(ord?.details?.total_amount) || (unitPrice * qty),
            currency: 'INR',
            razorpay_order_id,
            razorpay_payment_id,
            payment_status: 'SUCCESS',
            booking_status: 'CONFIRMED',
            created_at: ord?.created_at || now,
            updated_at: now,
        };
    } else {
        booking.ticket_quantity = Number(booking.ticket_quantity) || 1;
        booking.ticket_price = Number(booking.ticket_price) || Math.round(Number(booking.base_amount) / booking.ticket_quantity);
    }

    // 3. Send email confirmation to customer
    try {
        const evt = getStaticEvent(booking.event_id) || STATIC_EVENTS['breathe-release-return'];
        const ticketQty = Number(booking.ticket_quantity) || 1;
        const ticketUnit = Number(booking.ticket_price) || Math.round(Number(booking.base_amount) / ticketQty);

        await sendEmail({
            to: booking.customer_email,
            subject: `[Kusala] Workshop Booking Confirmed – ${booking.event_name}`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #1e293b; background-color: #f8fafc;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #0f172a; margin: 0; font-size: 26px; font-weight: 600;">Kuśala</h1>
                        <p style="color: #0d9488; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Workshop Ticket Confirmed</p>
                    </div>

                    <div style="background-color: #ffffff; padding: 28px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <h2 style="font-size: 20px; color: #0f172a; margin-top: 0; font-weight: 600;">Dear ${booking.customer_name},</h2>
                        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                            Your place is confirmed for <strong>${booking.event_name}</strong>. We look forward to welcoming you to this transformative breathwork experience.
                        </p>

                        <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 14px; padding: 18px; margin: 20px 0;">
                            <h3 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #0f766e;">Event Details</h3>
                            <p style="margin: 4px 0; font-size: 14px; color: #134e4a;"><strong>Event:</strong> ${booking.event_name}</p>
                            <p style="margin: 4px 0; font-size: 14px; color: #134e4a;"><strong>Date:</strong> ${evt.schedule.date}</p>
                            <p style="margin: 4px 0; font-size: 14px; color: #134e4a;"><strong>Time:</strong> ${evt.schedule.time} (${evt.schedule.duration})</p>
                            <p style="margin: 4px 0; font-size: 14px; color: #134e4a;"><strong>Venue / Location:</strong> ${evt.schedule.venue}</p>
                            <p style="margin: 4px 0; font-size: 14px; color: #134e4a;"><strong>Guide:</strong> ${evt.guide.name} (${evt.guide.craft})</p>
                        </div>

                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
                            <h3 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Booking & Payment Summary</h3>
                            <table style="width: 100%; font-size: 14px; color: #334155;">
                                <tr>
                                    <td style="padding: 4px 0;">Booking Status</td>
                                    <td style="padding: 4px 0; text-align: right; color: #15803d; font-weight: 600;">Confirmed</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;">Price per Ticket</td>
                                    <td style="padding: 4px 0; text-align: right;">₹${ticketUnit.toLocaleString('en-IN')}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;">Number of Tickets</td>
                                    <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #0f172a;">${ticketQty} Ticket${ticketQty > 1 ? 's' : ''}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;">Subtotal</td>
                                    <td style="padding: 4px 0; text-align: right;">₹${Number(booking.base_amount).toLocaleString('en-IN')}</td>
                                </tr>
                                ${Number(booking.gst_amount) > 0 ? `<tr>
                                    <td style="padding: 4px 0;">GST (${booking.gst_percentage}%)</td>
                                    <td style="padding: 4px 0; text-align: right;">₹${Number(booking.gst_amount).toLocaleString('en-IN')}</td>
                                </tr>` : ''}
                                <tr style="border-top: 1px solid #cbd5e1; font-weight: 600; color: #0f172a;">
                                    <td style="padding: 8px 0; font-size: 15px;">Total Amount Paid</td>
                                    <td style="padding: 8px 0; text-align: right; color: #0d9488; font-size: 16px;">₹${Number(booking.total_amount).toLocaleString('en-IN')}</td>
                                </tr>
                            </table>
                            <div style="font-size: 11px; color: #64748b; margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                                <p style="margin: 2px 0;">Booking / Order ID: <code style="font-family: monospace;">${booking.razorpay_order_id || booking.id}</code></p>
                                <p style="margin: 2px 0;">Payment ID: <code style="font-family: monospace;">${razorpay_payment_id}</code></p>
                            </div>
                        </div>

                        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 1.5;">
                            <p style="margin: 0 0 6px 0;"><strong>Things to remember:</strong></p>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li>Wear loose, comfortable clothing.</li>
                                <li>Bring a personal water bottle (eye covers are provided).</li>
                                <li>Please arrive 10–15 minutes early to settle in.</li>
                            </ul>
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8;">
                        <p style="margin: 0;">Kuśala · Holistic Wellness & Healing Sanctuary</p>
                    </div>
                </div>
            `,
        });
    } catch (mailErr) {
        console.error('[EVENT MODEL] Failed to send event confirmation email:', mailErr.message);
    }

    return { success: true, booking };
};

/**
 * Returns all event bookings for a specific user (by userId or email) or all bookings for admin.
 */
export const getEventBookings = async ({ userId = null, email = null, isAdmin = false }) => {
    try {
        let query = supabase
            .from('event_bookings')
            .select('*')
            .order('created_at', { ascending: false });

        if (!isAdmin) {
            if (userId && email) {
                query = query.or(`user_id.eq.${userId},customer_email.eq.${email.trim().toLowerCase()}`);
            } else if (userId) {
                query = query.eq('user_id', userId);
            } else if (email) {
                query = query.eq('customer_email', email.trim().toLowerCase());
            } else {
                return [];
            }
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
            return data.map((b) => {
                const qty = Number(b.ticket_quantity) || 1;
                const unitPrice = Number(b.ticket_price) || Math.round(Number(b.base_amount) / qty);
                return {
                    ...b,
                    ticket_quantity: qty,
                    ticket_price: unitPrice,
                };
            });
        }
        return [];
    } catch (err) {
        console.warn('[EVENT MODEL] Error fetching from event_bookings, falling back to orders:', err.message);

        // Fallback to orders table
        let query = supabase
            .from('orders')
            .select('*')
            .eq('item_type', 'event')
            .order('created_at', { ascending: false });

        const { data } = await query;
        const normEmail = email ? email.trim().toLowerCase() : null;
        const filtered = (data || []).filter((o) => {
            if (isAdmin) return true;
            if (normEmail && o.customer_email?.toLowerCase() === normEmail) return true;
            if (userId && o.details?.user_id === userId) return true;
            return false;
        });

        return filtered.map((o) => {
            const qty = Number(o.details?.ticket_quantity) || 1;
            const unitPrice = Number(o.details?.ticket_price) || Math.round((Number(o.details?.base_amount) || 2500) / qty);
            return {
                id: o.id,
                event_id: o.item_id,
                event_name: o.item_name,
                user_id: o.details?.user_id || null,
                customer_name: o.customer_name,
                customer_email: o.customer_email,
                customer_phone: o.customer_phone,
                ticket_quantity: qty,
                ticket_price: unitPrice,
                base_amount: Number(o.details?.base_amount) || (unitPrice * qty),
                gst_percentage: Number(o.details?.gst_percentage) || 5,
                gst_amount: Number(o.details?.gst_amount) || 0,
                total_amount: Number(o.details?.total_amount) || (unitPrice * qty),
                currency: o.currency || 'INR',
                razorpay_order_id: o.razorpay_order_id,
                razorpay_payment_id: o.razorpay_payment_id,
                payment_status: o.status === 'paid' ? 'SUCCESS' : 'PENDING',
                booking_status: o.status === 'paid' ? 'CONFIRMED' : 'PENDING',
                created_at: o.created_at,
                updated_at: o.updated_at || o.created_at,
            };
        });
    }
};

/**
 * Returns a single event booking by ID or razorpay_order_id.
 */
export const getEventBookingById = async (id) => {
    try {
        const { data, error } = await supabase
            .from('event_bookings')
            .select('*')
            .or(`id.eq.${id},razorpay_order_id.eq.${id}`)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            const qty = Number(data.ticket_quantity) || 1;
            const unitPrice = Number(data.ticket_price) || Math.round(Number(data.base_amount) / qty);
            return {
                ...data,
                ticket_quantity: qty,
                ticket_price: unitPrice,
            };
        }
    } catch (err) {
        console.warn('[EVENT MODEL] getEventBookingById fallback to orders:', err.message);
    }

    const { data: ord } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${id},razorpay_order_id.eq.${id}`)
        .maybeSingle();

    if (!ord) return null;

    const qty = Number(ord.details?.ticket_quantity) || 1;
    const unitPrice = Number(ord.details?.ticket_price) || Math.round((Number(ord.details?.base_amount) || 2500) / qty);

    return {
        id: ord.id,
        event_id: ord.item_id,
        event_name: ord.item_name,
        user_id: ord.details?.user_id || null,
        customer_name: ord.customer_name,
        customer_email: ord.customer_email,
        customer_phone: ord.customer_phone,
        ticket_quantity: qty,
        ticket_price: unitPrice,
        base_amount: Number(ord.details?.base_amount) || (unitPrice * qty),
        gst_percentage: Number(ord.details?.gst_percentage) || 5,
        gst_amount: Number(ord.details?.gst_amount) || 0,
        total_amount: Number(ord.details?.total_amount) || (unitPrice * qty),
        currency: ord.currency || 'INR',
        razorpay_order_id: ord.razorpay_order_id,
        razorpay_payment_id: ord.razorpay_payment_id,
        payment_status: ord.status === 'paid' ? 'SUCCESS' : 'PENDING',
        booking_status: ord.status === 'paid' ? 'CONFIRMED' : 'PENDING',
        created_at: ord.created_at,
        updated_at: ord.updated_at || ord.created_at,
    };
};

