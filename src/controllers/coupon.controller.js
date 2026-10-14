import {
    resolveCoupon,
    listCoupons,
    createCoupon,
    updateCouponById,
    deleteCouponById,
} from '../models/coupon.model.js';

// ─── COUPON-001: Validate a coupon code for the current user ────────────────
// Used by the booking page to show the discount before checkout. createOrder
// independently re-validates the same way — this endpoint is for preview
// only and is never trusted as the source of truth for pricing.
export const validateCoupon = async (req, res) => {
    try {
        const { code, amount } = req.body;
        if (!code) return res.status(400).json({ error: 'code is required.' });

        // `amount` (session subtotal in INR, before tax) lets a minimum-booking-amount
        // rule be checked at preview time too, not just silently at actual checkout.
        const coupon = await resolveCoupon(code, req.user.id, Number(amount) || 0);
        res.status(200).json({ valid: true, code: coupon.code, discountPercent: Number(coupon.discount_percent) });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Invalid coupon code.' });
    }
};

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export const adminListCoupons = async (req, res) => {
    try {
        const coupons = await listCoupons();
        res.status(200).json({ coupons });
    } catch (err) {
        console.error('adminListCoupons error:', err);
        res.status(500).json({ error: 'Failed to fetch coupons' });
    }
};

export const adminCreateCoupon = async (req, res) => {
    try {
        const {
            code, discount_percent, is_active = true,
            first_booking_only = true, min_booking_amount_inr,
        } = req.body;
        if (!code || !code.trim()) return res.status(400).json({ error: 'code is required.' });

        // 0 is allowed on purpose — lets an admin create a coupon that carries
        // eligibility rules (e.g. a minimum booking amount) without necessarily
        // discounting anything.
        const discountPercent = Number(discount_percent ?? 0);
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
            return res.status(400).json({ error: 'discount_percent must be a number between 0 and 100.' });
        }

        let minBookingAmountInr = null;
        if (min_booking_amount_inr !== undefined && min_booking_amount_inr !== null && min_booking_amount_inr !== '') {
            minBookingAmountInr = Number(min_booking_amount_inr);
            if (!Number.isFinite(minBookingAmountInr) || minBookingAmountInr < 0) {
                return res.status(400).json({ error: 'min_booking_amount_inr must be a non-negative number.' });
            }
        }

        const coupon = await createCoupon({
            code: code.trim().toUpperCase(),
            discount_percent: discountPercent,
            is_active: is_active !== false && is_active !== 'false',
            first_booking_only: first_booking_only !== false && first_booking_only !== 'false',
            min_booking_amount_inr: minBookingAmountInr,
        });
        res.status(201).json({ message: 'Coupon created successfully', coupon });
    } catch (err) {
        console.error('adminCreateCoupon error:', err);
        if (err.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists.' });
        res.status(500).json({ error: err.message || 'Failed to create coupon' });
    }
};

export const adminUpdateCoupon = async (req, res) => {
    try {
        const fields = {};
        if (req.body.code !== undefined) {
            if (!req.body.code.trim()) return res.status(400).json({ error: 'code cannot be empty.' });
            fields.code = req.body.code.trim().toUpperCase();
        }
        if (req.body.discount_percent !== undefined) {
            // 0 is allowed on purpose — see adminCreateCoupon.
            const discountPercent = Number(req.body.discount_percent);
            if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
                return res.status(400).json({ error: 'discount_percent must be a number between 0 and 100.' });
            }
            fields.discount_percent = discountPercent;
        }
        if (req.body.is_active !== undefined) {
            fields.is_active = req.body.is_active === true || req.body.is_active === 'true';
        }
        if (req.body.first_booking_only !== undefined) {
            fields.first_booking_only = req.body.first_booking_only === true || req.body.first_booking_only === 'true';
        }
        if (req.body.min_booking_amount_inr !== undefined) {
            if (req.body.min_booking_amount_inr === null || req.body.min_booking_amount_inr === '') {
                fields.min_booking_amount_inr = null;
            } else {
                const minBookingAmountInr = Number(req.body.min_booking_amount_inr);
                if (!Number.isFinite(minBookingAmountInr) || minBookingAmountInr < 0) {
                    return res.status(400).json({ error: 'min_booking_amount_inr must be a non-negative number.' });
                }
                fields.min_booking_amount_inr = minBookingAmountInr;
            }
        }

        const coupon = await updateCouponById(req.params.id, fields);
        res.status(200).json({ message: 'Coupon updated successfully', coupon });
    } catch (err) {
        console.error('adminUpdateCoupon error:', err);
        if (err.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists.' });
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to update coupon' });
    }
};

export const adminDeleteCoupon = async (req, res) => {
    try {
        await deleteCouponById(req.params.id);
        res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (err) {
        console.error('adminDeleteCoupon error:', err);
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message || 'Failed to delete coupon' });
    }
};
