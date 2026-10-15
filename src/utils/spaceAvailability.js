/**
 * Utilities for parsing, serializing, and matching partner space availability schedules.
 */

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const str = String(timeStr).trim();
    const isPm = /pm/i.test(str);
    const isAm = /am/i.test(str);
    const cleaned = str.replace(/[^0-9:]/g, '');
    const [hRaw, mRaw] = cleaned.split(':').map(Number);
    let hour = hRaw || 0;
    const min = mRaw || 0;
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    return hour * 60 + min;
};

export const formatTime12h = (timeStr) => {
    if (!timeStr) return '';
    const [hRaw, mRaw] = timeStr.slice(0, 5).split(':').map(Number);
    const hour = hRaw || 0;
    const min = String(mRaw || 0).padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${String(hour12).padStart(2, '0')}:${min} ${ampm}`;
};

export const formatDaysLabel = (days = []) => {
    if (!Array.isArray(days) || days.length === 0) return 'Closed';
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    if (sorted.length === 7) return 'Everyday';
    if (sorted.length === 6 && !sorted.includes(0)) return 'Mon – Sat';
    if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return 'Mon – Fri';
    if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return 'Weekends only';
    return sorted.map(d => DAY_NAMES[d] || String(d)).join(', ');
};

export const formatSpaceScheduleSummary = (sched = {}) => {
    const daysLabel = formatDaysLabel(sched.days);
    const open = formatTime12h(sched.open_time || '09:00');
    const close = formatTime12h(sched.close_time || '19:00');
    let summary = `${daysLabel} · ${open} – ${close}`;

    if (sched.available_from && sched.available_to) {
        summary += ` (${sched.available_from} to ${sched.available_to})`;
    } else if (sched.available_from) {
        summary += ` (From ${sched.available_from})`;
    } else if (sched.available_to) {
        summary += ` (Until ${sched.available_to})`;
    }

    return summary;
};

/**
 * Parses raw availability (can be structured JSON string, an object, null, or legacy plain text).
 */
export const parseSpaceAvailability = (raw) => {
    const defaultSchedule = {
        days: [1, 2, 3, 4, 5, 6], // Mon-Sat
        open_time: '09:00',
        close_time: '19:00',
        available_from: null,
        available_to: null,
        packed_slots: [],
    };
    defaultSchedule.summary = formatSpaceScheduleSummary(defaultSchedule);

    if (!raw) return defaultSchedule;

    if (typeof raw === 'object' && raw !== null) {
        const merged = {
            ...defaultSchedule,
            ...raw,
            days: Array.isArray(raw.days) && raw.days.length > 0 ? raw.days : defaultSchedule.days,
            open_time: raw.open_time || defaultSchedule.open_time,
            close_time: raw.close_time || defaultSchedule.close_time,
            packed_slots: Array.isArray(raw.packed_slots) ? raw.packed_slots : [],
        };
        merged.summary = raw.summary || formatSpaceScheduleSummary(merged);
        return merged;
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                return parseSpaceAvailability(parsed);
            } catch {
                // fall through to legacy text
            }
        }

        // Legacy text representation (e.g. "Weekdays 6am-8pm, Weekends 7am-6pm")
        return {
            ...defaultSchedule,
            summary: trimmed,
            legacy_text: trimmed,
        };
    }

    return defaultSchedule;
};

/**
 * Checks whether the space is active and open on a given calendar date (YYYY-MM-DD).
 */
export const isSpaceOpenOnDate = (dateStr, schedule) => {
    if (!dateStr || !schedule) return false;

    // Date range bounds
    if (schedule.available_from && dateStr < schedule.available_from) return false;
    if (schedule.available_to && dateStr > schedule.available_to) return false;

    // Day of week check (IST wall clock)
    // Date string YYYY-MM-DD parsed in UTC/local day
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay();

    const openDays = Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5, 6];
    return openDays.includes(dayOfWeek);
};
