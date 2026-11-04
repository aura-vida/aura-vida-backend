import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Global transporter instance.
 */
let transporter = null;

/**
 * Initializes the Nodemailer transporter.
 * Uses real SMTP credentials if provided in process.env,
 * otherwise creates an Ethereal (fake SMTP) account for development testing.
 */
const initTransporter = async () => {
    if (transporter) return transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        // Use real SMTP transport (e.g. SendGrid, Mailgun, AWS SES)
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        console.log('✅ [EMAIL SERVICE] Using real SMTP transport');
    } else {
        // Use Ethereal fake SMTP for development testing
        console.log('⚠️ [EMAIL SERVICE] Real SMTP credentials not found. Generating Ethereal test account...');
        const testAccount = await nodemailer.createTestAccount();

        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        console.log('✅ [EMAIL SERVICE] Ethereal test account generated and ready to send mock emails.');
    }

    return transporter;
};

/**
 * Sends an email using the configured transporter.
 * If using Ethereal email, it logs the Preview URL to the console.
 * 
 * @param {Object} options 
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Subject line
 * @param {string} options.html - HTML body
 */
export const sendEmail = async ({ to, subject, html }) => {
    try {
        const mailTransporter = await initTransporter();
        const senderFrom = process.env.SMTP_FROM || (process.env.SMTP_USER ? `"Kusala" <${process.env.SMTP_USER}>` : '"Kusala" <hello@auravida.com>');
        const info = await mailTransporter.sendMail({
            from: senderFrom, // sender address
            to: Array.isArray(to) ? to.join(', ') : to, // list of receivers
            subject,
            html,
        });

        console.log(`✅ [EMAIL SERVICE] Message sent: ${info.messageId}`);

        // Ethereal specific checking
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log(`\n\n📫 -----------------------------------------------`);
            console.log(`📫 [ETHERAL EMAIL TEST] Preview your email at:`);
            console.log(`📫 ${previewUrl}`);
            console.log(`📫 -----------------------------------------------\n\n`);
        }

        return info;
    } catch (error) {
        console.error('❌ [EMAIL SERVICE] Error sending email:', error.message);
        return null;
    }
};

/**
 * Sends a slot reservation confirmation email to a partner space host.
 */
export const sendSpaceReservationEmail = async ({ to, spaceName, date, startTime, endTime, reason }) => {
    const subject = `[Aura Vida] Slot Reservation Confirmed – ${spaceName}`;
    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 20px; color: #1e293b; background-color: #f8fafc;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Aura Vida</h1>
                <p style="color: #0d9488; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Sanctuary Slot Reservation</p>
            </div>

            <div style="background-color: #ffffff; padding: 28px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <h2 style="font-size: 18px; color: #0f172a; margin-top: 0; font-weight: 600;">Dear Sanctuary Host,</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 12px 0 20px;">
                    This is an automated notification confirming that a time slot has been reserved / packed for upcoming Aura Vida wellness sessions at your space.
                </p>

                <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 18px 20px; border-radius: 8px; margin: 20px 0;">
                    <div style="margin-bottom: 8px;">
                        <span style="color: #0f766e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Sanctuary</span>
                        <div style="color: #0f172a; font-size: 15px; font-weight: 600;">${spaceName}</div>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #0f766e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Date</span>
                        <div style="color: #0f172a; font-size: 15px; font-weight: 600;">${date}</div>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <span style="color: #0f766e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Reserved Hours</span>
                        <div style="color: #0f172a; font-size: 15px; font-weight: 600;">${startTime} – ${endTime}</div>
                    </div>
                    ${reason ? `
                    <div>
                        <span style="color: #0f766e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Purpose / Notes</span>
                        <div style="color: #0f172a; font-size: 14px;">${reason}</div>
                    </div>` : ''}
                </div>

                <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 20px;">
                    This slot is now locked in our system. Please ensure the room/space is prepared for practitioner arrival. If you have any scheduling inquiries, reply directly to this email or reach us at hello@auravida.com.
                </p>
            </div>

            <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Aura Vida. All rights reserved.
            </div>
        </div>
    `;

    return sendEmail({ to, subject, html });
};
