import { supabase } from './src/config/supabase.js';

async function testUpdate() {
    console.log('Testing direct update on DB...');
    // We are updating user 4:
    const targetUserId = '39e32a6e-3c1b-4377-b131-adc5f50d5535';
    // With referrer user 1:
    const referrerId = 'a4fdba2e-a447-4fa8-9b4f-df3896509eb0';

    const { data, error } = await supabase
        .from('profiles')
        .update({ referred_by: referrerId })
        .eq('id', targetUserId)
        .select()
        .single();

    console.log("Update Data Result:", data);
    console.log("Update Error:", error);
}

testUpdate();
