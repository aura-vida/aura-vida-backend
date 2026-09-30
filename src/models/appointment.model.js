import { supabase } from '../config/supabase.js';
import { createNotification } from './notification.model.js';

/**
 * APT-001: Create Booking
 */
export const createBooking = async (fields) => {
    // fields expected: client_id, practitioner_slug, item_id (service_id), scheduled_at, meeting_location, status
    const { data, error } = await supabase
        .from('bookings')
        .insert([{
            ...fields,
            status: 'pending' // Initial status before payment/admin approval
        }])
        .select()
        .single();

    if (error) throw error;

    // Send notifications to client and practitioner
    if (data) {
        // Find practitioner by slug
        const { data: prac } = await supabase
            .from('profiles')
            .select('id')
            .eq('practitioner_slug', fields.practitioner_slug)
            .maybeSingle();

        const formattedDate = new Date(fields.scheduled_at).toLocaleString();

        // Notify client
        await createNotification(
            fields.client_id,
            'Booking Created',
            `Your appointment with ${fields.practitioner_slug} has been successfully requested for ${formattedDate}.`,
            'booking',
            data.id
        );

        // Notify practitioner
        if (prac?.id) {
            await createNotification(
                prac.id,
                'New Appointment Request',
                `A new appointment has been scheduled with you on ${formattedDate}.`,
                'booking',
                data.id
            );
        }
    }

    return data;
};
