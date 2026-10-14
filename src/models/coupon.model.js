import { supabase } from '../config/supabase.js';

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export const listCoupons = async () => {
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

export const createCoupon = async (fields) => {
    const { data, error } = await supabase
        .from('coupons')
        .insert([fields])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateCouponById = async (id, fields) => {
    const { data, error } = await supabase
        .from('coupons')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();
    if (error) throw error;
    if (!data) {
        const err = new Error('Coupon not found.');
        err.statusCode = 404;
        throw err;
    }
    return data;
};

export const deleteCouponById = async (id) => {
    const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', id);
    if (error) throw error;
};

// ─── Redemption ────────────────────────────────────────────────────────────────

const getCouponByCode = async (code) => {
    if (!code) return null;
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', String(code).trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();
    if (error) throw error;
    return data;
};

const userHasConfirmedBooking = async (userId) => {
    const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', userId)
        .eq('status', 'confirmed');
    if (error) throw error;
    return (count || 0) > 0;
};

/**
 * Validates a coupon code for this user against its configured eligibility
 * rules — the code must exist and be active, and:
 *   - if `first_booking_only` (defaults on — LAUNCH10/LAUNCH20 always have
 *     this set), the user must have no confirmed booking yet. Once a user's
 *     first booking is confirmed, this always rejects, which is also what
 *     enforces "once per user": there's no second first booking.
 *   - if `min_booking_amount_inr` is set, `subtotalInr` (the session price
 *     before tax/coupon, i.e. what the coupon actually applies against) must
 *     meet it.
 * Throws with `statusCode` on any failure; never trust a client-side check.
 */
export const resolveCoupon = async (code, userId, subtotalInr = 0) => {
    const coupon = await getCouponByCode(code);
    if (!coupon) {
        throw Object.assign(new Error('Invalid coupon code.'), { statusCode: 400 });
    }

    if (coupon.first_booking_only) {
        const hasBooked = await userHasConfirmedBooking(userId);
        if (hasBooked) {
            throw Object.assign(
                new Error(`${coupon.code} is only valid on your first booking.`),
                { statusCode: 400 }
            );
        }
    }

    if (coupon.min_booking_amount_inr != null && Number(subtotalInr) < Number(coupon.min_booking_amount_inr)) {
        throw Object.assign(
            new Error(`${coupon.code} requires a minimum booking amount of ₹${Number(coupon.min_booking_amount_inr).toLocaleString('en-IN')}.`),
            { statusCode: 400 }
        );
    }

    return coupon;
};
