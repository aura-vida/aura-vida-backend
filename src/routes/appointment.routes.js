import express from 'express';
import {
    createAppointment,
    listMyAppointments,
    getAppointmentById,
    cancelAppointment,
    rescheduleAppointment,
    assignPractitioner,
    confirmAppointment,
    listPractitionerAppointments,
    updatePractitionerAppointmentStatus,
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
 *   post:
 *     summary: Create booking (APT-001)
 *     description: Creates a new appointment booking for the authenticated Customer. The `meeting_location` should be the location object the customer selected via the Google Places API on the frontend (based on the practitioner's base coordinates).
 *     tags: [Appointments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [service_id, practitioner_slug, date, time]
 *             properties:
 *               service_id: { type: string, format: uuid, example: "064dbf93-480e-47e9-b7f3-a57e1868f599" }
 *               practitioner_slug: { type: string, example: "alex-practitioner" }
 *               date: { type: string, format: date, example: "2026-10-10" }
 *               time: { type: string, example: "10:00" }
 *               group_size: { type: integer, default: 1, minimum: 1, maximum: 6 }
 *               attendees: { type: array, items: { type: string }, example: [] }
 *               meeting_location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number, example: 19.0522 }
 *                   lng: { type: number, example: 72.8427 }
 *                   address: { type: string, example: "Starbucks, Bandra Kurla Complex" }
 *                   place_id: { type: string, example: "ChIJ_z_mFnb55zsR2wZ" }
 *                   pincode: { type: string, example: "400051" }
 *     responses:
 *       201:
 *         description: Appointment booked successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden – Customers only
 */
router.post('/appointments', requireAuth, requireRole('client'), createAppointment);

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
 *     description: Customer or Admin can cancel an appointment that is not already cancelled or completed.
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
 *         description: Appointment cancelled
 *       400:
 *         description: Already cancelled or completed
 *       404:
 *         description: Not found
 */
router.post('/appointments/:id/cancel', requireAuth, requireRole('admin', 'practitioner', 'customer'), cancelAppointment);

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
