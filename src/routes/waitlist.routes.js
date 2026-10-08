import express from 'express';
import { joinWaitlist } from '../controllers/waitlist.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Waitlist
 *   description: Email waitlist for early access
 */

/**
 * @swagger
 * /api/waitlist:
 *   post:
 *     summary: Join the waitlist (public)
 *     description: Adds an email to the waitlist. Returns 409 if email already exists.
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       201:
 *         description: Successfully joined the waitlist
 *       400:
 *         description: Invalid email
 *       409:
 *         description: Email already on the waitlist
 */
router.post('/waitlist', joinWaitlist);

export default router;
