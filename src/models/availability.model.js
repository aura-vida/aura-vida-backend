import { supabase } from '../config/supabase.js';
import { istDayBoundsUtc, utcIsoToIstTime } from '../utils/timezone.js';

// ─── AV-001: Get practitioner schedule (public) ───────────────────────────────
export const getPractitionerSchedule = async (slug) => {
    const { data, error } = await supabase
        .from('availability')
        .select('*')
        .eq('practitioner_slug', slug)
        .eq('is_active', true)
        .order('day_of_week', { ascending: true });

    if (error) throw error;
    return data;
};

// ─── AV-002 / AV-003: Upsert recurring schedule ───────────────────────────────
// scheduleUpdates: array of { day_of_week: X, slots: [...] }
export const upsertSchedule = async (slug, scheduleUpdates) => {
    if (!scheduleUpdates || scheduleUpdates.length === 0) return [];

    const affectedDays = scheduleUpdates.map(u => u.day_of_week);

    // 1. Delete ONLY the slots for the days we are explicitly updating
    const { error: delError } = await supabase
        .from('availability')
        .delete()
        .eq('practitioner_slug', slug)
        .in('day_of_week', affectedDays);

    if (delError) throw delError;

    // 2. Gather all the new slots to insert (flatten the structure)
    const rows = [];
    for (const update of scheduleUpdates) {
        if (update.slots && update.slots.length > 0) {
            for (const s of update.slots) {
                rows.push({
                    practitioner_slug: slug,
                    day_of_week: update.day_of_week,
                    start_time: s.start_time,
                    end_time: s.end_time,
                    duration_min: s.duration_min ?? 60,
                    is_active: true,
                });
            }
        }
    }

    if (rows.length === 0) return [];

    // 3. Insert the new slots
    const { data, error } = await supabase
        .from('availability')
        .insert(rows)
        .select();

    if (error) throw error;
    return data;
};

// ─── AV-004: Block / remove a specific slot ───────────────────────────────────
export const addException = async (slug, exceptionDate, startTime, endTime, reason) => {
    const { data, error } = await supabase
        .from('availability_exceptions')
        .insert([{
            practitioner_slug: slug,
            exception_date: exceptionDate,
            start_time: startTime,
            end_time: endTime,
            reason: reason || null,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const removeException = async (exceptionId) => {
    const { data, error } = await supabase
        .from('availability_exceptions')
        .delete()
        .eq('id', exceptionId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

// ─── AV-007 / AV-009: Get time off exceptions ─────────────────────────────────
// export const getExceptions = async (slug) => {
//     const { data, error } = await supabase
//         .from('availability_exceptions')
//         .select('*')
//         .eq('practitioner_slug', slug)
//         .order('exception_date', { ascending: false });

//     if (error) throw error;
//     return data;
// };

export const getPractitionerSlugById = async (id) => {
    const { data, error } = await supabase
        .from('practitioners')
        .select('slug')
        .eq('id', id)
        .single();
    if (error || !data) throw Object.assign(new Error('Practitioner not found'), { statusCode: 404 });
    return data.slug;
};

// ─── AV-007: List all exceptions for a practitioner ──────────────────────────
export const getExceptions = async (slug) => {
    const { data, error } = await supabase
        .from('availability_exceptions')
        .select('*')
        .eq('practitioner_slug', slug)
        .order('exception_date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
};

// ─── AV-005: Calculate available bookable time slots for a given date ──────────
export const calculateAvailableSlots = async (slug, dateStr) => {
    const date = new Date(dateStr);
    const dayOfWeek = date.getUTCDay(); // 0=Sun ... 6=Sat

    // 1. Get the recurring schedule for this day
    const { data: schedules, error: schedErr } = await supabase
        .from('availability')
        .select('*')
        .eq('practitioner_slug', slug)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true);

    if (schedErr) throw schedErr;
    const effectiveSchedules = schedules || [];

    // 2. Get all exceptions for that day
    const { data: exceptions } = await supabase
        .from('availability_exceptions')
        .select('*')
        .eq('practitioner_slug', slug)
        .eq('exception_date', dateStr);

    // 3. Get all existing confirmed bookings for that IST calendar day
    // (dateStr/start_time/end_time are all IST wall-clock, so the day
    // boundaries must be IST-day bounds converted to UTC, not UTC-day bounds).
    const { start: dayStart, end: dayEnd } = istDayBoundsUtc(dateStr);
    const { data: bookings } = await supabase
        .from('bookings')
        .select('scheduled_at, item_id')
        .eq('practitioner_slug', slug)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', dayStart)
        .lte('scheduled_at', dayEnd);

    // 4. Generate all possible slots, then subtract exceptions and booked slots
    const bookedTimes = new Set((bookings || []).map(b => utcIsoToIstTime(b.scheduled_at)));

    const blockedRanges = (exceptions || []).map(e => ({
        start: e.start_time.slice(0, 5),
        end: e.end_time.slice(0, 5),
    }));

    const toMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const slots = [];

    for (const schedule of effectiveSchedules) {
        const schedStart = toMinutes(schedule.start_time.slice(0, 5));
        const schedEnd = toMinutes(schedule.end_time.slice(0, 5));
        const duration = schedule.duration_min;

        let current = schedStart;
        while (current + duration <= schedEnd) {
            const slotStart = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
            const slotEndMin = current + duration;
            const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`;

            // Check if this slot is blocked by exceptions
            const isBlocked = blockedRanges.some(b =>
                toMinutes(slotStart) < toMinutes(b.end) &&
                slotEndMin > toMinutes(b.start)
            );

            // Check if booked
            const isBooked = bookedTimes.has(slotStart);

            if (!isBlocked && !isBooked) {
                slots.push({
                    start: slotStart,
                    end: slotEnd,
                    duration_min: duration,
                    available: true,
                });
            }

            current += duration;
        }
    }

    return slots;
};
