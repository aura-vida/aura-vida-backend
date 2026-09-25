import express from 'express';
import {
    getSchedule,
    updateOwnSchedule,
    adminUpdateSchedule,
    blockSlot,
    unblockSlot,
    getAvailableSlots,
} from '../controllers/availability.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Availability
 *   description: Practitioner scheduling and available slot APIs
 */

/**
 * @swagger
 * /api/practitioners/{slug}/availability:
 *   get:
 *     summary: Get practitioner recurring schedule (AV-001)
 *     description: Returns the weekly recurring schedule for a practitioner. Public, no token required.
 *     tags: [Availability]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of weekly schedule slots.
 */
router.get('/practitioners/:slug/availability', getSchedule);

/**
 * @swagger
 * /api/appointments/available-slots:
 *   get:
 *     summary: Get bookable time slots for a date (AV-006)
 *     description: Calculates available bookable time slots for a given date. Subtracts existing bookings and blocked exceptions. Public.
 *     tags: [Availability]
 *     parameters:
 *       - in: query
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         example: "2026-10-05"
 *       - in: query
 *         name: serviceId
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of available slots.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date: { type: string }
 *                 slots:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       start: { type: string, example: "09:00" }
 *                       end: { type: string, example: "10:00" }
 *                       duration_min: { type: number }
 *                       available: { type: boolean }
 */
router.get('/appointments/available-slots', getAvailableSlots);

/**
 * @swagger
 * /api/practitioners/me/availability:
 *   put:
 *     summary: Update own weekly schedule (AV-002)
 *     description: |
 *       Practitioner only. Updates the schedule incrementally by day, so unmentioned days are preserved.
 *       Send an array of `schedule_updates` grouped by day.
 *       Sending an empty `slots` array for a specific day clears that entire day.
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [schedule_updates]
 *             properties:
 *               schedule_updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [day_of_week, slots]
 *                   properties:
 *                     day_of_week:  { type: integer, minimum: 0, maximum: 6, example: 1, description: "0=Sun, 1=Mon … 6=Sat" }
 *                     slots:
 *                       type: array
 *                       description: "Pass an empty array [] to delete all slots for this day"
 *                       items:
 *                         type: object
 *                         required: [start_time, end_time]
 *                         properties:
 *                           start_time:   { type: string, example: "09:00" }
 *                           end_time:     { type: string, example: "17:00" }
 *                           duration_min: { type: integer, example: 60 }
 *     responses:
 *       200:
 *         description: Schedule updated.
 *       403:
 *         description: Forbidden.
 */
router.put('/practitioners/me/availability', requireAuth, requireRole('practitioner'), updateOwnSchedule);

/**
 * @swagger
 * /api/admin/practitioners/{slug}/availability:
 *   put:
 *     summary: Admin – update any practitioner's schedule (AV-003)
 *     description: Admin only. Incremental per-day update logic (same behaviour as AV-002 by groups).
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               schedule_updates:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Schedule updated.
 */
router.put('/admin/practitioners/:slug/availability', requireAuth, requireRole('admin'), adminUpdateSchedule);

/**
 * @swagger
 * /api/practitioners/{slug}/availability/exceptions:
 *   post:
 *     summary: Create leave/special hours (AV-004)
 *     description: Practitioner or Admin. Adds an exception that marks a specific date+time window as unavailable.
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         description: Practitioner ID / slug
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [exception_date, start_time, end_time, type]
 *             properties:
 *               exception_date: { type: string, format: date, example: "2026-10-10" }
 *               start_time:     { type: string, example: "14:00" }
 *               end_time:       { type: string, example: "16:00" }
 *               type:           { type: string, example: "leave" }
 *               reason:         { type: string, example: "Personal appointment" }
 *     responses:
 *       201:
 *         description: Exception created.
 */
router.post('/practitioners/:slug/availability/exceptions', requireAuth, requireRole('practitioner', 'admin'), blockSlot);

/**
 * @swagger
 * /api/practitioners/{slug}/availability/exceptions/{exceptionId}:
 *   delete:
 *     summary: Remove exception (AV-005)
 *     description: Practitioner or Admin. Removes a previously created availability exception.
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: exceptionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Exception removed.
 */
router.delete('/practitioners/:slug/availability/exceptions/:exceptionId', requireAuth, requireRole('practitioner', 'admin'), unblockSlot);

export default router;
