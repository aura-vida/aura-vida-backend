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
        if (!rating) {
            return res.status(400).json({ error: 'Star rating is mandatory (1-5 stars).' });
        }
        const numericRating = parseInt(rating);
        if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
        }
        if (!practitioner_id && !booking_id) {
            return res.status(400).json({ error: 'Either practitioner_id or booking_id is required.' });
        }
        const data = await reviewModel.createReview({
            practitioner_id: practitioner_id || null,
            booking_id: booking_id || null,
            client_id: req.user.id,
            rating: numericRating,
            comment: comment ? String(comment).trim() : null
        });

        // Trigger notifications asynchronously (non-blocking)
        try {
            if (data.practitioner_id) {
                await createNotification(
                    data.practitioner_id,
                    'New Client Review',
                    `A client left a ${numericRating}-star review for your session.`,
                    'review',
                    data.id
                );
            }
            await notifyAdmins(
                'New Client Review',
                `A new ${numericRating}-star review was submitted.`,
                'review',
                data.id
            );
        } catch (_) {}

        res.status(201).json({ message: 'Review submitted successfully.', data });
    } catch (error) {
        console.error('createReview error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to submit review' });
    }
};

export const listAllReviews = async (req, res) => {
    try {
        const { status, rating, search, page = 1, limit = 15 } = req.query;
        const result = await reviewModel.listAllReviewsAdmin({
            status,
            rating,
            search,
            page: Math.max(1, parseInt(page) || 1),
            limit: Math.min(100, Math.max(1, parseInt(limit) || 15)),
        });
        res.status(200).json(result);
    } catch (error) {
        console.error('listAllReviews error:', error);
        res.status(500).json({ error: error.message || 'Failed to list reviews' });
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
