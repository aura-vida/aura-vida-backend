import { supabase } from '../config/supabase.js';
import { notifyAdmins } from '../models/notification.model.js';
import { sendEmail } from '../services/email.service.js';

/**
 * Handle practitioner-to-admin support/communication request
 * Sends in-app notification and email to all admins with the exact same title & description
 */
export const submitPractitionerSupport = async (req, res) => {
    try {
        const { title, description, category } = req.body;

        if (!title || !title.trim() || !description || !description.trim()) {
            return res.status(400).json({ error: 'Title and description are required.' });
        }

        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const userId = req.user.id;

        // 1. Fetch practitioner info
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone, practitioner_slug')
            .eq('id', userId)
            .maybeSingle();

        const practitionerName = profile?.full_name || req.user.user_metadata?.full_name || 'Practitioner';
        const practitionerEmail = req.user.email || 'Not provided';
        const practitionerSlug = profile?.practitioner_slug || 'N/A';

        // 2. Persist in contact_enquiries for admin dashboard record keeping
        let enquiryId = null;
        try {
            const { data: enquiry } = await supabase
                .from('contact_enquiries')
                .insert([{
                    name: `${practitionerName} (Practitioner: ${practitionerSlug})`,
                    email: practitionerEmail,
                    phone: profile?.phone || null,
                    message: `[${trimmedTitle}]\n\n${trimmedDescription}`,
                }])
                .select()
                .maybeSingle();

            enquiryId = enquiry?.id || null;
        } catch (enquiryErr) {
            console.warn('⚠️ [SUPPORT] Failed to record in contact_enquiries:', enquiryErr.message);
        }

        // 3. Trigger In-App Notification to all Admins
        const notificationTitle = trimmedTitle;
        const notificationMessage = trimmedDescription;

        await notifyAdmins(
            notificationTitle,
            notificationMessage,
            'support',
            enquiryId
        );
        console.log(`✅ [SUPPORT] In-app notification sent to admins: "${notificationTitle}"`);

        // 4. Resolve Admin Emails for Direct Email Notification
        const adminEmails = new Set();

        try {
            // Find all admin user IDs
            const { data: adminRoles, error: adminRolesError } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('role', 'admin');

            if (adminRolesError) {
                console.warn('⚠️ [SUPPORT] Failed fetching admin roles:', adminRolesError.message);
            }

            if (adminRoles && adminRoles.length > 0) {
                const adminIds = adminRoles.map((r) => r.user_id);

                // Fetch emails via auth admin API
                const { data: authData } = await supabase.auth.admin.listUsers();
                if (authData?.users) {
                    authData.users.forEach((u) => {
                        if (adminIds.includes(u.id) && u.email) {
                            adminEmails.add(u.email);
                        }
                    });
                }
            }
        } catch (authErr) {
            console.warn('⚠️ [SUPPORT] Failed fetching admin emails via auth:', authErr.message);
        }

        const emailRecipientList = Array.from(adminEmails);

        // 5. Send Email to Admins with identical title and description
        if (emailRecipientList.length > 0) {
            const emailHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
                    <div style="border-bottom: 2px solid #2d6a4f; padding-bottom: 12px; margin-bottom: 20px;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #2d6a4f; font-weight: 700;">Kuśala · Practitioner Support Request</span>
                        <h2 style="margin: 8px 0 0; color: #111827; font-size: 20px; font-weight: 600;">${trimmedTitle}</h2>
                    </div>

                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px; font-size: 13px; color: #4b5563;">
                            <strong>From Guide / Practitioner:</strong> ${practitionerName} (${practitionerSlug})
                        </p>
                        <p style="margin: 0; font-size: 13px; color: #4b5563;">
                            <strong>Email:</strong> <a href="mailto:${practitionerEmail}" style="color: #2d6a4f;">${practitionerEmail}</a>
                            ${profile?.phone ? ` · <strong>Phone:</strong> ${profile.phone}` : ''}
                        </p>
                        ${category ? `<p style="margin: 8px 0 0; font-size: 13px; color: #4b5563;"><strong>Category:</strong> ${category}</p>` : ''}
                    </div>

                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin: 0 0 8px;">Description</h3>
                        <div style="padding: 16px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #1f2937; white-space: pre-wrap;">
${trimmedDescription}
                        </div>
                    </div>

                    <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; text-align: center;">
                        This message was submitted from the Practitioner Workspace on Kuśala / Aura Vida.
                    </div>
                </div>
            `;

            await sendEmail({
                to: emailRecipientList,
                subject: `[Support Request] ${trimmedTitle}`,
                html: emailHtml,
            });

            console.log(`✅ [SUPPORT] Email sent to ${emailRecipientList.length} admin(s): ${emailRecipientList.join(', ')}`);
        } else {
            console.warn('⚠️ [SUPPORT] No admin email address available to send notification email to.');
        }

        res.status(201).json({
            message: 'Support request sent to admin via email and notification successfully.',
            ticket: {
                title: trimmedTitle,
                description: trimmedDescription,
                enquiryId,
            },
        });
    } catch (error) {
        console.error('❌ [SUPPORT] Error submitting practitioner support:', error);
        res.status(500).json({ error: error.message || 'Failed to submit support request.' });
    }
};
