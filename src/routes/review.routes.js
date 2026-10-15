import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as reviewController from '../controllers/review.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/reviews/practitioner/{id}:
 *   get:
 *     summary: List approved reviews for a practitioner (REVIEW-001)
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Practitioner user ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of approved reviews
 */
router.get('/practitioner/:id', reviewController.listPractitionerReviews);

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Submit a review for a practitioner (REVIEW-002)
 *     description: |
 *       Customers only. A customer may only review a practitioner they've had a
 *       confirmed or completed booking with. Practitioners and admins cannot
 *       submit or modify ratings through this endpoint.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [practitioner_id, rating]
 *             properties:
 *               practitioner_id:
 *                 type: string
 *               booking_id:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review submitted and pending approval
 */
router.post('/', requireAuth, requireRole('client'), reviewController.createReview);

export default router;
