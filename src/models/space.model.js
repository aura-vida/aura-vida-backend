import { supabase } from '../config/supabase.js';
import { parseSpaceAvailability, formatSpaceScheduleSummary } from '../utils/spaceAvailability.js';
import { sendSpaceReservationEmail } from '../services/email.service.js';
import { deleteObject } from '../services/s3.service.js';

const sanitizeSpaceFields = (fields) => {
    const sanitized = { ...fields };
    if (sanitized.availability && typeof sanitized.availability === 'object') {
        sanitized.availability = JSON.stringify(sanitized.availability);
    }
    return sanitized;
};

/**
 * Create a new partner space submission (public)
 */
export const createSpace = async (fields) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .insert([sanitizeSpaceFields(fields)])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Public: List partner spaces by pin code
 * 1. Checks exact PIN code match
 * 2. If no exact match, checks same region (first 2-3 digits of PIN)
 * 3. Fallback: returns available partner spaces so the user can choose a sanctuary
 */
const PUBLIC_SPACE_COLUMNS = 'id, space_name, address, city, pin, capacity, space_type, amenities, availability, notes, status, space_images(id, image_url, sort_order)';

export const listPublicSpaces = async (pin, city) => {
    if (pin) {
        // 1. Exact match
        const { data: exact, error: exactErr } = await supabase
            .from('partner_spaces')
            .select(PUBLIC_SPACE_COLUMNS)
            .eq('pin', pin)
            .eq('status', 'approved')
            .order('sort_order', { foreignTable: 'space_images', ascending: true });

        if (!exactErr && exact && exact.length > 0) return exact;

        // 2. Regional prefix match (first 3 digits e.g. 384... or 380...)
        const prefix3 = pin.slice(0, 3);
        const { data: regional3 } = await supabase
            .from('partner_spaces')
            .select(PUBLIC_SPACE_COLUMNS)
            .ilike('pin', `${prefix3}%`)
            .eq('status', 'approved')
            .order('sort_order', { foreignTable: 'space_images', ascending: true });

        if (regional3 && regional3.length > 0) return regional3;

        // Regional prefix match (first 2 digits e.g. 38... for Gujarat)
        const prefix2 = pin.slice(0, 2);
        const { data: regional2 } = await supabase
            .from('partner_spaces')
            .select(PUBLIC_SPACE_COLUMNS)
            .ilike('pin', `${prefix2}%`)
            .eq('status', 'approved')
            .order('sort_order', { foreignTable: 'space_images', ascending: true });

        if (regional2 && regional2.length > 0) return regional2;
    }

    if (city && city.trim() !== '' && city.toLowerCase() !== 'all') {
        const { data: citySpaces, error: cityErr } = await supabase
            .from('partner_spaces')
            .select(PUBLIC_SPACE_COLUMNS)
            .ilike('city', `%${city.trim()}%`)
            .eq('status', 'approved')
            .order('sort_order', { foreignTable: 'space_images', ascending: true })
            .limit(100);

        if (!cityErr && citySpaces && citySpaces.length > 0) return citySpaces;
    }

    // 3. Fallback / default: return all approved partner spaces
    const { data: allSpaces, error } = await supabase
        .from('partner_spaces')
        .select(PUBLIC_SPACE_COLUMNS)
        .eq('status', 'approved')
        .order('sort_order', { foreignTable: 'space_images', ascending: true })
        .limit(100);

    if (error) throw error;
    return allSpaces || [];
};

/**
 * Admin: List all partner space submissions with pagination
 */
export const listSpaces = async (filters = {}) => {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('partner_spaces')
        .select('*, space_images(id, image_url, sort_order)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('sort_order', { foreignTable: 'space_images', ascending: true });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.city) query = query.ilike('city', `%${filters.city}%`);
    if (filters.search) {
        query = query.or(`space_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,city.ilike.%${filters.search}%,pin.ilike.%${filters.search}%`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

/**
 * Admin: Create a new partner space directly
 */
export const adminCreateSpace = async (fields) => {
    const sanitized = sanitizeSpaceFields(fields);
    const { data, error } = await supabase
        .from('partner_spaces')
        .insert([{
            ...sanitized,
            status: sanitized.status || 'approved',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Admin: Update all details of a partner space
 */
export const adminUpdateSpace = async (id, fields) => {
    const sanitized = sanitizeSpaceFields(fields);
    const { data, error } = await supabase
        .from('partner_spaces')
        .update({
            ...sanitized,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, space_images(id, image_url, sort_order)')
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space not found'), { statusCode: 404 });
    return data;
};

/**
 * Admin: Update status of a partner space submission
 */
export const updateSpaceStatus = async (id, status) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, space_images(id, image_url, sort_order)')
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space submission not found'), { statusCode: 404 });
    return data;
};

/**
 * Admin: Permanently delete a space submission
 */
export const deleteSpace = async (id) => {
    const { data, error } = await supabase
        .from('partner_spaces')
        .delete()
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Space submission not found'), { statusCode: 404 });
    return data;
};

/**
 * Admin: Pack / Reserve a time slot for a space and optionally notify the space owner
 */
export const packSpaceSlot = async (id, { date, start_time, end_time, reason = '', notify_owner = false }) => {
    // 1. Fetch space
    const { data: space, error: fetchErr } = await supabase
        .from('partner_spaces')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!space) throw Object.assign(new Error('Partner space not found'), { statusCode: 404 });

    // 2. Parse current availability
    const schedule = parseSpaceAvailability(space.availability);
    const packedSlots = Array.isArray(schedule.packed_slots) ? [...schedule.packed_slots] : [];

    // 3. Create new packed slot
    const newSlot = {
        id: `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date,
        start_time: start_time.slice(0, 5),
        end_time: end_time.slice(0, 5),
        reason: reason.trim(),
        notify_owner: !!notify_owner,
        created_at: new Date().toISOString(),
        notified_email: notify_owner && space.email ? space.email : null,
    };

    packedSlots.push(newSlot);
    schedule.packed_slots = packedSlots;

    // 4. Update space
    const { data: updated, error: updateErr } = await supabase
        .from('partner_spaces')
        .update({
            availability: JSON.stringify(schedule),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (updateErr) throw updateErr;

    // 5. Send notification email if requested
    if (notify_owner && space.email) {
        sendSpaceReservationEmail({
            to: space.email,
            spaceName: space.space_name,
            date,
            startTime: newSlot.start_time,
            endTime: newSlot.end_time,
            reason: newSlot.reason,
        }).catch((err) => {
            console.error('Failed to send reservation email to space host:', err.message);
        });
    }

    return { space: updated, packed_slot: newSlot };
};

/**
 * Admin: Release a previously packed/reserved slot
 */
export const releaseSpaceSlot = async (id, slotId) => {
    // 1. Fetch space
    const { data: space, error: fetchErr } = await supabase
        .from('partner_spaces')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!space) throw Object.assign(new Error('Partner space not found'), { statusCode: 404 });

    // 2. Parse current availability and filter out slot
    const schedule = parseSpaceAvailability(space.availability);
    schedule.packed_slots = (schedule.packed_slots || []).filter((s) => s.id !== slotId);

    // 3. Update space
    const { data: updated, error: updateErr } = await supabase
        .from('partner_spaces')
        .update({
            availability: JSON.stringify(schedule),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (updateErr) throw updateErr;
    return updated;
};


// ─── Space Photo Gallery ────────────────────────────────────────────────────

/**
 * Admin: Add one or more images to a space's gallery, appended after any
 * existing images.
 * @param {string} spaceId
 * @param {{url: string, path: string}[]} uploads
 */
export const addSpaceImages = async (spaceId, uploads) => {
    const { data: last } = await supabase
        .from('space_images')
        .select('sort_order')
        .eq('space_id', spaceId)
        .order('sort_order', { ascending: false })
        .limit(1);

    let nextOrder = (last?.[0]?.sort_order ?? -1) + 1;
    const rows = uploads.map((u) => ({
        space_id: spaceId,
        image_url: u.url,
        storage_path: u.path,
        sort_order: nextOrder++,
    }));

    const { data, error } = await supabase
        .from('space_images')
        .insert(rows)
        .select();

    if (error) throw error;
    return data;
};

/**
 * Admin: Permanently delete one gallery image, including its storage object.
 */
export const deleteSpaceImage = async (imageId) => {
    const { data, error } = await supabase
        .from('space_images')
        .delete()
        .eq('id', imageId)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error('Image not found'), { statusCode: 404 });

    // Best-effort — the DB row is already gone either way, so an orphaned
    // storage object isn't worth failing the request over.
    try {
        await deleteObject(data.storage_path);
    } catch (_) {}

    return data;
};

