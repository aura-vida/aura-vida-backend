import fetch from 'node-fetch';
import { supabase } from '../config/supabase.js';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ─── LOC-001: Get nearby meeting point suggestions ────────────────────────────
// Flow:
//  1. Fetch practitioner's base_lat/base_lng from DB (the practitioner's location anchor)
//  2. Compute a midpoint between practitioner and customer (if customer coords provided)
//     - or use just the practitioner's location as the search center
//  3. Call Google Places Nearby Search → return curated list of places
//  4. Frontend shows these on a map → customer picks one → place_id flows into APT-001 body

export const getNearbySuggestions = async (req, res) => {
    try {
        if (!GOOGLE_MAPS_API_KEY) {
            return res.status(503).json({ error: 'Google Maps API key is not configured on the server.' });
        }

        const { slug, customer_pincode, type = 'cafe', radius = 2000 } = req.query;

        if (!slug) {
            return res.status(400).json({ error: 'practitioner slug is required (?slug=alex-practitioner)' });
        }

        // 1. Fetch the practitioner's base coordinates from the DB
        const { data: practitioner, error: practErr } = await supabase
            .from('practitioners')
            .select('name, base_lat, base_lng, base_address, pincode')
            .eq('slug', slug)
            .single();

        if (practErr || !practitioner) {
            return res.status(404).json({ error: 'Practitioner not found.' });
        }

        if (!practitioner.base_lat || !practitioner.base_lng) {
            return res.status(422).json({
                error: 'Practitioner has not set their base location yet. Ask them to update their profile with base_lat and base_lng.'
            });
        }

        // 2. Compute midpoint between practitioner and customer (if customer coords given)
        //    Otherwise just use the practitioner's base as search center
        let searchLat = practitioner.base_lat;
        let searchLng = practitioner.base_lng;

        if (customer_pincode) {
            try {
                // We append ", India" to help the geocoder since "Pincode" usually implies India.
                const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(customer_pincode + ', India')}&key=${GOOGLE_MAPS_API_KEY}`;
                const geoRes = await fetch(geoUrl);
                const geoData = await geoRes.json();

                if (geoData.status === 'OK' && geoData.results.length > 0) {
                    const custLat = geoData.results[0].geometry.location.lat;
                    const custLng = geoData.results[0].geometry.location.lng;

                    // Simple midpoint — close enough for nearby search radius purposes
                    searchLat = (practitioner.base_lat + custLat) / 2;
                    searchLng = (practitioner.base_lng + custLng) / 2;
                } else {
                    console.warn(`Could not geocode pincode: ${customer_pincode}, fallback to practitioner base location.`);
                }
            } catch (geoErr) {
                console.error('Error geocoding pincode:', geoErr);
                // fallback to practitioner base location on error
            }
        }

        // 3. Call Google Places API (New) — Nearby Search
        // Uses POST + JSON body, not the legacy URL query-string format
        const googleUrl = `https://places.googleapis.com/v1/places:searchNearby`;

        const requestBody = {
            includedTypes: [type],
            maxResultCount: 10,
            locationRestriction: {
                circle: {
                    center: {
                        latitude: searchLat,
                        longitude: searchLng,
                    },
                    radius: parseFloat(radius),
                }
            }
        };

        const googleRes = await fetch(googleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
                // Tell the new API which fields to return (billing is per field group)
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id,places.rating,places.userRatingCount,places.currentOpeningHours,places.types',
            },
            body: JSON.stringify(requestBody),
        });

        const googleData = await googleRes.json();

        if (!googleRes.ok) {
            console.error('Google Places API (New) error:', googleData);
            return res.status(502).json({ error: `Google Places API error: ${googleData?.error?.message || googleRes.status}` });
        }

        // 4. Shape the response — new API returns different field names
        const suggestions = (googleData.places || []).map((place) => ({
            name: place.displayName?.text || place.displayName,
            address: place.formattedAddress,
            lat: place.location?.latitude,
            lng: place.location?.longitude,
            place_id: place.id,          // ← this is what goes into APT-001 meeting_location.place_id
            rating: place.rating || null,
            user_ratings_total: place.userRatingCount || 0,
            open_now: place.currentOpeningHours?.openNow ?? null,
            types: place.types || [],
        }));

        res.status(200).json({
            search_center: { lat: searchLat, lng: searchLng },
            practitioner: {
                name: practitioner.name,
                base_lat: practitioner.base_lat,
                base_lng: practitioner.base_lng,
                base_address: practitioner.base_address,
                pincode: practitioner.pincode,
            },
            radius_m: parseInt(radius),
            type,
            suggestions,
        });

    } catch (err) {
        console.error('getNearbySuggestions error:', err);
        res.status(500).json({ error: 'Failed to fetch nearby suggestions' });
    }
};
