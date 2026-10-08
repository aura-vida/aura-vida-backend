import { supabase } from '../config/supabase.js';
import { getPractitionerBySlug } from '../models/practitioner.model.js';
import { getServiceById } from '../models/service.model.js';
import { createNotification, notifyAdmins } from '../models/notification.model.js';

// ─── Helper: fetch profile full_name for client_name denorm ──────────────────
const getProfileName = async (userId) => {
    const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
    return data?.full_name || null;
};

// ─── APT-001: Create Booking ─────────────────────────────────────────────────
export const createAppointment = async (req, res) => {
    try {
        const { service_id, practitioner_slug, date, time, meeting_location, group_size = 1, attendees = [] } = req.body;

        if (!service_id || !practitioner_slug || !date || !time) {
            return res.status(400).json({ error: 'service_id, practitioner_slug, date, and time are required.' });
        }

        const scheduled_at = new Date(`${date}T${time}:00.000Z`).toISOString();

        // Fetch denormalized fields the DB requires
        const [practitioner, service, clientName] = await Promise.all([
            getPractitionerBySlug(practitioner_slug),
            getServiceById(service_id),
            getProfileName(req.user.id),
        ]);

        const { data: booking, error } = await supabase
            .from('bookings')
            .insert([{
                client_id: req.user.id,
                client_name: clientName,
                practitioner_slug,
                practitioner_name: practitioner.name,
                item_id: service_id,
                // Apply same group pricing as frontend: base + 60% extra per additional person
                amount: (() => {
                    const baseInr = service.price_inr || 0;
                    const extraRate = 0.6;
                    const size = Math.max(1, group_size || 1);
                    const totalInr = baseInr + Math.round(baseInr * extraRate) * Math.max(0, size - 1);
                    return Math.round(totalInr * 100); // convert to paise
                })(),
                currency: 'INR',
                mode: req.body.mode || 'offline',
                scheduled_at,
                status: 'pending',
                group_size: group_size || 1,
                attendees: attendees || [],
                meeting_location: meeting_location || null,
            }])
            .select()
            .single();

        if (error) throw error;

        try {
            const formattedDate = new Date(scheduled_at).toLocaleString();

            // Notify client
            await createNotification(
                req.user.id,
                'Booking Created',
                `Your appointment with ${practitioner_slug} has been successfully requested for ${formattedDate}.`,
                'booking',
                booking.id
            );

            // Notify practitioner
            const { data: prac } = await supabase
                .from('profiles')
                .select('id')
                .eq('practitioner_slug', practitioner_slug)
                .maybeSingle();

            if (prac?.id) {
                await createNotification(
                    prac.id,
                    'New Appointment Request',
                    `A new appointment has been scheduled with you on ${formattedDate}.`,
                    'booking',
                    booking.id
                );
            }

            // Notify admins
            await notifyAdmins(
                'New Platform Booking',
                `New appointment requested with ${practitioner_slug} on ${formattedDate}.`,
                'booking',
                booking.id
            );
        } catch (notifErr) {
            console.error('Failed to trigger notifications during booking:', notifErr);
            // Non-blocking: We don't fail the booking if notification fails
        }

        res.status(201).json({ message: 'Appointment booked successfully', booking });
    } catch (err) {
        console.error('createAppointment error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create appointment' });
    }
};

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
export const updatePractitionerAppointmentStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

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
            .select('id, practitioner_slug')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !booking) return res.status(404).json({ error: 'Appointment not found' });
        if (booking.practitioner_slug !== slug && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
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
export const getAppointmentById = async (req, res) => {
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

        if (fetchErr || !booking) return res.status(404).json({ error: 'Appointment not found.' });

        // Only the owner or admin can cancel
        if (booking.client_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        if (['cancelled', 'completed'].includes(booking.status)) {
            return res.status(400).json({ error: `Cannot cancel a booking that is already '${booking.status}'.` });
        }

        const { data, error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // Trigger cancellation notifications (non-blocking)
        try {
            await createNotification(
                booking.client_id,
                'Session Cancelled',
                `Your appointment with ${booking.practitioner_slug} has been cancelled.`,
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
                    'Session Cancelled',
                    `Appointment #${booking.id.slice(0, 8)} was cancelled.`,
                    'booking',
                    booking.id
                );
            }
            await notifyAdmins(
                'Session Cancelled',
                `Booking with ${booking.practitioner_slug} was cancelled.`,
                'booking',
                booking.id
            );
        } catch (_) {}

        res.status(200).json({ message: 'Appointment cancelled.', appointment: data });
    } catch (err) {
        console.error('cancelAppointment error:', err);
        res.status(500).json({ error: 'Failed to cancel appointment' });
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

        const scheduled_at = new Date(`${date}T${time}:00.000Z`).toISOString();

        const { data, error } = await supabase
            .from('bookings')
            .update({ scheduled_at, status: 'pending' }) // resets back to pending for re-confirmation
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // Trigger rescheduling notifications (non-blocking)
        try {
            const formattedDate = new Date(scheduled_at).toLocaleString();
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
        } catch (_) {}

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
