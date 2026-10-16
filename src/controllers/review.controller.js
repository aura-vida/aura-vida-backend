import * as reviewModel from '../models/review.model.js';
import { createNotification, notifyAdmins } from '../models/notification.model.js';

export const listPractitionerReviews = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const result = await reviewModel.listPractitionerReviews(req.params.id, page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('listPractitionerReviews error:', error);
        res.status(500).json({ error: error.message || 'Failed to list reviews' });
    }
};

export const createReview = async (req, res) => {
    try {
        const { practitioner_id, booking_id, rating, comment } = req.body;
        if (!practitioner_id || !rating) {
            return res.status(400).json({ error: 'practitioner_id and rating are required.' });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating must be between 1 and 5.' });
        }
        const data = await reviewModel.createReview({
            practitioner_id,
            booking_id: booking_id || null,
            client_id: req.user.id,
            rating: parseInt(rating),
            comment: comment || null
        });

        // Trigger notifications asynchronously (non-blocking)
        try {
            await createNotification(
                practitioner_id,
                'New Client Review',
                `A client left a ${rating}-star review for your session.`,
                'review',
                data.id
            );
            await notifyAdmins(
                'New Client Review',
                `A new ${rating}-star review was submitted and is pending moderation.`,
                'review',
                data.id
            );
        } catch (_) {}

        res.status(201).json({ message: 'Review submitted and pending approval.', data });
    } catch (error) {
        console.error('createReview error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to submit review' });
    }
};

export const getMyReviews = async (req, res) => {
    try {
        const reviews = await reviewModel.listReviewsByClient(req.user.id);
        res.status(200).json({ reviews });
    } catch (error) {
        console.error('getMyReviews error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch your reviews' });
    }
};

export const moderateReview = async (req, res) => {
    try {
        const { status } = req.body;
        const data = await reviewModel.updateReviewStatus(req.params.id, status);
        res.status(200).json({ message: 'Review status updated.', data });
    } catch (error) {
        console.error('moderateReview error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to moderate review' });
    }
};
