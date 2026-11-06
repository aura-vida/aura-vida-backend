import nodemailer from 'nodemailer';
import { supabase } from '../config/supabase.js';

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
        const fromAddress = process.env.SMTP_FROM || (process.env.SMTP_USER ? `"Kusala" <${process.env.SMTP_USER}>` : '"Kusala" <hello@kusala.in>');
        const info = await mailTransporter.sendMail({
            from: fromAddress, // sender address
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

/**
 * Sends notification emails to both customer (and group attendees) and practitioner
 * when an appointment is rescheduled with updated dates and details.
 */
export const sendAppointmentRescheduledEmails = async ({
    booking,
    previousScheduledAt,
    newScheduledAt,
}) => {
    try {
        if (!booking) return;

        // 1. Resolve Service Name
        let serviceName = 'Kuśala Holistic Session';
        if (booking.item_id) {
            try {
                const { getServiceById } = await import('../models/service.model.js');
                const svc = await getServiceById(booking.item_id);
                if (svc?.name) serviceName = svc.name;
            } catch (_) {}
        }

        // 2. Format Dates in IST
        const formatDateIST = (iso) => {
            if (!iso) return 'Not specified';
            try {
                return new Date(iso).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                });
            } catch {
                return String(iso);
            }
        };

        const formatDateShortIST = (iso) => {
            if (!iso) return '';
            try {
                return new Date(iso).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                });
            } catch {
                return '';
            }
        };

        const newDateFormatted = formatDateIST(newScheduledAt);
        const oldDateFormatted = formatDateIST(previousScheduledAt);
        const newDateShort = formatDateShortIST(newScheduledAt);

        // 3. Mode & Meeting Link / Address
        const isOnline = booking?.mode === 'online';
        const meetLink = booking?.meeting_location?.meet_link;
        const modeLabel = isOnline
            ? 'Online Video Session'
            : booking?.mode === 'studio'
            ? "At Practitioner's Studio"
            : booking?.mode === 'centre'
            ? 'At Sanctuary / Centre'
            : booking?.mode === 'host'
            ? 'In-Person (Host Location)'
            : 'In-Person Session';

        let locationDisplay = '';
        if (isOnline) {
            locationDisplay = meetLink
                ? `<div style="margin: 16px 0; text-align: center;">
                    <a href="${meetLink}" style="display:inline-block;background:#1a5c38;color:#ffffff;padding:12px 28px;border-radius:9999px;font-weight:600;font-size:14px;text-decoration:none;">🎥 Join Online Video Session</a>
                    <p style="margin-top:8px;font-size:12px;color:#64748b;word-break:break-all;">${meetLink}</p>
                   </div>`
                : '<p style="color:#64748b;font-size:13px;margin:8px 0 0;">Google Meet / Jitsi link will be available in your account before the session.</p>';
        } else if (booking?.meeting_location?.address) {
            locationDisplay = `
                <div style="background:#f1f5f9;padding:12px 16px;border-radius:8px;margin-top:8px;">
                    <span style="font-weight:600;color:#0f172a;font-size:13px;">Address:</span>
                    <p style="margin:4px 0 0;color:#334155;font-size:13px;">${booking.meeting_location.address}${booking.meeting_location.pincode ? `, ${booking.meeting_location.pincode}` : ''}</p>
                </div>
            `;
        }

        // 4. Resolve Client Information
        let clientEmail = null;
        let clientName = booking.client_name || 'Guest';

        if (booking.client_id) {
            const { data: prof } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', booking.client_id)
                .maybeSingle();

            if (prof?.full_name) clientName = prof.full_name;

            try {
                const { data: authData } = await supabase.auth.admin.getUserById(booking.client_id);
                if (authData?.user?.email) clientEmail = authData.user.email;
                if (authData?.user?.user_metadata?.full_name && clientName === 'Guest') {
                    clientName = authData.user.user_metadata.full_name;
                }
            } catch (_) {}
        }

        if (!clientEmail && booking.id) {
            const { data: orderRow } = await supabase
                .from('orders')
                .select('customer_email, customer_name')
                .eq('booking_id', booking.id)
                .maybeSingle();
            if (orderRow?.customer_email) clientEmail = orderRow.customer_email;
            if (orderRow?.customer_name && clientName === 'Guest') clientName = orderRow.customer_name;
        }

        // Attendees (group support)
        const rawAttendees = Array.isArray(booking?.attendees) ? booking.attendees : [];
        const normalizedAttendees = rawAttendees.map(a => {
            if (typeof a === 'string') {
                if (a.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(a);
                        return { name: parsed.name || '', email: parsed.email || null };
                    } catch (_) {}
                }
                return { name: a, email: a.includes('@') && !a.includes('{') ? a.trim() : null };
            }
            if (a && typeof a === 'object') return { name: a.name || '', email: a.email || null };
            return null;
        }).filter(a => a && a.email);

        const seenEmails = new Set(clientEmail ? [clientEmail.toLowerCase()] : []);
        const clientRecipients = [
            ...(clientEmail ? [{ name: clientName, email: clientEmail }] : []),
            ...normalizedAttendees.filter(a => {
                const lc = a.email.toLowerCase();
                if (seenEmails.has(lc)) return false;
                seenEmails.add(lc);
                return true;
            }),
        ];

        // 5. Resolve Practitioner Information
        let pracEmail = null;
        let pracName = booking.practitioner_name || 'Healer';

        // Normalize slug: fix common typos like "practitionner" -> "practitioner"
        const rawSlug = (booking.practitioner_slug || '').trim();
        const normalizedSlug = rawSlug.toLowerCase().replace(/practition+er/, 'practitioner');

        // Step A: Check `practitioners` table for application_email
        if (normalizedSlug || rawSlug) {
            let { data: pracRow } = await supabase
                .from('practitioners')
                .select('id, name, slug, application_email')
                .eq('slug', normalizedSlug || rawSlug)
                .maybeSingle();

            if (!pracRow && rawSlug && rawSlug !== normalizedSlug) {
                const res = await supabase
                    .from('practitioners')
                    .select('id, name, slug, application_email')
                    .eq('slug', rawSlug)
                    .maybeSingle();
                pracRow = res.data;
            }

            if (!pracRow && booking.practitioner_name) {
                const res = await supabase
                    .from('practitioners')
                    .select('id, name, slug, application_email')
                    .ilike('name', booking.practitioner_name.trim())
                    .maybeSingle();
                pracRow = res.data;
            }

            if (pracRow) {
                if (pracRow.application_email) pracEmail = pracRow.application_email;
                if (pracRow.name) pracName = pracRow.name;
            }
        }

        // Step B: Check `profiles` table to find the auth user ID linked to practitioner_slug
        if (!pracEmail && (normalizedSlug || rawSlug)) {
            let { data: profRow } = await supabase
                .from('profiles')
                .select('id, full_name, practitioner_slug')
                .eq('practitioner_slug', normalizedSlug || rawSlug)
                .maybeSingle();

            if (!profRow && rawSlug && rawSlug !== normalizedSlug) {
                const res = await supabase
                    .from('profiles')
                    .select('id, full_name, practitioner_slug')
                    .eq('practitioner_slug', rawSlug)
                    .maybeSingle();
                profRow = res.data;
            }

            // Fallback: match by full_name if slug differed
            if (!profRow && booking.practitioner_name) {
                const res = await supabase
                    .from('profiles')
                    .select('id, full_name, practitioner_slug')
                    .ilike('full_name', booking.practitioner_name.trim())
                    .maybeSingle();
                profRow = res.data;
            }

            if (profRow?.id) {
                if (profRow.full_name) pracName = profRow.full_name;
                try {
                    const { data: authData } = await supabase.auth.admin.getUserById(profRow.id);
                    if (authData?.user?.email) pracEmail = authData.user.email;
                } catch (_) {}
            }
        }

        // Step C: Fallback to listUsers search
        if (!pracEmail) {
            try {
                const { data: authUsers } = await supabase.auth.admin.listUsers();
                const matchedUser = authUsers?.users?.find(u => 
                    u.user_metadata?.practitioner_slug === normalizedSlug ||
                    u.user_metadata?.practitioner_slug === rawSlug ||
                    (booking.practitioner_name && u.user_metadata?.full_name?.toLowerCase() === booking.practitioner_name.toLowerCase())
                );
                if (matchedUser?.email) {
                    pracEmail = matchedUser.email;
                }
            } catch (_) {}
        }

        const bookingRef = booking.id ? `#${booking.id.slice(0, 8).toUpperCase()}` : '';

        // 6. Send Email to Client (and all group attendees)
        for (const recipient of clientRecipients) {
            const clientSubject = `Your Kuśala Session has been Rescheduled 🗓️`;
            const clientHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #1e293b; background-color: #f8fafc;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #1a5c38; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Kuśala</h1>
                        <p style="color: #0d9488; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Schedule Updated</p>
                    </div>

                    <div style="background-color: #ffffff; padding: 32px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <h2 style="font-size: 20px; color: #0f172a; margin-top: 0; font-weight: 600;">Hi ${recipient.name || 'there'} 👋,</h2>
                        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 12px 0 20px;">
                            Your upcoming session with <strong>${pracName}</strong> has been successfully rescheduled. Please make a note of the new date and time below.
                        </p>

                        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 20px; border-radius: 12px; margin: 24px 0;">
                            <div style="margin-bottom: 12px;">
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> New Date &amp; Time</span>
                                <div style="color: #14532d; font-size: 16px; font-weight: 700; margin-top: 2px;">${newDateFormatted} IST</div>
                            </div>
                            ${previousScheduledAt ? `
                            <div style="margin-bottom: 12px;">
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Previous Schedule</span>
                                <div style="color: #94a3b8; font-size: 13px; text-decoration: line-through; margin-top: 2px;">${oldDateFormatted} IST</div>
                            </div>` : ''}
                            <div style="margin-bottom: 12px;">
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Practitioner</span>
                                <div style="color: #0f172a; font-size: 15px; font-weight: 600; margin-top: 2px;">${pracName}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Session / Service</span>
                                <div style="color: #0f172a; font-size: 15px; font-weight: 600; margin-top: 2px;">${serviceName}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Mode</span>
                                <div style="color: #0f172a; font-size: 14px; font-weight: 500; margin-top: 2px;">${modeLabel}</div>
                            </div>
                            ${booking?.group_size > 1 ? `
                            <div style="margin-bottom: 12px;">
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Group Size</span>
                                <div style="color: #0f172a; font-size: 14px; font-weight: 500; margin-top: 2px;">${booking.group_size} participants</div>
                            </div>` : ''}
                            ${bookingRef ? `
                            <div>
                                <span style="color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Reference ID</span>
                                <div style="color: #475569; font-size: 13px; font-family: monospace; margin-top: 2px;">${bookingRef}</div>
                            </div>` : ''}
                        </div>

                        ${locationDisplay}

                        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin-top: 24px;">
                            <strong>Tip:</strong> We suggest being ready 5–10 minutes early. Your booking and payment status remain fully confirmed.
                        </p>

                        <div style="border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 20px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                                Questions or need to make another change? You can manage your sessions anytime in your <a href="https://kusala.in/account" style="color: #1a5c38; text-decoration: underline;">Kuśala Account</a> or reply to this email.
                            </p>
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
                        &copy; ${new Date().getFullYear()} Kuśala. All rights reserved.
                    </div>
                </div>
            `;

            await sendEmail({
                to: recipient.email,
                subject: clientSubject,
                html: clientHtml,
            });
            console.log(`✅ [RESCHEDULE EMAIL] Sent to client: ${recipient.email}`);
        }

        // 7. Send Email to Practitioner
        if (pracEmail) {
            const pracSubject = `[Rescheduled] Session with ${clientName} moved to ${newDateShort} 🗓️`;
            const pracHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #1e293b; background-color: #f8fafc;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #1a5c38; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Kuśala</h1>
                        <p style="color: #0d9488; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Practitioner Schedule Update</p>
                    </div>

                    <div style="background-color: #ffffff; padding: 32px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <h2 style="font-size: 20px; color: #0f172a; margin-top: 0; font-weight: 600;">Hi ${pracName} 👋,</h2>
                        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 12px 0 20px;">
                            An upcoming appointment has been rescheduled. Your practitioner calendar and dashboard have been updated with the new time.
                        </p>

                        <div style="background-color: #f0fdf4; border-left: 4px solid #0d9488; padding: 20px; border-radius: 12px; margin: 24px 0;">
                            <div style="margin-bottom: 12px;">
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> New Date &amp; Time</span>
                                <div style="color: #115e59; font-size: 16px; font-weight: 700; margin-top: 2px;">${newDateFormatted} IST</div>
                            </div>
                            ${previousScheduledAt ? `
                            <div style="margin-bottom: 12px;">
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Previous Schedule</span>
                                <div style="color: #94a3b8; font-size: 13px; text-decoration: line-through; margin-top: 2px;">${oldDateFormatted} IST</div>
                            </div>` : ''}
                            <div style="margin-bottom: 12px;">
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Client</span>
                                <div style="color: #0f172a; font-size: 15px; font-weight: 600; margin-top: 2px;">${clientName}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Session / Service</span>
                                <div style="color: #0f172a; font-size: 15px; font-weight: 600; margin-top: 2px;">${serviceName}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Mode</span>
                                <div style="color: #0f172a; font-size: 14px; font-weight: 500; margin-top: 2px;">${modeLabel}</div>
                            </div>
                            ${booking?.group_size > 1 ? `
                            <div style="margin-bottom: 12px;">
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Group Size</span>
                                <div style="color: #0f172a; font-size: 14px; font-weight: 500; margin-top: 2px;">${booking.group_size} participants</div>
                            </div>` : ''}
                            ${bookingRef ? `
                            <div>
                                <span style="color: #0f766e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"> Reference ID</span>
                                <div style="color: #475569; font-size: 13px; font-family: monospace; margin-top: 2px;">${bookingRef}</div>
                            </div>` : ''}
                        </div>

                        ${locationDisplay}

                        <div style="text-align: center; margin: 28px 0 12px;">
                            <a href="https://kusala.in/practitioner" style="display:inline-block;background:#1a5c38;color:#ffffff;padding:12px 30px;border-radius:9999px;font-weight:600;font-size:14px;text-decoration:none;">Open Practitioner Area</a>
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
                        &copy; ${new Date().getFullYear()} Kuśala. All rights reserved.
                    </div>
                </div>
            `;

            await sendEmail({
                to: pracEmail,
                subject: pracSubject,
                html: pracHtml,
            });
            console.log(`✅ [RESCHEDULE EMAIL] Sent to practitioner: ${pracEmail}`);
        } else {
            console.warn(`⚠️ [RESCHEDULE EMAIL] Could not resolve practitioner email for slug: ${booking.practitioner_slug}`);
        }
    } catch (err) {
        console.error('❌ [RESCHEDULE EMAIL] Failed to send rescheduled emails:', err.message);
    }
};
