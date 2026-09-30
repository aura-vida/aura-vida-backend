import express from 'express';
import { getNearbySuggestions } from '../controllers/location.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: Google Maps nearby meeting point suggestions
 */

/**
 * @swagger
 * /api/locations/nearby-suggestions:
 *   get:
 *     summary: Get nearby meeting point suggestions (LOC-001)
 *     description: |
 *       Secure backend proxy for the Google Places Nearby Search API.
 *       
 *       **How the `place_id` works in the booking flow:**
 *       1. Call this endpoint with the practitioner slug + the customer's current coordinates.
 *       2. The backend fetches the practitioner's `base_lat`/`base_lng` from the DB.
 *       3. A midpoint between both locations is used as the search center.
 *       4. Google Places returns a list of nearby spots (cafes, parks, etc).
 *       5. Each result includes a `place_id` — a permanent unique Google ID for that location.
 *       6. The customer picks a spot on the map → the frontend puts that spot's `place_id`, `lat`, `lng`, and `address` into the APT-001 `POST /api/appointments` body automatically.
 *       
 *       **The customer never types the `place_id` manually.**
 *     tags: [Locations]
 *     parameters:
 *       - in: query
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         description: The practitioner's slug (e.g. alex-practitioner)
 *       - in: query
 *         name: customer_pincode
 *         schema: { type: string }
 *         description: Customer's pincode to compute a midpoint (optional — if omitted, uses only practitioner's location)
 *       - in: query
 *         name: type
 *         schema: { type: string, default: cafe }
 *         description: "Google Places type filter. Examples: cafe, park, restaurant, gym, spa"
 *       - in: query
 *         name: radius
 *         schema: { type: integer, default: 2000 }
 *         description: Search radius in meters (default 2km)
 *     responses:
 *       200:
 *         description: List of nearby meeting spot suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 search_center:
 *                   type: object
 *                   properties:
 *                     lat: { type: number }
 *                     lng: { type: number }
 *                 practitioner:
 *                   type: object
 *                 radius_m: { type: integer }
 *                 type: { type: string }
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       address: { type: string }
 *                       lat: { type: number }
 *                       lng: { type: number }
 *                       place_id: { type: string, description: "Pass this in the APT-001 meeting_location.place_id field" }
 *                       rating: { type: number }
 *                       open_now: { type: boolean }
 *       400:
 *         description: Missing slug
 *       404:
 *         description: Practitioner not found
 *       422:
 *         description: Practitioner has not set their base location
 *       503:
 *         description: Google Maps API key not configured
 */
router.get('/locations/nearby-suggestions', getNearbySuggestions);

export default router;
