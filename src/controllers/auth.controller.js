import { supabase } from '../config/supabase.js';
import { createUserProfile, getUserProfile } from '../models/user.model.js';

export const register = async (req, res) => {
    try {
        const { email, password, name, role = 'Customer' } = req.body;

        // 1. Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
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
            // 2. Create user profile in public.User table
            // In a real scenario, you'd map the 'role' string to a roleId from the Role table.
            // For now, we pass it as a simple representation.
            try {
                userProfile = await createUserProfile(userId, name, email, role);
            } catch (profileError) {
                // If profile creation fails, we might still have the auth user created.
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

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        console.log("email", email);
        if (authError) {
            return res.status(401).json({ error: authError.message });
        }

        // Fetch user profile to get roles and details
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

export const logout = async (req, res) => {
    try {
        // Requires getting the user's token, but supabase handles this via the current session if client is authenticated.
        // For a backend API, we usually expect the token to be sent. We can sign out via admin API or just instruct client to discard.
        const { error } = await supabase.auth.signOut();

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
        const { identifier } = req.body; // usually email

        const { error } = await supabase.auth.signInWithOtp({
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

        const { data, error } = await supabase.auth.verifyOtp({
            email: identifier,
            token: otp,
            type: 'email',
        });

        if (error) {
            return res.status(401).json({ error: error.message });
        }

        // Attempt to fetch profile
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
