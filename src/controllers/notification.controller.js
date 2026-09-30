import * as notificationModel from '../models/notification.model.js';

export const listNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 20;
        const notifications = await notificationModel.getUserNotifications(userId, limit);
        res.status(200).json(notifications);
    } catch (error) {
        console.error('List notifications error:', error);
        res.status(500).json({ error: error.message || 'Error fetching notifications' });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;
        const updated = await notificationModel.markAsRead(userId, notificationId);
        res.status(200).json(updated);
    } catch (error) {
        console.error('Mark notification as read error:', error);
        res.status(500).json({ error: error.message || 'Error updating notification' });
    }
};

export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const updated = await notificationModel.markAllAsRead(userId);
        res.status(200).json({ success: true, count: updated?.length || 0 });
    } catch (error) {
        console.error('Mark all notifications error:', error);
        res.status(500).json({ error: error.message || 'Error updating notifications' });
    }
};
