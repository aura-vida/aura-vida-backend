import * as adminModel from '../models/admin.model.js';
import * as contactModel from '../models/contact.model.js';
import * as reviewModel from '../models/review.model.js';

export const dashboard = async (req, res) => {
    try {
        const summary = await adminModel.getDashboardSummary();
        res.status(200).json(summary);
    } catch (error) {
        console.error('Admin Dashboard API Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching dashboard' });
    }
};

export const usersList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const filters = { search: req.query.search };

        const result = await adminModel.getUsersList(filters, page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Users API Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching users' });
    }
};

export const appointmentsList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const filters = { status: req.query.status };

        const result = await adminModel.getAppointmentsList(filters, page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Appointments API Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching appointments' });
    }
};

export const paymentsList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const filters = { status: req.query.status };

        const result = await adminModel.getPaymentsList(filters, page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Payments API Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching payments' });
    }
};

export const getUserDetails = async (req, res) => {
    try {
        const result = await adminModel.getUserDetails(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Get User Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching user' });
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (status !== 'active' && status !== 'inactive') {
            return res.status(400).json({ error: 'Status must be strictly "active" or "inactive"' });
        }
        const result = await adminModel.updateUserStatus(req.params.id, status);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Update User Status Error:', error);
        res.status(500).json({ error: error.message || 'Error updating user status' });
    }
};

export const rolesList = async (req, res) => {
    try {
        const result = await adminModel.getRolesList();
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Roles API Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching roles' });
    }
};

export const updateRolePermissions = async (req, res) => {
    try {
        const { permissionIds } = req.body;
        const result = await adminModel.updateRolePermissions(req.params.id, permissionIds);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Update Role Permissions Error:', error);
        res.status(500).json({ error: error.message || 'Error updating permissions' });
    }
};

export const getAuditLogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const filters = {}; // add filters if requested

        const result = await adminModel.getAuditLogs(filters, page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Audit Logs Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching audit logs' });
    }
};

export const updatePractitionerStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (status !== 'active' && status !== 'inactive') {
            return res.status(400).json({ error: 'Status must be strictly "active" or "inactive"' });
        }
        const result = await adminModel.updatePractitionerStatus(req.params.id, status);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Update Practitioner Status Error:', error);
        res.status(500).json({ error: error.message || 'Error updating practitioner status' });
    }
};

export const updatePractitionerServices = async (req, res) => {
    try {
        const { serviceIds } = req.body;
        const result = await adminModel.updatePractitionerServices(req.params.id, serviceIds);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin Update Practitioner Services Error:', error);
        res.status(500).json({ error: error.message || 'Error updating practitioner services' });
    }
};

export const listContacts = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const result = await contactModel.listEnquiries(page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('Admin List Contacts Error:', error);
        res.status(500).json({ error: error.message || 'Error fetching contacts' });
    }
};

export const moderateReview = async (req, res) => {
    try {
        const { status } = req.body;
        const data = await reviewModel.updateReviewStatus(req.params.id, status);
        res.status(200).json({ message: 'Review status updated.', data });
    } catch (error) {
        console.error('Admin Moderate Review Error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Error moderating review' });
    }
};
