import nodemailer from 'nodemailer';

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
        const info = await mailTransporter.sendMail({
            from: '"Aura Vida" <hello@auravida.com>', // sender address
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
