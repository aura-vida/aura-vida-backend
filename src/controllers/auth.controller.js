import { supabaseAuth } from '../config/supabase.js';
import { createUserProfile, getUserProfile } from '../models/user.model.js';

export const register = async (req, res) => {
    try {
        const { email, password, name, role = 'Customer' } = req.body;

        // 1. Create user in Supabase Auth (using anon-key client to avoid session contamination)
        const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
            email,
            password,
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        // Supabase anti-enumeration protection returns a fake user object if the user already exists.
        if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
            return res.status(409).json({ error: 'A user with this email address already exists.' });
        }

        const userId = authData.user?.id;
        let userProfile = null;

        if (userId) {
            try {
                // 2. Create profile + assign role using the SERVICE ROLE client (bypasses RLS)
                userProfile = await createUserProfile(userId, name, email, role);
            } catch (profileError) {
                console.error('Profile creation failed:', profileError);
            }
        }

        res.status(201).json({
            message: 'User registered successfully',
            user: { ...authData.user, profile: userProfile },
            session: authData.session
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            return res.status(401).json({ error: authError.message });
        }

        // Fetch user profile using the SERVICE ROLE client
        let userProfile = null;
        try {
            userProfile = await getUserProfile(authData.user.id);
        } catch (err) {
            console.error('Could not fetch user profile', err);
        }

        res.status(200).json({
            message: 'Logged in successfully',
            user: { ...authData.user, profile: userProfile },
            session: authData.session
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const refreshToken = async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({
            message: 'Token refreshed successfully',
            session: data.session,
            user: data.user
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const logout = async (req, res) => {
    try {
        const { error } = await supabaseAuth.auth.signOut();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const sendOtp = async (req, res) => {
    try {
        const { identifier } = req.body;

        const { error } = await supabaseAuth.auth.signInWithOtp({
            email: identifier,
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { identifier, otp } = req.body;

        const { data, error } = await supabaseAuth.auth.verifyOtp({
            email: identifier,
            token: otp,
            type: 'email',
        });

        if (error) {
            return res.status(401).json({ error: error.message });
        }

        let userProfile = null;
        if (data.user) {
            try {
                userProfile = await getUserProfile(data.user.id);
            } catch (err) { }
        }

        res.status(200).json({
            message: 'OTP verified successfully',
            user: { ...data.user, profile: userProfile },
            session: data.session
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const { error } = await supabaseAuth.auth.resetPasswordForEmail(email);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({ message: 'Password reset request sent successfully' });
    } catch (error) {
        console.error('forgotPassword error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params; // Token moved to params
        const { email, password, newPassword } = req.body;

        // Use newPassword if provided, otherwise fallback to password
        const finalPassword = newPassword || password;

        if (!email || !token || !finalPassword) {
            return res.status(400).json({ error: 'Missing required fields: email, token (in URL), and password/newPassword' });
        }

        // 1. Verify the token_hash from the reset email link (Supabase PKCE flow)
        const { data: verifyData, error: verifyError } = await supabaseAuth.auth.verifyOtp({
            token_hash: token,   // Supabase reset emails use token_hash, not token
            type: 'recovery',
        });

        if (verifyError || !verifyData.user) {
            return res.status(401).json({ error: verifyError?.message || 'Invalid or expired reset token' });
        }

        // 2. verifyOtp with token_hash already returns a valid session — use it directly
        const { error: updateError } = await supabaseAuth.auth.updateUser({
            password: finalPassword
        });

        if (updateError) {
            return res.status(400).json({ error: updateError.message });
        }

        // Log out immediately after reset for security
        await supabaseAuth.auth.signOut();

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('resetPassword error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

