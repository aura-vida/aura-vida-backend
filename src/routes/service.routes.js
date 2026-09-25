import express from 'express';
import {
    getServices,
    getService,
    adminCreateService,
    adminUpdateService,
    adminDeleteService,
} from '../controllers/service.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Services
 *   description: Wellness service catalogue APIs
 */

/**
 * @swagger
 * /api/services:
 *   get:
 *     summary: List all active services (SERVICE-001)
 *     description: Returns active services. Public, no token required. Optionally filter by category. Supports pagination.
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by category (e.g. Yoga, Meditation)
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
 *         description: Paginated list of services.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 services:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/services', getServices);

/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     summary: Service details (SERVICE-002)
 *     description: Returns a single service by its UUID. Public, no token required.
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service details.
 *       404:
 *         description: Service not found.
 */
router.get('/services/:id', getService);

/**
 * @swagger
 * /api/admin/services:
 *   post:
 *     summary: Create a service (SERVICE-003)
 *     description: Admin only. Creates a new wellness service entry.
 *     tags: [Services]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:         { type: string, example: "Hatha Yoga" }
 *               description:  { type: string, example: "A gentle yoga practice." }
 *               duration_min: { type: integer, example: 60 }
 *               price_inr:    { type: number, example: 1500 }
 *               category:     { type: string, example: "Yoga" }
 *               image_url:    { type: string }
 *               sort_order:   { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Service created.
 *       409:
 *         description: Duplicate service name.
 */
router.post('/admin/services', requireAuth, requireRole('admin'), upload.single('image'), adminCreateService);

/**
 * @swagger
 * /api/admin/services/{id}:
 *   patch:
 *     summary: Update a service (SERVICE-004)
 *     description: Admin only. Partially updates an existing service.
 *     tags: [Services]
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
 *             properties:
 *               name:         { type: string }
 *               description:  { type: string }
 *               duration_min: { type: integer }
 *               price_inr:    { type: number }
 *               category:     { type: string }
 *               image_url:    { type: string }
 *               is_active:    { type: boolean }
 *               sort_order:   { type: integer }
 *     responses:
 *       200:
 *         description: Service updated.
 *       404:
 *         description: Service not found.
 */
router.patch('/admin/services/:id', requireAuth, requireRole('admin'), upload.single('image'), adminUpdateService);

/**
 * @swagger
 * /api/admin/services/{id}:
 *   delete:
 *     summary: Delete/deactivate a service (SERVICE-005)
 *     description: Admin only. Soft-deletes (sets is_active = false) to preserve existing booking references.
 *     tags: [Services]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service deactivated.
 *       404:
 *         description: Service not found.
 */
router.delete('/admin/services/:id', requireAuth, requireRole('admin'), adminDeleteService);

export default router;
