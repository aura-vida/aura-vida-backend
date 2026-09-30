import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Admin Dashboard overview
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview containing users count, booking counts, and total revenue
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (requires admin role)
 */
router.get('/dashboard', requireAuth, requireRole('admin'), adminController.dashboard);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get list of users with pagination and search
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by full name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of users with pagination metadata
 */
router.get('/users', requireAuth, requireRole('admin'), adminController.usersList);

/**
 * @swagger
 * /api/admin/appointments:
 *   get:
 *     summary: Get list of appointments with pagination and filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter appointments by status (e.g. pending, confirmed)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of appointments with pagination metadata
 */
router.get('/appointments', requireAuth, requireRole('admin'), adminController.appointmentsList);

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     summary: Get list of payments/orders with pagination and filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by payment status (e.g. paid, created, refunded)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of payments with pagination metadata
 */
router.get('/payments', requireAuth, requireRole('admin'), adminController.paymentsList);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     summary: Get user details by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile and role
 */
router.get('/users/:id', requireAuth, requireRole('admin'), adminController.getUserDetails);

/**
 * @swagger
 * /api/admin/users/{id}/status:
 *   patch:
 *     summary: Update user status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Updated user profile
 */
router.patch('/users/:id/status', requireAuth, requireRole('admin'), adminController.updateUserStatus);

/**
 * @swagger
 * /api/admin/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of standard roles
 */
router.get('/roles', requireAuth, requireRole('admin'), adminController.rolesList);

/**
 * @swagger
 * /api/admin/roles/{id}/permissions:
 *   put:
 *     summary: Update role permissions (Super Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated role permissions
 */
router.put('/roles/:id/permissions', requireAuth, requireRole('superadmin'), adminController.updateRolePermissions);

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: List audit logs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated audit logs
 */
router.get('/audit-logs', requireAuth, requireRole('admin', 'superadmin'), adminController.getAuditLogs);

/**
 * @swagger
 * /api/admin/practitioners/{id}/status:
 *   patch:
 *     summary: Update practitioner active status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Practitioner status updated
 */
router.patch('/practitioners/:id/status', requireAuth, requireRole('admin'), adminController.updatePractitionerStatus);

/**
 * @swagger
 * /api/admin/practitioners/{id}/services:
 *   patch:
 *     summary: Update practitioner linked services
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Services updated successfully
 */
router.patch('/practitioners/:id/services', requireAuth, requireRole('admin'), adminController.updatePractitionerServices);

/**
 * @swagger
 * /api/admin/contacts:
 *   get:
 *     summary: List all contact enquiries (CONTACT-002)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Paginated list of contact enquiries
 */
router.get('/contacts', requireAuth, requireRole('admin'), adminController.listContacts);

/**
 * @swagger
 * /api/admin/reviews/{id}/status:
 *   patch:
 *     summary: Moderate a review — approve or reject (REVIEW-003)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, pending]
 *     responses:
 *       200:
 *         description: Review status updated
 */
router.patch('/reviews/:id/status', requireAuth, requireRole('admin'), adminController.moderateReview);

export default router;
