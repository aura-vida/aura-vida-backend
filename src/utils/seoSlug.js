/**
 * SEO URL Normalization and Slug Utilities for Kusala
 */

/**
 * Normalizes any text into a URL-friendly slug.
 * "Sound Healing & Breathwork" -> "sound-healing-breathwork"
 * "Vandana Melwani" -> "vandana-melwani"
 * "Mumbai" -> "mumbai"
 */
export const toSlug = (str) => {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .trim()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

/**
 * Strips the trailing timestamp ID from a practitioner slug if present.
 * "vandana-melwani-1792147308873" -> "vandana-melwani"
 * "john-doe" -> "john-doe"
 */
export const cleanPractitionerSlug = (slug) => {
    if (!slug) return '';
    return String(slug).replace(/-\d{10,}$/, '').trim();
};

/**
 * Checks whether a practitioner's craft matches a requested modality slug.
 * E.g. modality="tarot" matches craft="Tarot" or craft="Astrology & Tarot".
 */
export const craftMatchesModality = (craft, modalitySlug) => {
    if (!craft || !modalitySlug) return false;
    const craftSlug = toSlug(craft);
    const target = toSlug(modalitySlug);
    if (craftSlug === target) return true;
    if (craftSlug.includes(target) || target.includes(craftSlug)) return true;

    // Check individual words
    const words = craft.toLowerCase().split(/[\s,&/]+/);
    return words.some(w => {
        const wordSlug = toSlug(w);
        return wordSlug && (target.includes(wordSlug) || wordSlug.includes(target));
    });
};

/**
 * Checks whether a practitioner's city matches a requested city slug.
 */
export const cityMatches = (city, citySlug) => {
    if (!city || !citySlug) return false;
    const c1 = toSlug(city);
    const c2 = toSlug(citySlug);
    return c1 === c2 || c1.includes(c2) || c2.includes(c1);
};

/**
 * Checks whether a practitioner's slug or name matches a requested practitioner slug.
 */
export const practitionerMatchesSlug = (practitioner, slug) => {
    if (!practitioner || !slug) return false;
    const target = toSlug(slug);
    const rawSlug = toSlug(practitioner.slug);
    const cleanSlug = toSlug(cleanPractitionerSlug(practitioner.slug));
    const nameSlug = toSlug(practitioner.name);

    return rawSlug === target || cleanSlug === target || nameSlug === target;
};

/**
 * Generates the canonical SEO path for a practitioner:
 * /{modality}/{city}/{practitioner-slug}
 */
export const getPractitionerCanonicalPath = (practitioner) => {
    const rawCraft = practitioner.craft || 'healing';
    // Use first primary modality if multiple words, e.g. "Astrology & Tarot" -> "tarot" or "astrology-and-tarot"
    const modality = toSlug(rawCraft);
    const city = toSlug(practitioner.city || 'mumbai');
    const slug = cleanPractitionerSlug(practitioner.slug || practitioner.name);
    return `/${modality}/${city}/${slug}`;
};
