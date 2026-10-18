import express from 'express';
import {
    getPractitioners,
    getPractitionerProfile,
    getPractitionerServices,
    adminCreatePractitioner,
    adminUpdatePractitioner,
    adminDeletePractitioner,
    getMyPractitionerProfile,
    updateMyPractitionerProfile,
    adminUpdatePractitionerStatus,
    adminGetAllPractitioners,
    adminGetPractitionerById,
    applyToJoinAsPractitioner,
    adminApprovePractitioner,
    adminUploadPractitionerPhoto,
} from '../controllers/practitioner.controller.js';
import {
    getMyServices,
    createMyService,
    updateMyService,
    deleteMyService,
} from '../controllers/service.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { submitPractitionerSupport } from '../controllers/support.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Practitioners
 *   description: Practitioner listing, admin management and self-service
 */

// ─── Public routes ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/practitioners:
 *   get:
 *     summary: List published practitioners (PRAC-001)
 *     description: Returns published practitioners. No authentication required. Supports optional query filters and pagination.
 *     tags: [Practitioners]
 *     parameters:
 *       - in: query
 *         name: craft
 *         schema: { type: string }
 *         description: Filter by wellness craft/category (e.g. Yoga, Meditation)
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Filter by city
 *       - in: query
 *         name: bookable
 *         schema: { type: boolean }
 *         description: Filter only bookable practitioners
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
 *         description: Paginated list of practitioners.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 practitioners:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/practitioners', getPractitioners);

/**
 * PUBLIC: POST /api/practitioners/apply
 * Submit a practitioner application (no auth required)
 */
router.post('/practitioners/apply', applyToJoinAsPractitioner);

/**
 * @swagger
 * /api/practitioners/me:
 *   get:
 *     summary: Get own practitioner profile (PRAC-006)
 *     description: Returns the practitioner profile linked to the authenticated practitioner user via their `practitioner_slug`. Access - Practitioner only.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Own practitioner profile.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden – Practitioner role required.
 *       404:
 *         description: No practitioner profile linked to this user.
 */
router.get('/practitioners/me', requireAuth, requireRole('practitioner'), getMyPractitionerProfile);

/**
 * @swagger
 * /api/practitioners/me:
 *   patch:
 *     summary: Update own practitioner profile (PRAC-007)
 *     description: Allows a practitioner to update their own public profile. Updatable fields - `name`, `bio`, `city`, `craft`, `price_inr`, `image_url`. Access - Practitioner only.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:      { type: string, example: 'Jane Doe' }
 *               bio:       { type: string, example: 'Certified yoga instructor with 10 years experience.' }
 *               city:      { type: string, example: 'Mumbai' }
 *               craft:     { type: string, example: 'Yoga' }
 *               price_inr: { type: number, example: 1500 }
 *               image_url: { type: string, example: 'https://cdn.example.com/photo.jpg' }
 *     responses:
 *       200:
 *         description: Practitioner profile updated.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden – Practitioner role required.
 */
router.patch('/practitioners/me', requireAuth, requireRole('practitioner'), upload.single('image'), updateMyPractitionerProfile);

/**
 * @swagger
 * /api/practitioners/support:
 *   post:
 *     summary: Submit a support/help communication to Admin
 *     description: Practitioner submits a message which is dispatched as both an in-app notification and an email to admins with identical title and description.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title: { type: string, example: "Schedule adjustment inquiry" }
 *               description: { type: string, example: "I have a question about updating my availability for upcoming holidays." }
 *               category: { type: string, example: "General" }
 *     responses:
 *       201:
 *         description: Support request submitted and dispatched to admin.
 *       400:
 *         description: Title and description required.
 *       401:
 *         description: Unauthorized.
 */
router.post('/practitioners/support', requireAuth, requireRole('practitioner', 'admin'), submitPractitionerSupport);

// NOTE: these /practitioners/me/services* routes must be registered before
// /practitioners/:slug and /practitioners/:slug/services below — Express
// matches routes in registration order, so a generic :slug route registered
// first would otherwise swallow "me" as if it were a practitioner's slug.

/**
 * @swagger
 * /api/practitioners/me/services:
 *   get:
 *     summary: List my own services (practitioner self-service)
 *     description: Returns all services the logged-in practitioner has created, active or hidden.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of services.
 */
router.get('/practitioners/me/services', requireAuth, requireRole('practitioner'), getMyServices);

/**
 * @swagger
 * /api/practitioners/me/services:
 *   post:
 *     summary: Create a new service (practitioner self-service)
 *     description: Multipart/form-data. duration_min is not accepted — every session is fixed at 60 minutes.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:        { type: string, example: "Reiki Healing" }
 *               description: { type: string }
 *               price_inr:   { type: number, example: 1500 }
 *               category:    { type: string, example: "Energy Healing" }
 *               sort_order:  { type: integer }
 *               image:       { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Service created.
 */
router.post('/practitioners/me/services', requireAuth, requireRole('practitioner'), upload.single('image'), createMyService);

/**
 * @swagger
 * /api/practitioners/me/services/{id}:
 *   patch:
 *     summary: Update one of my own services (practitioner self-service)
 *     description: Multipart/form-data. Scoped to services owned by the logged-in practitioner.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service updated.
 *       404:
 *         description: Service not found (or not owned by you).
 */
router.patch('/practitioners/me/services/:id', requireAuth, requireRole('practitioner'), upload.single('image'), updateMyService);

/**
 * @swagger
 * /api/practitioners/me/services/{id}:
 *   delete:
 *     summary: Delete one of my own services (practitioner self-service)
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service deleted.
 *       404:
 *         description: Service not found (or not owned by you).
 */
router.delete('/practitioners/me/services/:id', requireAuth, requireRole('practitioner'), deleteMyService);

/**
 * @swagger
 * /api/practitioners/{slug}:
 *   get:
 *     summary: Get a single practitioner by slug (PRAC-002)
 *     description: Returns the public profile of a single practitioner. No authentication required.
 *     tags: [Practitioners]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         description: The unique slug of the practitioner (e.g. jane-doe)
 *     responses:
 *       200:
 *         description: Practitioner profile.
 *       404:
 *         description: Practitioner not found.
 */
router.get('/practitioners/:slug', getPractitionerProfile);

/**
 * @swagger
 * /api/practitioners/{slug}/services:
 *   get:
 *     summary: Get a practitioner's own services (PRAC-002b)
 *     description: Returns the services this practitioner has created for themselves, so booking pricing reflects this practitioner instead of a shared catalog. No authentication required.
 *     tags: [Practitioners]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of this practitioner's own services.
 *       404:
 *         description: Practitioner not found.
 */
router.get('/practitioners/:slug/services', getPractitionerServices);

// ─── Admin routes ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/practitioners:
 *   get:
 *     summary: Admin - List all practitioners
 *     description: Returns all practitioners (published or not). Supports pagination, search, and filters.
 *     tags: [Practitioners, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by practitioner name
 *       - in: query
 *         name: is_published
 *         schema: { type: boolean }
 *       - in: query
 *         name: bookable
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of practitioners.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 practitioners:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/admin/practitioners', requireAuth, requireRole('admin'), adminGetAllPractitioners);

/**
 * @swagger
 * /api/admin/practitioners/{id}:
 *   get:
 *     summary: Admin - Get Practitioner by ID
 *     description: Admin retrieve a specific practitioner by UUID instead of slug.
 *     tags: [Practitioners, Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Practitioner profile.
 *       404:
 *         description: Practitioner not found.
 */
router.get('/admin/practitioners/:id', requireAuth, requireRole('admin'), adminGetPractitionerById);

/**
 * @swagger
 * /api/admin/practitioners:
 *   post:
 *     summary: Create a new practitioner (PRAC-003)
 *     description: |
 *       Admin only. Creates a new practitioner record AND immediately creates their
 *       login: a Supabase Auth user (which emails them an invite to set their
 *       password), linked via a `profiles` row + `practitioner` role — the same
 *       mechanism `POST /api/admin/practitioners/:id/approve` uses for the public
 *       apply flow. `email`, `mobile_number`, and `whatsapp_number` are required for
 *       this reason; a practitioner created without them would have no way to ever
 *       log into the Guide Portal.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, mobile_number, whatsapp_number]
 *             properties:
 *               name:             { type: string, example: 'Jane Doe' }
 *               email:            { type: string, example: 'jane@example.com', description: "Where the login invite is sent — becomes application_email" }
 *               mobile_number:    { type: string, example: '+91 98765 43210' }
 *               whatsapp_number:  { type: string, example: '+91 98765 43210' }
 *               bio:        { type: string }
 *               city:       { type: string }
 *               craft:      { type: string }
 *               price_inr:  { type: number }
 *               is_published: { type: boolean, default: false }
 *               bookable:   { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Practitioner created and invite sent.
 *       400:
 *         description: Missing/invalid name, email, mobile_number, or whatsapp_number.
 *       403:
 *         description: Forbidden – Admin role required.
 */
router.post('/admin/practitioners', requireAuth, requireRole('admin'), adminCreatePractitioner);

/**
 * @swagger
 * /api/admin/practitioners/{id}:
 *   patch:
 *     summary: Update a practitioner (PRAC-004)
 *     description: Admin only. Update any field of a practitioner by their ID.
 *     tags: [Practitioners]
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
 *     responses:
 *       200:
 *         description: Practitioner updated.
 *       403:
 *         description: Forbidden.
 */
router.patch('/admin/practitioners/:id', requireAuth, requireRole('admin'), adminUpdatePractitioner);

/**
 * @swagger
 * /api/admin/practitioners/{id}:
 *   delete:
 *     summary: Deactivate a practitioner (PRAC-005)
 *     description: Admin only. Soft-deletes a practitioner by setting is_published and bookable to false. Booking history is preserved.
 *     tags: [Practitioners]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Practitioner deactivated.
 *       403:
 *         description: Forbidden.
 */
router.delete('/admin/practitioners/:id', requireAuth, requireRole('admin'), adminDeletePractitioner);

/**
 * @swagger
 * /api/admin/practitioners/{id}/status:
 *   patch:
 *     summary: Activate/Deactivate a practitioner (PRAC-008)
 *     tags: [Practitioners, Admin]
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
 *               status: { type: boolean, description: "True = active/bookable, False = inactive" }
 *     responses:
 *       200:
 *         description: Practitioner status updated
 */
router.patch('/admin/practitioners/:id/status', requireAuth, requireRole('admin'), adminUpdatePractitionerStatus);

/**
 * ADMIN: POST /api/admin/practitioners/:id/approve
 * Approve a pending practitioner – creates their auth account and sends invite email
 */
router.post('/admin/practitioners/:id/approve', requireAuth, requireRole('admin'), adminApprovePractitioner);

/**
 * ADMIN: POST /api/admin/practitioners/:id/photo
 * Upload or replace a practitioner photo (bypasses storage RLS via service role)
 */
router.post('/admin/practitioners/:id/photo', requireAuth, requireRole('admin'), upload.single('photo'), adminUploadPractitionerPhoto);

export default router;
