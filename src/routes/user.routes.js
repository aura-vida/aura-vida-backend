import express from 'express';
import { getMe, updateMe, getMyAppointments, adminLinkPractitioner, deleteMe } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Authenticated user profile and appointment management
 */

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get own profile (USER-001)
 *     description: Returns the profile and role of the currently authenticated user. Accessible by Customers and Practitioners.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized – missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', requireAuth, getMe);

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update own profile (USER-002)
 *     description: Allows a logged-in Customer or Practitioner to update their own profile fields. Only `full_name`, `phone`, and `referred_by` can be updated.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: John Doe
 *               phone:
 *                 type: string
 *                 example: '+919876543210'
 *               referred_by:
 *                 type: string
 *                 example: 'A8F4D2C1'
 *     responses:
 *       200:
 *         description: Profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *                 profile:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/me', requireAuth, updateMe);

/**
 * @swagger
 * /api/users/me/appointments:
 *   get:
 *     summary: Get own appointment history (USER-003)
 *     description: Returns bookings made by the currently authenticated Customer. Supports optional status filter and pagination. Practitioners and Admins are not allowed.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, cancelled, completed]
 *         required: false
 *         description: Filter bookings by status
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of results per page (max 100)
 *     responses:
 *       200:
 *         description: Appointments fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appointments:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden – only Customers can access this endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me/appointments', requireAuth, requireRole('client'), getMyAppointments);

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Delete own account (USER-004)
 *     description: Permanently deletes the authenticated Customer's account. Requires confirmation to be true.
 *     tags:
 *       - Users
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmation
 *             properties:
 *               confirmation:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Account deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing or invalid confirmation field.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - only Customers can delete their own account.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/me', requireAuth, requireRole('client'), deleteMe);

/**
 * @swagger
 * /api/users/admin/{id}/link-practitioner:
 *   patch:
 *     summary: Link a practitioner profile to a user account
 *     description: Admin only. Sets the `practitioner_slug` on a user's profile to connect their account to a public practitioner listing.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The User Account UUID you want to link
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [practitioner_slug]
 *             properties:
 *               practitioner_slug: { type: string, example: 'alex-practitioner' }
 *     responses:
 *       200:
 *         description: Practitioner profile successfully linked.
 *       403:
 *         description: Forbidden – Admin role required.
 */
router.patch('/admin/:id/link-practitioner', requireAuth, requireRole('admin'), adminLinkPractitioner);

export default router;
