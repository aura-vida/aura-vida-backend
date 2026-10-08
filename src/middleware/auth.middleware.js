import { supabase, supabaseAuth } from '../config/supabase.js';

/**
 * requireAuth - verifies the Bearer JWT token
 * Attaches req.user for downstream use
 */
export const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        // Fetch and attach role to the request user object
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        // Check profile status
        const { data: profileData } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', user.id)
            .maybeSingle();

        if (profileData?.status === 'inactive') {
            return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
        }

        req.user = { ...user, role: roleData?.role };
        next();
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error in auth middleware' });
    }
};

/**
 * requireRole - checks if the authenticated user has one of the allowed roles
 * Must be used AFTER requireAuth middleware
 * @param {...string} roles - allowed roles e.g. requireRole('admin', 'practitioner')
 */
export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden: requires one of [${roles.join(', ')}] role`
            });
        }
        next();
    };
};
