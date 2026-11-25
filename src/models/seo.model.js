import { supabase } from '../config/supabase.js';
import {
    toSlug,
    cleanPractitionerSlug,
    craftMatchesModality,
    cityMatches,
    practitionerMatchesSlug,
    getPractitionerCanonicalPath,
} from '../utils/seoSlug.js';

const SITE_URL = 'https://www.kusala.in';

/**
 * Generates Schema.org Person JSON-LD for a practitioner.
 */
export const buildPersonJsonLd = (practitioner, canonicalUrl) => {
    const jobTitle = practitioner.craft || 'Holistic Practitioner';
    const city = practitioner.city || 'Mumbai';

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: practitioner.name,
        jobTitle: `${jobTitle} in ${city}`,
        url: canonicalUrl,
        image: practitioner.image_url || undefined,
        worksFor: {
            '@type': 'Organization',
            name: 'Kusala',
            url: SITE_URL,
        },
        knowsAbout: practitioner.craft || undefined,
        description: practitioner.bio ? practitioner.bio.slice(0, 200).trim() + '...' : undefined,
    };

    if (practitioner.price_inr && Number(practitioner.price_inr) > 0) {
        schema.makesOffer = {
            '@type': 'Offer',
            price: Number(practitioner.price_inr),
            priceCurrency: 'INR',
            availability: practitioner.bookable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: `${SITE_URL}/book?practitioner=${encodeURIComponent(practitioner.slug)}`,
        };
    }

    return schema;
};

/**
 * Resolves a practitioner for the SEO route /{modality}/{city}/{practitionerSlug}
 */
export const getSeoPractitioner = async (modalitySlug, citySlug, practitionerSlug) => {
    // 1. Fetch published practitioners
    const { data: practitioners, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_published', true);

    if (error) throw error;
    if (!practitioners || practitioners.length === 0) return null;

    // 2. Find matching practitioner by slug/name first
    let match = practitioners.find(p => practitionerMatchesSlug(p, practitionerSlug));

    // Fallback: match by name words if slug has partial match
    if (!match) {
        const targetClean = toSlug(cleanPractitionerSlug(practitionerSlug));
        match = practitioners.find(p => {
            const pClean = toSlug(cleanPractitionerSlug(p.slug));
            return pClean.includes(targetClean) || targetClean.includes(pClean);
        });
    }

    if (!match) return null;

    // Check craft / city validation or alignment
    const canonicalModality = toSlug(match.craft || modalitySlug);
    const canonicalCity = toSlug(match.city || citySlug);
    const cleanSlug = cleanPractitionerSlug(match.slug);

    const canonicalPath = `/${canonicalModality}/${canonicalCity}/${cleanSlug}`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;

    // 3. Fetch their services
    let services = [];
    try {
        const { data: serviceData } = await supabase
            .from('services')
            .select('*')
            .eq('practitioner_id', match.id)
            .eq('is_active', true);
        if (serviceData) services = serviceData;
    } catch (_) {}

    // 4. Generate SEO Metadata
    const craftLabel = match.craft || 'Healing';
    const cityLabel = match.city || 'Mumbai';
    const name = match.name;

    // Title formula: [Modality] in [City] with [Practitioner Name] | Kusala
    let title = `${craftLabel} in ${cityLabel} with ${name} | Kusala`;
    if (title.length > 65) {
        title = `${craftLabel} with ${name} | Kusala`;
    }

    // Description formula: under 155 chars
    let description = `Book a ${craftLabel.toLowerCase()} session with ${name} in ${cityLabel}.`;
    if (match.bio) {
        const cleanBio = match.bio.replace(/[\r\n]+/g, ' ').trim();
        const snippet = cleanBio.slice(0, 110).trim();
        description = `${description} ${snippet}...`;
    }
    if (description.length > 155) {
        description = description.slice(0, 152) + '...';
    }

    const jsonLd = buildPersonJsonLd(match, canonicalUrl);

    return {
        practitioner: match,
        services,
        seo: {
            title,
            description,
            canonicalUrl,
            canonicalPath,
            ogImage: match.image_url || `${SITE_URL}/og-image.jpg`,
            bookingUrl: `/book?practitioner=${encodeURIComponent(match.slug)}`,
            jsonLd,
            robots: 'index, follow',
        },
    };
};

/**
 * Returns all active practitioners for a given modality and city: /{modality}/{city}
 */
export const getSeoPractitionersByModalityCity = async (modalitySlug, citySlug) => {
    const { data: practitioners, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

    if (error) throw error;
    if (!practitioners) return { practitioners: [], seo: null };

    // Filter matching modality & city
    const filtered = practitioners.filter(p => {
        const matchesCraft = craftMatchesModality(p.craft, modalitySlug);
        const matchesLocation = cityMatches(p.city, citySlug) || p.offers_online;
        return matchesCraft && matchesLocation;
    });

    if (filtered.length === 0) return { practitioners: [], seo: null };

    // Capitalize titles nicely
    const formatWord = (s) => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const modalityName = formatWord(modalitySlug);
    const cityName = formatWord(citySlug);

    const canonicalPath = `/${toSlug(modalitySlug)}/${toSlug(citySlug)}`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;

    const title = `${modalityName} Practitioners in ${cityName} | Kusala`;
    const description = `Find and book certified ${modalityName.toLowerCase()} practitioners in ${cityName}. Compare session formats, pricing, and book online.`;

    const mappedPractitioners = filtered.map(p => ({
        ...p,
        profile_url: `/${toSlug(modalitySlug)}/${toSlug(citySlug)}/${cleanPractitionerSlug(p.slug)}`,
        booking_url: `/book?practitioner=${encodeURIComponent(p.slug)}`,
    }));

    return {
        practitioners: mappedPractitioners,
        seo: {
            title,
            description,
            canonicalUrl,
            canonicalPath,
            h1: `${modalityName} Practitioners in ${cityName}`,
            robots: 'index, follow',
        },
    };
};

/**
 * Renders complete initial semantic HTML with OpenGraph and JSON-LD for crawlers/bots.
 */
export const renderProfileServerHtml = (data) => {
    const { practitioner, services, seo } = data;
    const craft = practitioner.craft || 'Healing';
    const city = practitioner.city || 'Mumbai';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${seo.title}</title>
  <meta name="description" content="${seo.description}" />
  <meta name="robots" content="${seo.robots}" />
  <link rel="canonical" href="${seo.canonicalUrl}" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${seo.canonicalUrl}" />
  <meta property="og:title" content="${seo.title}" />
  <meta property="og:description" content="${seo.description}" />
  <meta property="og:image" content="${seo.ogImage}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${seo.title}" />
  <meta name="twitter:description" content="${seo.description}" />
  <meta name="twitter:image" content="${seo.ogImage}" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(seo.jsonLd, null, 2)}
  </script>

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1c1917; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 2.2rem; color: #14532d; margin-bottom: 0.5rem; }
    .meta { color: #78716c; font-size: 0.95rem; margin-bottom: 1.5rem; }
    .bio { margin-bottom: 2rem; font-size: 1.05rem; }
    .btn { display: inline-block; background: #15803d; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; }
    .service-card { border: 1px solid #e7e5e4; padding: 16px; border-radius: 12px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <header>
    <div class="meta">${craft} Guide &bull; ${city}</div>
    <h1>${practitioner.name}, ${craft} in ${city}</h1>
  </header>

  <main>
    <div class="bio">
      <p>Book an authentic ${craft.toLowerCase()} session with <strong>${practitioner.name}</strong> in <strong>${city}</strong> on Kuśala.</p>
      ${practitioner.bio ? `<p>${practitioner.bio.replace(/[\r\n]+/g, '<br/>')}</p>` : ''}
    </div>

    <div style="margin: 24px 0;">
      <a href="${seo.bookingUrl}" class="btn">Book a Session with ${practitioner.name.split(' ')[0]}</a>
    </div>

    ${services && services.length > 0 ? `
    <h2>Curated Sessions & Offerings</h2>
    <div>
      ${services.map(s => `
        <div class="service-card">
          <h3>${s.name} (${s.duration_minutes || 60} mins)</h3>
          <p>${s.description || ''}</p>
          <p><strong>Fee:</strong> ₹${s.price_inr}</p>
          <a href="${seo.bookingUrl}" class="btn" style="padding: 6px 16px; font-size: 0.9rem;">Book This Service</a>
        </div>
      `).join('')}
    </div>
    ` : ''}
  </main>
</body>
</html>`;
};

/**
 * Builds the complete dynamic sitemap XML.
 */
export const buildDynamicSitemapXml = async () => {
    const { data: practitioners, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_published', true);

    if (error) throw error;

    const staticUrls = [
        { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
        { loc: `${SITE_URL}/spaces`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${SITE_URL}/values`, priority: '0.6', changefreq: 'monthly' },
        { loc: `${SITE_URL}/journal`, priority: '0.8', changefreq: 'daily' },
    ];

    const listingUrlsSet = new Set();
    const profileUrls = [];

    (practitioners || []).forEach(p => {
        if (!p.craft || !p.city) return;
        const modSlug = toSlug(p.craft);
        const citySlug = toSlug(p.city);
        const cleanSlug = cleanPractitionerSlug(p.slug);

        // Add listing URL
        listingUrlsSet.add(`${SITE_URL}/${modSlug}/${citySlug}`);

        // Add profile URL
        profileUrls.push({
            loc: `${SITE_URL}/${modSlug}/${citySlug}/${cleanSlug}`,
            priority: '0.9',
            changefreq: 'weekly',
            lastmod: p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : undefined,
        });
    });

    const listingUrls = Array.from(listingUrlsSet).map(url => ({
        loc: url,
        priority: '0.8',
        changefreq: 'weekly',
    }));

    const allUrls = [...staticUrls, ...listingUrls, ...profileUrls];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const u of allUrls) {
        xml += `  <url>\n`;
        xml += `    <loc>${u.loc}</loc>\n`;
        if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
        if (u.changefreq) xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
        if (u.priority) xml += `    <priority>${u.priority}</priority>\n`;
        xml += `  </url>\n`;
    }

    xml += `</urlset>`;
    return xml;
};
