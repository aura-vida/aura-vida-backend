import {
    getSeoPractitioner,
    getSeoPractitionersByModalityCity,
    renderProfileServerHtml,
    buildDynamicSitemapXml,
} from '../models/seo.model.js';

const BOT_USER_AGENTS = [
    'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp',
    'baiduspider', 'twitterbot', 'facebookexternalhit', 'rogerbot',
    'linkedinbot', 'embedly', 'quora link preview', 'showyoubot',
    'outbrain', 'pinterest/0.', 'developers.google.com/+/web/snippet',
    'slackbot', 'vkshare', 'w3c_validator', 'redditbot', 'applebot',
    'whatsapp', 'flipboard', 'tumblr', 'bitlybot', 'skypeuripreview',
    'nuzzel', 'discordbot', 'google page speed', 'qwantify',
];

/**
 * GET /api/seo/profile/:modality/:city/:slug
 * Resolves a single practitioner profile by modality, city, and slug.
 * If ?format=html or requested by a bot, returns pre-rendered SSR HTML.
 */
export const getPractitionerProfile = async (req, res) => {
    try {
        const { modality, city, slug } = req.params;
        const result = await getSeoPractitioner(modality, city, slug);

        if (!result) {
            return res.status(404).json({ error: 'Practitioner profile not found' });
        }

        const userAgent = (req.get('user-agent') || '').toLowerCase();
        const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
        const wantsHtml = req.query.format === 'html' || req.query.html === 'true' || isBot;

        if (wantsHtml) {
            const html = renderProfileServerHtml(result);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
        }

        res.status(200).json(result);
    } catch (err) {
        console.error('getPractitionerProfile error:', err);
        res.status(500).json({ error: 'Failed to resolve practitioner SEO profile' });
    }
};

/**
 * GET /api/seo/listing/:modality/:city
 * Returns all active practitioners for a given craft and city.
 */
export const getModalityCityListing = async (req, res) => {
    try {
        const { modality, city } = req.params;
        const result = await getSeoPractitionersByModalityCity(modality, city);

        if (!result || result.practitioners.length === 0) {
            return res.status(404).json({ error: `No active ${modality} practitioners found in ${city}` });
        }

        res.status(200).json(result);
    } catch (err) {
        console.error('getModalityCityListing error:', err);
        res.status(500).json({ error: 'Failed to resolve modality listing' });
    }
};

/**
 * GET /sitemap.xml
 * Returns valid, dynamically generated XML sitemap.
 */
export const getSitemap = async (req, res) => {
    try {
        const xml = await buildDynamicSitemapXml();
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.status(200).send(xml);
    } catch (err) {
        console.error('getSitemap error:', err);
        res.status(500).send('<!-- Failed to generate sitemap -->');
    }
};
