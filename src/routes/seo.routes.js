import express from 'express';
import {
    getPractitionerProfile,
    getModalityCityListing,
    getSitemap,
} from '../controllers/seo.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SEO
 *   description: Dynamic SEO architecture, practitioner profiles, city listings, and sitemap
 */

/**
 * @swagger
 * /api/seo/profile/{modality}/{city}/{slug}:
 *   get:
 *     summary: Get SEO Practitioner Profile (SEO-001)
 *     description: Resolves practitioner profile, canonical URL, and JSON-LD for /{modality}/{city}/{slug}
 *     tags: [SEO]
 */
router.get('/seo/profile/:modality/:city/:slug', getPractitionerProfile);

/**
 * @swagger
 * /api/seo/listing/{modality}/{city}:
 *   get:
 *     summary: Get Modality + City Practitioner Listing (SEO-002)
 *     description: Resolves all active practitioners and SEO metadata for /{modality}/{city}
 *     tags: [SEO]
 */
router.get('/seo/listing/:modality/:city', getModalityCityListing);

/**
 * Root sitemap handler
 */
router.get('/sitemap.xml', getSitemap);

export default router;
