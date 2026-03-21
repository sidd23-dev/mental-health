const axios = require('axios');
require('dotenv').config();

const CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;

/**
 * Get a Server-to-Server OAuth access token from Zoom.
 */
async function getZoomAccessToken() {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT_ID}`,
        {},
        {
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data.access_token;
}

/**
 * Create a Zoom meeting.
 * @param {string} topic
 * @param {string} patientName
 */
async function createZoomMeeting(topic, patientName = '') {
    const token = await getZoomAccessToken();

    const response = await axios.post(
        'https://api.zoom.us/v2/users/me/meetings',
        {
            topic: topic || `Mental Health Consultation - ${patientName}`,
            type: 1, // Instant meeting
            settings: {
                host_video: true,
                participant_video: true,
                join_before_host: false, // Patient cannot join before doctor
                waiting_room: true,      // Patient waits in lobby
                audio: 'both',
                auto_recording: 'none'
            }
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );

    return {
        meetingId: response.data.id,
        joinUrl: response.data.join_url,
        startUrl: response.data.start_url,
        password: response.data.password
    };
}

/**
 * End an active Zoom meeting.
 * @param {string|number} meetingId
 */
async function endZoomMeeting(meetingId) {
    const token = await getZoomAccessToken();

    await axios.put(
        `https://api.zoom.us/v2/meetings/${meetingId}/status`,
        { action: 'end' },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );
}

module.exports = { getZoomAccessToken, createZoomMeeting, endZoomMeeting };
