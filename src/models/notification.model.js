import { supabase } from '../config/supabase.js';

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
        const { data: adminRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', ['admin', 'superadmin']);

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
