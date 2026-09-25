import { supabase } from './src/config/supabase.js';

async function test() {
    const code = 'A4FDBA2E';
    console.log(`Checking DB for referral code: ${code}`);

    const { data: referrer, error: referrerError } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', code)
        .single();

    console.log("Data:", referrer);
    console.log("Error:", referrerError);
}

test();
