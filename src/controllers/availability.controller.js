import {
    getPractitionerSchedule,
    upsertSchedule,
    addException,
    removeException,
    calculateAvailableSlots,
    getExceptions,
    getPractitionerSlugById,
} from '../models/availability.model.js';
import { supabase } from '../config/supabase.js';

// Helper: get practitioner slug for the logged-in practitioner
const getPractitionerSlug = async (userId) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('practitioner_slug')
        .eq('id', userId)
        .single();
    if (error || !data?.practitioner_slug) {
        throw Object.assign(
            new Error('No practitioner profile linked. Ask an Admin to set your practitioner_slug.'),
            { statusCode: 404 }
        );
    }
    return data.practitioner_slug;
};

// ─── AV-001 ───────────────────────────────────────────────────────────────────
export const getSchedule = async (req, res) => {
    try {
        const schedule = await getPractitionerSchedule(req.params.slug);
        res.status(200).json({ schedule });
    } catch (err) {
        console.error('getSchedule error:', err);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
};

// ─── AV-002 (practitioner updates own) ───────────────────────────────────────
export const updateOwnSchedule = async (req, res) => {
    try {
        const slug = await getPractitionerSlug(req.user.id);
        const schedule = await upsertSchedule(slug, req.body.schedule_updates);
        res.status(200).json({ message: 'Schedule updated successfully', schedule });
    } catch (err) {
        console.error('updateOwnSchedule error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to update schedule' });
    }
};

// ─── AV-003 (admin updates any practitioner) ─────────────────────────────────
export const adminUpdateSchedule = async (req, res) => {
    try {
        const schedule = await upsertSchedule(req.params.slug, req.body.schedule_updates);
        res.status(200).json({ message: 'Schedule updated successfully', schedule });
    } catch (err) {
        console.error('adminUpdateSchedule error:', err);
        res.status(500).json({ error: 'Failed to update schedule' });
    }
};

// ─── AV-004a: Block a specific date+time slot ─────────────────────────────────
export const blockSlot = async (req, res) => {
    try {
        const { exception_date, start_time, end_time, reason } = req.body;
        if (!exception_date || !start_time || !end_time)
            return res.status(400).json({ error: 'exception_date, start_time and end_time are required.' });

        const slugId = req.params.slug; // From URL: /practitioners/:slug/availability/exceptions

        // Optional security verification: ensure practitioner only creates exception for their OWN id
        if (req.user.role === 'practitioner') {
            const ownSlug = await getPractitionerSlug(req.user.id);
            if (ownSlug !== slugId) {
                return res.status(403).json({ error: 'Cannot modify exceptions for another practitioner.' });
            }
        }

        const exception = await addException(slugId, exception_date, start_time, end_time, reason);
        res.status(201).json({ message: 'Exception created successfully', exception });
    } catch (err) {
        console.error('blockSlot error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to block slot' });
    }
};

// ─── AV-004b: Unblock / remove an exception ──────────────────────────────────
export const unblockSlot = async (req, res) => {
    try {
        await removeException(req.params.exceptionId);
        res.status(200).json({ message: 'Slot unblocked successfully' });
    } catch (err) {
        console.error('unblockSlot error:', err);
        res.status(500).json({ error: 'Failed to unblock slot' });
    }
};

// ─── AV-007: List Own Time Off ───────────────────────────────────────────────
export const getOwnTimeOff = async (req, res) => {
    try {
        const slug = await getPractitionerSlug(req.user.id);
        const exceptions = await getExceptions(slug);
        res.status(200).json({ timeOff: exceptions });
    } catch (err) {
        console.error('getOwnTimeOff error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to get time off' });
    }
};

// ─── AV-008: Create Own Time Off ─────────────────────────────────────────────
export const createOwnTimeOff = async (req, res) => {
    try {
        const slug = await getPractitionerSlug(req.user.id);
        const { date, start_time, end_time, reason } = req.body;
        if (!date || !start_time || !end_time) {
            return res.status(400).json({ error: 'date, start_time, and end_time are required.' });
        }
        const exception = await addException(slug, date, start_time, end_time, reason);
        res.status(201).json({ message: 'Time off created', timeOff: exception });
    } catch (err) {
        console.error('createOwnTimeOff error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create time off' });
    }
};

// ─── AV-009: Admin List Time Off ─────────────────────────────────────────────
export const adminGetTimeOff = async (req, res) => {
    try {
        const slug = await getPractitionerSlugById(req.params.id);
        const exceptions = await getExceptions(slug);
        res.status(200).json({ timeOff: exceptions });
    } catch (err) {
        console.error('adminGetTimeOff error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to get time off' });
    }
};

// ─── AV-010: Admin Create Time Off ───────────────────────────────────────────
export const adminCreateTimeOff = async (req, res) => {
    try {
        const slug = await getPractitionerSlugById(req.params.id);
        const { date, start_time, end_time, reason } = req.body;
        if (!date || !start_time || !end_time) {
            return res.status(400).json({ error: 'date, start_time, and end_time are required.' });
        }
        const exception = await addException(slug, date, start_time, end_time, reason);
        res.status(201).json({ message: 'Time off created', timeOff: exception });
    } catch (err) {
        console.error('adminCreateTimeOff error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to create time off' });
    }
};

// ─── AV-006: Calculate bookable slots ──────────────────────────────────────────
export const getAvailableSlots = async (req, res) => {
    try {
        const { date, slug, spaceId } = req.query; // AV-006 uses query params for slug & optional spaceId
        if (!date || !slug)
            return res.status(400).json({ error: 'Query params ?date=YYYY-MM-DD and ?slug=... are required.' });

        const slots = await calculateAvailableSlots(slug, date, spaceId || null);
        res.status(200).json({ date, slots });
    } catch (err) {
        console.error('getAvailableSlots error:', err);
        res.status(500).json({ error: 'Failed to calculate available slots' });
    }
};
