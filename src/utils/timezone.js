// This platform only operates in India, so every date/time a user picks in
// the UI (booking slots, reschedules, the practitioner's weekly schedule) is
// always an India Standard Time (UTC+5:30, no DST) wall-clock value — never UTC.

export const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts a `date` ("YYYY-MM-DD") + `time` ("HH:mm") IST wall-clock pair,
 * as picked in the UI, into the correct UTC ISO string for storage.
 */
export const istToUtcIso = (date, time) =>
    new Date(`${date}T${time}:00.000${IST_OFFSET}`).toISOString();

/**
 * Converts a UTC `scheduled_at` ISO string back into its IST wall-clock
 * "HH:mm" time, for comparing against IST-based inputs (e.g. the practitioner's
 * weekly schedule's start_time/end_time, which are also IST wall-clock values).
 */
export const utcIsoToIstTime = (isoString) => {
    const shifted = new Date(new Date(isoString).getTime() + IST_OFFSET_MS);
    return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * UTC ISO bounds [start, end] covering an entire IST calendar day for
 * `dateStr` ("YYYY-MM-DD") — use instead of naive UTC-day boundaries when
 * filtering rows by an IST calendar date.
 */
export const istDayBoundsUtc = (dateStr) => ({
    start: new Date(`${dateStr}T00:00:00.000${IST_OFFSET}`).toISOString(),
    end: new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`).toISOString(),
});
