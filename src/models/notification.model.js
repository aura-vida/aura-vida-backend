import { supabase } from '../config/supabase.js';
import { sendEmail } from '../services/email.service.js';

export const getUserNotifications = async (userId, limit = 20) => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
};

export const markAsRead = async (userId, notificationId) => {
    const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const markAllAsRead = async (userId) => {
    const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select();
    if (error) throw error;
    return data;
};

export const createNotification = async (userId, title, message, type = 'info', referenceId = null) => {
    const { data, error } = await supabase
        .from('notifications')
        .insert([{ user_id: userId, title, message, type, reference_id: referenceId }])
        .select()
        .maybeSingle();
    if (error) {
        console.error('Create notification error:', error);
        return null;
    }
    return data;
};

export const notifyAdmins = async (title, message, type = 'info', referenceId = null) => {
    try {
        const { data: adminRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'admin');

        if (rolesError) {
            console.error('Failed to fetch admin roles:', rolesError.message);
            return [];
        }
        if (!adminRoles || adminRoles.length === 0) return [];

        const inserts = adminRoles.map((r) => ({
            user_id: r.user_id,
            title,
            message,
            type,
            reference_id: referenceId,
        }));

        const { data, error } = await supabase
            .from('notifications')
            .insert(inserts)
            .select();

        if (error) {
            console.error('Failed to notify admins:', error);
            return [];
        }
        return data;
    } catch (err) {
        console.error('Error in notifyAdmins:', err);
        return [];
    }
};

/**
 * Resolves every admin's email address. user_roles only has user ids —
 * emails live in auth.users, which isn't joinable via PostgREST, so this
 * goes through the Admin API to match them up.
 */
export const getAdminEmails = async () => {
    const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

    if (rolesError) {
        console.error('Failed to fetch admin roles:', rolesError.message);
        return [];
    }
    if (!adminRoles || adminRoles.length === 0) return [];

    const adminIds = new Set(adminRoles.map((r) => r.user_id));
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
        console.error('Failed to fetch admin emails:', authErr.message);
        return [];
    }

    return (authData?.users || [])
        .filter((u) => adminIds.has(u.id) && u.email)
        .map((u) => u.email);
};

/**
 * Emails every admin — the counterpart to notifyAdmins' in-app notification,
 * for events where an admin should also get a real email (not just the bell).
 */
export const emailAdmins = async (subject, html) => {
    try {
        const recipients = await getAdminEmails();
        if (recipients.length === 0) return null;
        return await sendEmail({ to: recipients, subject, html });
    } catch (err) {
        console.error('Error in emailAdmins:', err);
        return null;
    }
};
