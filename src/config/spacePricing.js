/**
 * spacePricing.js
 * Authoritative space pricing config and calculation for partner spaces.
 * Keep in sync with src/lib/pricing.ts (frontend mirrors this for display only).
 *
 * Supported partner spaces:
 *   - 'hour_space' : Day-dependent (Mon-Sat vs Sun), slab by client count
 *   - 'eclipse'    : All days, slab by participant count (<= 5: ₹1500, > 5: ₹3000)
 *   - 'bohemiso'   : All days, ₹1500/hr
 */

export const SPACE_GST_RATE = 0.18;

// ─── Pricing Tables ───────────────────────────────────────────────────────────

const HOUR_SPACE_PRICING = {
  weekday: [
    { max_clients: 2, rate: 825 },         // 1–2 clients + 1 practitioner
    { max_clients: 4, rate: 1100 },        // 3–4 clients + 1 practitioner
    { max_clients: Infinity, rate: 1485 }, // More than 4 clients + 1 practitioner
  ],
  sunday: [
    { max_clients: 2, rate: 1100 },
    { max_clients: 4, rate: 1485 },
    { max_clients: Infinity, rate: 1650 },
  ],
};

const ECLIPSE_PRICING = [
  { max_persons: 5, rate: 1500 },          // 1–5 persons + practitioner
  { max_persons: Infinity, rate: 3000 },   // 6–20 persons
];

const BOHEMISO_PRICING = [
  { max_persons: Infinity, rate: 1500 },   // 1–20 persons
];

function resolveSlab(slabs, count) {
  for (const slab of slabs) {
    const limit = slab.max_clients ?? slab.max_persons ?? Infinity;
    if (count <= limit) {
      return slab.rate;
    }
  }
  return slabs[slabs.length - 1].rate;
}

/**
 * Identify canonical space key from space_type or space_name.
 */
export function identifySpaceCategory(spaceType, spaceName) {
  const combined = `${spaceType || ''} ${spaceName || ''}`.toLowerCase();
  if (combined.includes('hour')) return 'hour_space';
  if (combined.includes('eclipse')) return 'eclipse';
  if (combined.includes('bohemiso')) return 'bohemiso';
  return null;
}

/**
 * Calculate space fee for a partner space booking.
 *
 * @param {string}  spaceType       - space_type or identified key ('hour_space' | 'eclipse' | 'bohemiso')
 * @param {string}  spaceName       - space_name (optional fallback for identification)
 * @param {number}  participantCount - number of client participants
 * @param {string}  bookingDate     - ISO date string 'YYYY-MM-DD' (IST)
 * @param {number}  durationHours   - number of booked hours (must be >= 1)
 */
export function calculateSpaceFee(spaceType, spaceName, participantCount, bookingDate, durationHours) {
  const category = identifySpaceCategory(spaceType, spaceName);
  const hours = Math.max(1, Math.round(durationHours || 1));
  const count = Math.max(1, Math.round(participantCount || 1));

  if (!category) {
    return null;
  }

  let hourlyRate = 0;
  let dayType = null;

  if (category === 'hour_space') {
    const [y, m, d] = (bookingDate || '').split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon..6=Sat
    dayType = dayOfWeek === 0 ? 'sunday' : 'weekday';

    hourlyRate = resolveSlab(HOUR_SPACE_PRICING[dayType], count);
  } else if (category === 'eclipse') {
    hourlyRate = resolveSlab(ECLIPSE_PRICING, count);
  } else if (category === 'bohemiso') {
    hourlyRate = resolveSlab(BOHEMISO_PRICING, count);
  }

  const spaceSubtotal = hourlyRate * hours;
  const gstAmount = Math.round(spaceSubtotal * SPACE_GST_RATE);
  const totalSpaceCost = spaceSubtotal + gstAmount;

  return {
    spaceType: category,
    hourlyRate,
    durationHours: hours,
    spaceSubtotal,
    gstPercent: 18,
    gstAmount,
    totalSpaceCost,
    pricingSnapshot: {
      spaceCategory: category,
      dayType,
      participantCount: count,
      hourlyRate,
      durationHours: hours,
      spaceSubtotal,
      gstPercent: 18,
      gstAmount,
      totalSpaceCost,
      capturedAt: new Date().toISOString(),
    },
  };
}
