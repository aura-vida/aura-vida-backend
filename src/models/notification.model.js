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
