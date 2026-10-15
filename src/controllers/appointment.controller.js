import { supabase } from '../config/supabase.js';
import { getPractitionerBySlug } from '../models/practitioner.model.js';
import { createNotification, notifyAdmins } from '../models/notification.model.js';
import { istToUtcIso } from '../utils/timezone.js';

// A customer may only self-cancel within this many hours of when the booking
// was actually created (i.e. when payment was confirmed) — not the session's
// scheduled time. Practitioners/admins are exempt (see cancelAppointment).
// Keep in sync with CUSTOMER_CANCEL_WINDOW_HOURS in kusala-connect/src/pages/Account.tsx.
const CUSTOMER_CANCEL_WINDOW_HOURS = 4;
const CUSTOMER_CANCEL_WINDOW_MS = CUSTOMER_CANCEL_WINDOW_HOURS * 60 * 60 * 1000;

// ─── APT-002: List My Appointments (Customer) ────────────────────────────────
export const listMyAppointments = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const from = (page - 1) * limit;
        const to = from + parseInt(limit) - 1;

        let query = supabase
            .from('bookings')
            .select('*', { count: 'exact' })
            .eq('client_id', req.user.id)
            .order('scheduled_at', { ascending: false })
            .range(from, to);

        if (status) query = query.eq('status', status);

        const { data, error, count } = await query;
        if (error) throw error;

        res.status(200).json({
            appointments: data,
            pagination: { page: parseInt(page), limit: parseInt(limit), total: count, totalPages: Math.ceil(count / limit) }
        });
    } catch (err) {
        console.error('listMyAppointments error:', err);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
};

// ─── APT-008: List Practitioner Appointments ─────────────────────────────────
export const listPractitionerAppointments = async (req, res) => {
    try {
        const { data: prof, error: slugErr } = await supabase
            .from('profiles')
            .select('practitioner_slug')
            .eq('id', req.user.id)
            .single();
        if (slugErr || !prof?.practitioner_slug) {
            return res.status(404).json({ error: 'No practitioner linked to this user' });
        }

        const slug = prof.practitioner_slug;
        const { status, page = 1, limit = 10 } = req.query;
        const from = (page - 1) * limit;
        const to = from + parseInt(limit) - 1;

        let query = supabase
            .from('bookings')
            .select('*', { count: 'exact' })
            .eq('practitioner_slug', slug)
            .order('scheduled_at', { ascending: false })
            .range(from, to);

        if (status) query = query.eq('status', status);

        const { data: appts, error, count } = await query;
        if (error) throw error;

        res.status(200).json({
            appointments: appts,
            pagination: { page: parseInt(page), limit: parseInt(limit), total: count, totalPages: Math.ceil(count / limit) }
        });
    } catch (err) {
        console.error('listPractitionerAppointments error:', err);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
};

// ─── APT-009: Update Practitioner Appointment Status ─────────────────────────
// Only two transitions are valid here — cancellation has its own dedicated
// endpoint (cancelAppointment) with its own refund logic.
const PRACTITIONER_STATUS_TRANSITIONS = {
    confirmed: 'pending',   // can only confirm a pending appointment
    completed: 'confirmed', // can only complete a confirmed appointment
};

export const updatePractitionerAppointmentStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = Object.keys(PRACTITIONER_STATUS_TRANSITIONS);
        if (!status || !allowed.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
        }

        const { data: prof, error: slugErr } = await supabase
            .from('profiles')
            .select('practitioner_slug')
            .eq('id', req.user.id)
            .single();
        if (slugErr || !prof?.practitioner_slug) {
            return res.status(404).json({ error: 'No practitioner linked to this user' });
        }

        const slug = prof.practitioner_slug;

        const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('id, practitioner_slug, status')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !booking) return res.status(404).json({ error: 'Appointment not found' });
        if (booking.practitioner_slug !== slug && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const requiredCurrentStatus = PRACTITIONER_STATUS_TRANSITIONS[status];
        if (booking.status !== requiredCurrentStatus) {
            return res.status(400).json({
                error: `Cannot mark as '${status}' — appointment is '${booking.status}', not '${requiredCurrentStatus}'.`,
            });
        }

        const { data, error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.status(200).json({ message: 'Appointment status updated', appointment: data });
    } catch (err) {
        console.error('updatePractitionerAppointmentStatus error:', err);
        res.status(500).json({ error: 'Failed to update appointment status' });
    }
};

// ─── APT-003: Get Appointment Detail ─────────────────────────────────────────
export const getAppointmentById = async (req, res, next) => {
    if (req.params.id === 'available-slots') {
        return next ? next() : res.status(404).json({ error: 'Not found' });
    }
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }

        // Security: only the client, their practitioner, or admin can view
        const isOwner = data.client_id === req.user.id;
        const isPractitioner = data.practitioner_slug === req.user.practitioner_slug;
        if (!isOwner && !isPractitioner && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        res.status(200).json({ appointment: data });
    } catch (err) {
        console.error('getAppointmentById error:', err);
        res.status(500).json({ error: 'Failed to fetch appointment' });
    }
};

// ─── APT-004: Cancel Appointment (Customer/Admin) ────────────────────────────
export const cancelAppointment = async (req, res) => {
    try {
        // Fetch the booking first
        const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !booking) {
            return res.status(404).json({
                error: 'Appointment not found.',
            });
        }

        // ---------------------------------------------------------
        // Authorization
        // Client owner OR assigned practitioner OR admin can cancel
        // ---------------------------------------------------------
        let isAuthorized = booking.client_id === req.user.id;

        // Only a plain customer cancelling their own booking is subject to
        // the 4-hour window below — practitioners and admins can always
        // cancel, regardless of how long ago the booking was made.
        const isCustomerSelfCancel = isAuthorized && req.user.role === 'client';

        // Admin can cancel any appointment
        if (req.user.role === 'admin') {
            isAuthorized = true;
        }

        // Practitioner can cancel their own assigned appointment
        if (req.user.role === 'practitioner') {
            const { data: practitioner, error: practitionerErr } = await supabase
                .from('profiles')
                .select('id, practitioner_slug')
                .eq('id', req.user.id)
                .maybeSingle();

            if (practitionerErr) {
                console.error(
                    '[CANCEL] Failed to fetch practitioner profile:',
                    practitionerErr
                );

                return res.status(500).json({
                    error: 'Failed to verify practitioner authorization.',
                });
            }

            if (
                practitioner?.practitioner_slug &&
                practitioner.practitioner_slug === booking.practitioner_slug
            ) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({
                error: 'Forbidden.',
            });
        }

        // Cannot cancel already cancelled/completed appointments
        if (['cancelled', 'completed'].includes(booking.status)) {
            return res.status(400).json({
                error: `Cannot cancel a booking that is already '${booking.status}'.`,
            });
        }

        // ---------------------------------------------------------
        // 4-hour self-cancellation window (customers only)
        // Measured from when the booking was actually created (i.e. payment
        // confirmed) — not the scheduled session time — using plain UTC
        // epoch math, so it's unaffected by timezone.
        // ---------------------------------------------------------
        if (isCustomerSelfCancel) {
            const createdAtMs = new Date(booking.created_at).getTime();
            const elapsedMs = Date.now() - createdAtMs;
            if (elapsedMs > CUSTOMER_CANCEL_WINDOW_MS) {
                return res.status(400).json({
                    error: `This appointment can no longer be cancelled — the ${CUSTOMER_CANCEL_WINDOW_HOURS}-hour cancellation window after booking has expired. Please contact support for assistance.`,
                    cancelWindowExpired: true,
                });
            }
        }

        // ---------------------------------------------------------
        // Cancel booking
        // The `.in('status', ...)` guard makes this atomic: if two requests
        // race (duplicate clicks, or a concurrent practitioner/admin
        // cancellation), only the first to commit actually flips the status —
        // the second finds zero matching rows instead of double-cancelling.
        // ---------------------------------------------------------
        const { data, error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', req.params.id)
            .in('status', ['pending', 'confirmed'])
            .select()
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            const { data: current } = await supabase
                .from('bookings')
                .select('status')
                .eq('id', req.params.id)
                .maybeSingle();
            return res.status(400).json({
                error: current
                    ? `Cannot cancel a booking that is already '${current.status}'.`
                    : 'Appointment not found.',
            });
        }

        // ---------------------------------------------------------
        // Auto-refund
        // ---------------------------------------------------------
        let refundResult = null;

        try {
            const { data: paidOrder } = await supabase
                .from('orders')
                .select(
                    'id, razorpay_order_id, razorpay_payment_id, amount, status'
                )
                .eq('booking_id', booking.id)
                .eq('status', 'paid')
                .maybeSingle();

            if (paidOrder?.razorpay_payment_id) {
                const { createRefund } = await import(
                    '../models/payment.model.js'
                );

                refundResult = await createRefund(
                    booking.id,
                    'requested_by_customer'
                );

                console.log(
                    `✅ [CANCEL] Refund initiated for booking ${booking.id}`
                );
            }
        } catch (refundErr) {
            console.error(
                `❌ [CANCEL] Refund failed for booking ${booking.id}:`,
                refundErr.message
            );

            // Cancellation still succeeds if refund fails
            refundResult = {
                error: refundErr.message,
            };
        }

        // ---------------------------------------------------------
        // Notifications
        // ---------------------------------------------------------
        try {
            await createNotification(
                booking.client_id,
                'Session Cancelled',
                `Your appointment with ${booking.practitioner_slug} has been cancelled.${
                    refundResult && !refundResult.error
                        ? ' A refund has been initiated to your original payment method.'
                        : ''
                }`,
                'booking',
                booking.id
            );

            // Notify practitioner
            const { data: prac } = await supabase
                .from('profiles')
                .select('id')
                .eq('practitioner_slug', booking.practitioner_slug)
                .maybeSingle();

            if (prac?.id) {
                await createNotification(
                    prac.id,
                    'Session Cancelled',
                    `Appointment #${booking.id.slice(0, 8)} was cancelled.`,
                    'booking',
                    booking.id
                );
            }

            // Notify admins
            await notifyAdmins(
                'Session Cancelled',
                `Booking with ${booking.practitioner_slug} was cancelled.${
                    refundResult && !refundResult.error
                        ? ' Refund has been initiated.'
                        : ''
                }`,
                'booking',
                booking.id
            );
        } catch (_) {
            // Notifications are non-blocking
        }

        // ---------------------------------------------------------
        // Response
        // ---------------------------------------------------------
        res.status(200).json({
            message:
                refundResult && !refundResult.error
                    ? 'Appointment cancelled and refund initiated.'
                    : 'Appointment cancelled.',
            appointment: data,
            refund: refundResult,
        });
    } catch (err) {
        console.error('cancelAppointment error:', err);

        res.status(500).json({
            error: 'Failed to cancel appointment',
        });
    }
};

// ─── APT-005: Reschedule Appointment (Customer) ──────────────────────────────
export const rescheduleAppointment = async (req, res) => {
    try {
        const { date, time } = req.body;
        if (!date || !time) {
            return res.status(400).json({ error: 'date and time are required.' });
        }

        const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !booking) return res.status(404).json({ error: 'Appointment not found.' });

        if (booking.client_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        if (['cancelled', 'completed'].includes(booking.status)) {
            return res.status(400).json({ error: `Cannot reschedule a '${booking.status}' booking.` });
        }

        // `date`/`time` are always IST wall-clock (this platform is India-only) —
        // convert to the correct UTC instant rather than treating them as UTC.
        const scheduled_at = istToUtcIso(date, time);

        // Only the date/time changes — payment status is unaffected by a
        // reschedule, so `status` (e.g. 'confirmed') is left exactly as-is.
        const { data, error } = await supabase
            .from('bookings')
            .update({ scheduled_at })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // Trigger rescheduling notifications (non-blocking)
        try {
            const formattedDate = new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            await createNotification(
                booking.client_id,
                'Session Rescheduled',
                `Your appointment has been moved to ${formattedDate}.`,
                'booking',
                booking.id
            );
            const { data: prac } = await supabase
                .from('profiles')
                .select('id')
                .eq('practitioner_slug', booking.practitioner_slug)
                .maybeSingle();
            if (prac?.id) {
                await createNotification(
                    prac.id,
                    'Session Rescheduled by Client',
                    `Appointment #${booking.id.slice(0, 8)} was rescheduled to ${formattedDate}.`,
                    'booking',
                    booking.id
                );
            }
        } catch (_) { }

        res.status(200).json({ message: 'Appointment rescheduled.', appointment: data });
    } catch (err) {
        console.error('rescheduleAppointment error:', err);
        res.status(500).json({ error: 'Failed to reschedule appointment' });
    }
};

// ─── APT-006: Admin – Assign Practitioner ────────────────────────────────────
export const assignPractitioner = async (req, res) => {
    try {
        const { practitioner_slug } = req.body;
        if (!practitioner_slug) {
            return res.status(400).json({ error: 'practitioner_slug is required.' });
        }

        const practitioner = await getPractitionerBySlug(practitioner_slug);

        const { data, error } = await supabase
            .from('bookings')
            .update({ practitioner_slug, practitioner_name: practitioner.name })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Appointment not found.' });

        res.status(200).json({ message: 'Practitioner assigned.', appointment: data });
    } catch (err) {
        console.error('assignPractitioner error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to assign practitioner' });
    }
};

// ─── APT-007: Admin – Confirm Booking ────────────────────────────────────────
export const confirmAppointment = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Appointment not found.' });

        res.status(200).json({ message: 'Appointment confirmed.', appointment: data });
    } catch (err) {
        console.error('confirmAppointment error:', err);
        res.status(500).json({ error: 'Failed to confirm appointment' });
    }
};
