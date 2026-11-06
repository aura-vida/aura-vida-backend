import express from 'express';
import {
    listMyAppointments,
    getAppointmentById,
    cancelAppointment,
    rescheduleAppointment,
    assignPractitioner,
    confirmAppointment,
    listPractitionerAppointments,
    updatePractitionerAppointmentStatus,
    completeAppointment,
} from '../controllers/appointment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Appointments
 *   description: Appointment booking and lifecycle APIs
 */

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     summary: List my appointments (APT-002)
 *     description: Returns all appointments for the authenticated Customer with optional status filter and pagination.
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled, completed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appointments: { type: array, items: { type: object } }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/appointments', requireAuth, requireRole('client'), listMyAppointments);

/**
 * @swagger
 * /api/appointments/{id}:
 *   get:
 *     summary: Get single appointment (APT-003)
 *     description: Returns a single appointment. Accessible by the booking owner, their practitioner, or an admin.
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Appointment detail
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get('/appointments/:id', requireAuth, getAppointmentById);

/**
 * @swagger
 * /api/appointments/{id}/cancel:
 *   post:
 *     summary: Cancel appointment (APT-004)
 *     description: |
 *       Customer, practitioner, or admin can cancel an appointment that is not already
 *       cancelled or completed. A plain customer cancelling their own booking may only
 *       do so within 4 hours of when the booking was created (payment confirmed) —
 *       practitioners and admins are exempt from this window. If the booking was paid,
 *       a refund of the session price (excluding the non-refundable 5% tax) is
 *       automatically initiated.
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Appointment cancelled (and refund initiated, if applicable).
 *       400:
 *         description: |
 *           Already cancelled/completed, or (for a customer's own booking) the 4-hour
 *           self-cancellation window has expired — response includes `cancelWindowExpired: true`.
 *       403:
 *         description: Forbidden — not the booking's client, assigned practitioner, or an admin.
 *       404:
 *         description: Not found
 */
router.post('/appointments/:id/cancel', requireAuth, requireRole('admin', 'practitioner', 'client', 'customer'), cancelAppointment);

/**
 * @swagger
 * /api/appointments/{id}/reschedule:
 *   post:
 *     summary: Reschedule appointment (APT-005)
 *     description: Customer or Admin can reschedule an appointment to a new date and time.
 *     tags: [Appointments]
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
 *             required: [date, time]
 *             properties:
 *               date: { type: string, format: date, example: "2026-10-15" }
 *               time: { type: string, example: "14:00" }
 *     responses:
 *       200:
 *         description: Appointment rescheduled
 *       400:
 *         description: Invalid or already terminal status
 *       404:
 *         description: Not found
 */
router.post('/appointments/:id/reschedule', requireAuth, rescheduleAppointment);

/**
 * @swagger
 * /api/appointments/{id}/complete:
 *   post:
 *     summary: Complete appointment (APT-010)
 *     description: Customer, Practitioner, or Admin marks a confirmed appointment as completed.
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Appointment completed and practitioner session count updated
 *       400:
 *         description: Appointment not in confirmed status
 *       404:
 *         description: Not found
 */
router.post('/appointments/:id/complete', requireAuth, completeAppointment);

/**
 * @swagger
 * /api/admin/appointments/{id}/assign:
 *   post:
 *     summary: Admin – assign practitioner (APT-006)
 *     description: Admin only. Assigns or reassigns a practitioner to a booking.
 *     tags: [Appointments]
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
 *             required: [practitioner_slug]
 *             properties:
 *               practitioner_slug: { type: string, example: "alex-practitioner" }
 *     responses:
 *       200:
 *         description: Practitioner assigned
 *       404:
 *         description: Not found
 */
router.post('/admin/appointments/:id/assign', requireAuth, requireRole('admin'), assignPractitioner);

/**
 * @swagger
 * /api/admin/appointments/{id}/confirm:
 *   post:
 *     summary: Admin – confirm booking (APT-007)
 *     description: Admin only. Confirms a pending appointment.
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Appointment confirmed
 *       404:
 *         description: Not found
 */
router.post('/admin/appointments/:id/confirm', requireAuth, requireRole('admin'), confirmAppointment);

/**
 * @swagger
 * /api/practitioners/appointments:
 *   get:
 *     summary: List own appointments (APT-008)
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled, completed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of appointments
 */
router.get('/practitioners/appointments', requireAuth, requireRole('practitioner'), listPractitionerAppointments);

/**
 * @swagger
 * /api/practitioners/appointments/{id}/status:
 *   patch:
 *     summary: Update appointment status (APT-009)
 *     tags: [Appointments]
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
 *               status: { type: string, enum: [pending, confirmed, cancelled, completed] }
 *     responses:
 *       200:
 *         description: Appointment status updated
 */
router.patch('/practitioners/appointments/:id/status', requireAuth, requireRole('practitioner', 'admin'), updatePractitionerAppointmentStatus);

export default router;
