import express from 'express';
import {
    submitSpace,
    adminListSpaces,
    adminCreateSpaceController,
    adminUpdateSpaceController,
    adminUpdateSpaceStatus,
    adminDeleteSpace,
    adminPackSpaceSlotController,
    adminReleaseSpaceSlotController,
} from '../controllers/space.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Spaces
 *   description: Partner space listing submissions and admin management
 */

/**
 * @swagger
 * /api/spaces:
 *   post:
 *     summary: Submit a studio/space listing (public)
 *     description: Allows anyone to submit their studio space for review.
 *     tags: [Spaces]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contact_name, email, space_name, address, city, pin, capacity]
 *             properties:
 *               contact_name: { type: string, example: "Rohan Sharma" }
 *               email:        { type: string, format: email }
 *               space_name:   { type: string, example: "Zen Studio Mumbai" }
 *               address:      { type: string, example: "12 Bandra West, Mumbai" }
 *               city:         { type: string, example: "Mumbai" }
 *               pin:          { type: string, example: "400050" }
 *               capacity:     { type: integer, example: 20 }
 *               phone:        { type: string, example: "+919876543210" }
 *               space_type:   { type: string, example: "Yoga Studio" }
 *               amenities:    { type: array, items: { type: string }, example: ["AC", "Mats", "Sound System"] }
 *               availability: { type: string, example: "Weekdays 6am-8pm" }
 *               notes:        { type: string }
 *     responses:
 *       201:
 *         description: Space submission received
 *       400:
 *         description: Missing required fields
 */
router.post('/spaces', submitSpace);

import { getPublicSpaces } from '../controllers/space.controller.js';

/**
 * @swagger
 * /api/spaces:
 *   get:
 *     summary: Get approved and contacted spaces by PIN
 *     tags: [Spaces]
 *     parameters:
 *       - in: query
 *         name: pin
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of spaces
 */
router.get('/spaces', getPublicSpaces);

/**
 * @swagger
 * /api/admin/spaces:
 *   get:
 *     summary: Admin - List all space submissions
 *     description: Returns all partner space submissions. Supports status and city filters plus pagination.
 *     tags: [Spaces, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [new, contacted, approved, declined] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of spaces
 */
router.get('/admin/spaces', requireAuth, requireRole('admin'), adminListSpaces);

/**
 * @swagger
 * /api/admin/spaces:
 *   post:
 *     summary: Admin - Create a new partner space directly
 *     tags: [Spaces, Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [space_name, address, city, pin]
 *     responses:
 *       201:
 *         description: Space created
 */
router.post('/admin/spaces', requireAuth, requireRole('admin'), adminCreateSpaceController);

/**
 * @swagger
 * /api/admin/spaces/{id}:
 *   put:
 *     summary: Admin - Update partner space details
 *     tags: [Spaces, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Space updated
 */
router.put('/admin/spaces/:id', requireAuth, requireRole('admin'), adminUpdateSpaceController);
router.patch('/admin/spaces/:id', requireAuth, requireRole('admin'), adminUpdateSpaceController);

/**
 * @swagger
 * /api/admin/spaces/{id}/status:
 *   patch:
 *     summary: Admin - Update space submission status
 *     tags: [Spaces, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [new, contacted, approved, declined] }
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Submission not found
 */
router.patch('/admin/spaces/:id/status', requireAuth, requireRole('admin'), adminUpdateSpaceStatus);

/**
 * @swagger
 * /api/admin/spaces/{id}:
 *   delete:
 *     summary: Admin - Permanently delete a space submission
 *     tags: [Spaces, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Submission deleted
 *       404:
 *         description: Not found
 */
router.delete('/admin/spaces/:id', requireAuth, requireRole('admin'), adminDeleteSpace);

/**
  * @swagger
  * /api/admin/spaces/{id}/pack-slot:
  *   post:
  *     summary: Admin - Pack / reserve a slot for a partner space
  *     tags: [Spaces, Admin]
  */
router.post('/admin/spaces/:id/pack-slot', requireAuth, requireRole('admin'), adminPackSpaceSlotController);

/**
  * @swagger
  * /api/admin/spaces/{id}/packed-slots/{slotId}:
  *   delete:
  *     summary: Admin - Release a previously packed slot
  *     tags: [Spaces, Admin]
  */
router.delete('/admin/spaces/:id/packed-slots/:slotId', requireAuth, requireRole('admin'), adminReleaseSpaceSlotController);

export default router;
