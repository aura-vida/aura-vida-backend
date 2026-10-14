import express from 'express';
import {
    validateCoupon,
    adminListCoupons,
    adminCreateCoupon,
    adminUpdateCoupon,
    adminDeleteCoupon,
} from '../controllers/coupon.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Promo codes with admin-configurable eligibility rules
 */

/**
 * @swagger
 * /api/coupons/validate:
 *   post:
 *     summary: Validate a coupon code (COUPON-001)
 *     description: |
 *       Checks a coupon code for the authenticated client against its configured
 *       eligibility rules — it must be a known, active code, and (depending on how
 *       the admin configured it) the client may need no confirmed booking yet
 *       (`first_booking_only`) and/or the booking amount may need to meet a
 *       configured minimum (`min_booking_amount_inr`). Returns the discount
 *       percentage to preview before checkout. `POST /api/payments/create-order`
 *       independently re-validates the same way when the booking is actually paid for.
 *     tags: [Coupons]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: "LAUNCH10" }
 *               amount: { type: number, description: "Session subtotal in INR (before tax) — checked against the coupon's minimum booking amount, if one is configured", example: 1200 }
 *     responses:
 *       200:
 *         description: Coupon is valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid: { type: boolean }
 *                 code: { type: string }
 *                 discountPercent: { type: number }
 *       400:
 *         description: Unknown/inactive code, or already used (not the client's first booking)
 */
router.post('/coupons/validate', requireAuth, requireRole('client'), validateCoupon);

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/coupons:
 *   get:
 *     summary: List all coupons (admin)
 *     tags: [Coupons]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All coupons.
 *   post:
 *     summary: Create a coupon (admin)
 *     tags: [Coupons]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: "LAUNCH30" }
 *               discount_percent: { type: number, default: 0, minimum: 0, maximum: 100, description: "0 is allowed — lets a coupon carry only eligibility rules with no discount", example: 30 }
 *               is_active: { type: boolean, default: true }
 *               first_booking_only: { type: boolean, default: true, description: "Only redeemable when the customer has no confirmed booking yet" }
 *               min_booking_amount_inr: { type: number, nullable: true, description: "Session subtotal must meet this (in INR) to redeem; null/omitted = no minimum", example: 3000 }
 *     responses:
 *       201:
 *         description: Coupon created.
 *       409:
 *         description: A coupon with this code already exists.
 */
router.get('/admin/coupons', requireAuth, requireRole('admin'), adminListCoupons);
router.post('/admin/coupons', requireAuth, requireRole('admin'), adminCreateCoupon);

/**
 * @swagger
 * /api/admin/coupons/{id}:
 *   patch:
 *     summary: Update a coupon (admin)
 *     tags: [Coupons]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               discount_percent: { type: number, minimum: 0, maximum: 100 }
 *               is_active: { type: boolean }
 *               first_booking_only: { type: boolean }
 *               min_booking_amount_inr: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Coupon updated.
 *       404:
 *         description: Coupon not found.
 *   delete:
 *     summary: Delete a coupon (admin)
 *     tags: [Coupons]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Coupon deleted.
 */
router.patch('/admin/coupons/:id', requireAuth, requireRole('admin'), adminUpdateCoupon);
router.delete('/admin/coupons/:id', requireAuth, requireRole('admin'), adminDeleteCoupon);

export default router;
