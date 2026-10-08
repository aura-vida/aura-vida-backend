import { supabase } from '../config/supabase.js';

/**
 * Add an email to the waitlist. Returns conflict error if duplicate.
 */
export const addToWaitlist = async (email) => {
    const { data, error } = await supabase
        .from('waitlist')
        .insert([{ email: email.toLowerCase().trim() }])
        .select()
        .single();

    if (error) throw error;
    return data;
};
