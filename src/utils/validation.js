// Strips everything except digits — the format WhatsApp's click-to-chat
// (wa.me) URLs require: country code + number, no "+", spaces or dashes.
export const toWhatsappDigits = (value) => String(value || '').replace(/\D/g, '');

/**
 * Loose phone-number validation: after stripping non-digits, the value must
 * be between 10 (a bare local number) and 15 (full E.164 with country code)
 * digits long. Good enough to catch typos/garbage without being a specific
 * country's strict format.
 */
export const isValidPhoneNumber = (value) => {
    const digits = toWhatsappDigits(value);
    return digits.length >= 10 && digits.length <= 15;
};
