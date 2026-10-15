import crypto from 'crypto';

/**
 * Generates an instant video meeting link for an online booking.
 * Uses Jitsi Meet as it requires no API authentication or Workspace subscription.
 * 
 * @param {Object} opts
 * @param {string} opts.summary - The title of the event
 * @param {string} opts.description - The description of the event
 * @returns {Promise<{ htmlLink: string, meetLink: string } | null>}
 */
export const createMeetEvent = async ({
    summary,
    description,
}) => {
    try {
        // Generate a random, unique room ID for the session
        const uniqueRoomId = crypto.randomBytes(8).toString('hex');
        const roomName = `Kusala-Session-${uniqueRoomId}`;
        const meetLink = `https://meet.jit.si/${roomName}`;

        console.log(`✅ [VIDEO] Meeting link generated: ${meetLink}`);

        return {
            eventId: roomName,
            htmlLink: meetLink,
            meetLink
        };
    } catch (error) {
        console.error('❌ [VIDEO] Error generating meeting link:', error.message);
        return null;
    }
};
