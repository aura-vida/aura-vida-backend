import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Missing Supabase environment variables. Please check your .env file.');
}

// Used ONLY for Supabase Auth operations (signUp, signIn, OTP etc.)
// Uses anon key + no session persistence so the session from signUp() doesn't contaminate the admin client
export const supabaseAuth = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Used for all database operations (profiles, user_roles, etc.)
// Uses the Service Role Key to bypass RLS
export const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '', {
    auth: { persistSession: false, autoRefreshToken: false }
});
