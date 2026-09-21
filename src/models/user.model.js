import { supabase } from '../config/supabase.js';

export const createUserProfile = async (userId, name, email, incomingRole) => {
    // Map incoming roles ("Customer") to Enum ("client")
    let dbRole = 'client';
    if (incomingRole === 'Practitioner') dbRole = 'practitioner';
    else if (incomingRole === 'Admin') dbRole = 'admin';

    // 1. Insert into 'profiles'
    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .insert([{
            id: userId,
            full_name: name,
            credit_inr: 0
        }])
        .select();

    if (profileError) throw profileError;

    // 2. Insert into 'user_roles'
    const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .insert([{
            user_id: userId,
            role: dbRole
        }])
        .select();

    if (roleError) {
        console.warn("Could not insert user_role:", roleError.message);
    }

    return { ...profileData[0], role: roleData?.[0]?.role };
};

export const getUserProfile = async (userId) => {
    const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error && error.code !== 'PGRST116') throw error; // ignore if simply not found

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

    return {
        ...(profileData || {}),
        role: roleData?.role
    };
};
