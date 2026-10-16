// Re-sends the practitioner welcome email (magic link, temp password, reset
// link) with EXPLICIT deployed URLs, for practitioners whose original email
// went out with localhost links (created while the local backend's
// SITE_URL env var was still unset/localhost).
//
// A fresh temp password is generated and actually set on their Supabase Auth
// account — the original one from their first email can't be recovered
// (it was only ever shown once), so resending the same old email isn't
// possible; this issues a new one and invalidates the old one in the process.
//
// Run with: node scripts/resend_practitioner_welcome_email.js <email> [<email2> ...]
import 'dotenv/config';
import crypto from 'crypto';
import { supabase } from '../src/config/supabase.js';
import { sendEmail } from '../src/services/email.service.js';

const DEPLOYED_SITE_URL = 'https://aura-vida-frontend.vercel.app';

const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const generateTempPassword = () => {
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += TEMP_PASSWORD_CHARS[crypto.randomInt(TEMP_PASSWORD_CHARS.length)];
    return `${pwd}!`;
};

const resendWelcomeEmail = async (email) => {
    const normalizedEmail = email.trim().toLowerCase();

    const { data: practitioner, error: pracErr } = await supabase
        .from('practitioners')
        .select('name, application_email')
        .ilike('application_email', normalizedEmail)
        .maybeSingle();
    if (pracErr) throw pracErr;
    if (!practitioner) {
        console.log(`❌ No practitioner found with email ${normalizedEmail} — skipping.`);
        return;
    }

    const { data: userList, error: userErr } = await supabase.auth.admin.listUsers();
    if (userErr) throw userErr;
    const authUser = userList.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (!authUser) {
        console.log(`❌ No Supabase Auth account found for ${normalizedEmail} — skipping.`);
        return;
    }

    // Issue a brand new temp password (the original can't be recovered).
    const tempPassword = generateTempPassword();
    const { error: pwErr } = await supabase.auth.admin.updateUserById(authUser.id, { password: tempPassword });
    if (pwErr) throw pwErr;

    // Fresh magic link, pointed at the deployed frontend's /magic-login page.
    let magicLinkUrl = null;
    const { data: magicData, error: magicErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
    });
    if (!magicErr && magicData?.properties?.hashed_token) {
        magicLinkUrl = `${DEPLOYED_SITE_URL}/magic-login?token_hash=${magicData.properties.hashed_token}&redirect=/practitioner`;
    } else {
        console.error('Failed to generate magic link:', magicErr?.message);
    }

    // Reset-password link — same deferred pattern as the real flow, pointed
    // at the deployed frontend's forgot-password form.
    const resetUrl = `${DEPLOYED_SITE_URL}/auth?view=forgot&email=${encodeURIComponent(normalizedEmail)}`;

    const name = practitioner.name;
    const emailResult = await sendEmail({
        to: normalizedEmail,
        subject: 'Your Kusala Practitioner account is ready',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;border-radius:16px;border:1px solid #e5e7eb;">
            <h1 style="font-size:22px;color:#1a5c38;margin-bottom:4px;">Welcome to Kusala, ${name}</h1>
            <p style="color:#555;margin-top:0;">An account has been created for you on the Kusala Guide Portal.</p>
            ${magicLinkUrl ? `
            <a href="${magicLinkUrl}" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#1a5c38;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">Log In Instantly</a>
            <p style="color:#888;font-size:12px;margin:10px 0 0;">One-click login, no password needed. This link can only be used once.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            ` : ''}
            <p style="color:#555;">Prefer to log in manually? Use this temporary password:</p>
            <div style="background:#f3f7f4;border-radius:12px;padding:16px 20px;margin:12px 0 20px;">
              <p style="margin:0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Email</p>
              <p style="margin:4px 0 12px;font-size:15px;color:#111;">${normalizedEmail}</p>
              <p style="margin:0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
              <p style="margin:4px 0 0;font-size:18px;font-family:monospace;font-weight:700;color:#111;letter-spacing:0.03em;">${tempPassword}</p>
            </div>
            <p style="color:#555;">For security, please set your own password as soon as you log in.</p>
            <a href="${resetUrl}" style="display:inline-block;margin-top:8px;padding:12px 28px;background:#fff;color:#1a5c38;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;border:1.5px solid #1a5c38;">Reset Your Password</a>
            <p style="color:#888;font-size:12px;margin:10px 0 0;">Takes you to a form to request a reset link by email.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">
            <p style="font-size:12px;color:#aaa;">Kusala &bull; Questions? Reply to this email or visit auravida.com</p>
          </div>
        `,
    });

    console.log(emailResult
        ? `✅ Resent welcome email to ${normalizedEmail} (${name}) with deployed URLs`
        : `❌ FAILED to send welcome email to ${normalizedEmail} (${name})`);
};

const emails = process.argv.slice(2);
if (emails.length === 0) {
    console.error('Usage: node scripts/resend_practitioner_welcome_email.js <email> [<email2> ...]');
    process.exit(1);
}

(async () => {
    for (const email of emails) {
        try {
            await resendWelcomeEmail(email);
        } catch (err) {
            console.error(`❌ Error processing ${email}:`, err.message);
        }
    }
})();
