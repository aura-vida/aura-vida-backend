import express from 'express';
import {
    getServices,
    getAdminServices,
    getService,
} from '../controllers/service.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Services
 *   description: Wellness services — each one is created and owned by a practitioner (see /api/practitioners/me/services for self-service management)
 */

/**
 * @swagger
 * /api/services:
 *   get:
 *     summary: List all active services (SERVICE-001)
 *     description: Returns active services across all practitioners. Public, no token required. Optionally filter by category. Supports pagination.
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
 *   get:
 *     summary: Admin – list all services, read-only (SERVICE-006)
 *     description: |
 *       Admin only, read-only. Services are created and managed by the practitioners who
 *       own them (see /api/practitioners/me/services) — this endpoint exists purely for
 *       admin oversight, so each row includes the owning practitioner's name and slug.
 *     tags: [Services]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated list of all services, each with its owning practitioner.
 */
router.get('/admin/services', requireAuth, requireRole('admin'), getAdminServices);

export default router;
