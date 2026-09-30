import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import * as blogController from '../controllers/blog.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/content/blogs:
 *   get:
 *     summary: List published blogs (CONTENT-001)
 *     tags: [Content]
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
 *         description: Paginated list of published blogs
 */
router.get('/blogs', blogController.listBlogs);

/**
 * @swagger
 * /api/content/blogs/{slug}:
 *   get:
 *     summary: Get a single published blog by slug (CONTENT-002)
 *     tags: [Content]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog detail
 *       404:
 *         description: Blog not found
 */
router.get('/blogs/:slug', blogController.getBlogBySlug);

/**
 * @swagger
 * /api/content/blogs:
 *   post:
 *     summary: Create a new blog post (CONTENT-003)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               slug:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *               featured_image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Blog created
 */
router.post('/blogs', requireAuth, requireRole('admin'), blogController.createBlog);

/**
 * @swagger
 * /api/content/blogs/{id}:
 *   patch:
 *     summary: Update a blog post (CONTENT-004)
 *     tags: [Content]
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
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *     responses:
 *       200:
 *         description: Blog updated
 */
router.patch('/blogs/:id', requireAuth, requireRole('admin'), blogController.updateBlog);

export default router;
