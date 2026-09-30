import { supabase } from '../config/supabase.js';

export const createEnquiry = async (fields) => {
    const { data, error } = await supabase
        .from('contact_enquiries')
        .insert([fields])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const listEnquiries = async (page, limit) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await supabase
        .from('contact_enquiries')
        .select('*', { count: 'exact' })
        .range(from, to)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};
