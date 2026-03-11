import axios from 'axios';

// Configuration
const API_URL = 'https://app.shipsy.in/api/client/integration/consignment/track';
const API_KEY = process.env.SHIPSY_API_KEY || '969b6e28a73246dec5760c9227f5fc';
const REQUEST_TIMEOUT = 10000;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const handler = async (event, context) => {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { shipments } = JSON.parse(event.body);

        if (!Array.isArray(shipments) || shipments.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid input: shipments array required' })
            };
        }

        // Process concurrently
        const results = await Promise.all(shipments.map(async (row) => {
            const trackNumber = row.track_number;

            if (!trackNumber) {
                return { ...row, courier_status: 'skipped_no_track_number' };
            }

            try {
                const response = await axios.get(API_URL, {
                    params: { reference_number: trackNumber },
                    headers: {
                        'api-key': API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: REQUEST_TIMEOUT
                });

                const apiResp = response.data;
                const events = apiResp?.events; // Check structure based on process_riders.js

                if (!apiResp) { // process_riders.js checks !apiResp
                    return { ...row, courier_status: 'skipped_no_api_response' };
                }

                // process_riders extracts rider info from events
                const riderInfo = extractRiderInfo(events);
                const timelineInfo = extractTimeline(events);

                if (!riderInfo) {
                    return { ...row, courier_status: 'skipped_no_delivered_event' };
                }

                // Merge inputs with extracted info
                return {
                    ...row,
                    courier_status: 'found',
                    ...riderInfo,
                    ...timelineInfo
                };

            } catch (error) {
                console.error(`Error processing shipsy for ${trackNumber}:`, error.message);
                return { ...row, courier_status: 'error', courier_error: error.message };
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ results })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};

function toRiyadhTime(utcString) {
    if (!utcString) return '';
    try {
        const date = new Date(utcString);
        // Add 3 hours
        date.setHours(date.getHours() + 3);
        return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (e) {
        return utcString;
    }
}

function extractRiderInfo(events) {
    if (!events || !Array.isArray(events)) {
        return null;
    }

    const deliveredEvent = events.find(ev => ev.type === 'delivered');
    if (!deliveredEvent) {
        return null;
    }

    // Riyadh conversion happens here
    return {
        worker_name: deliveredEvent.worker_name || '',
        worker_code: deliveredEvent.worker_code || '',
        worker_phone: deliveredEvent.worker_phone || '',
        vehicle_number: deliveredEvent.vehicle_number || '',
        hub_name: deliveredEvent.hub_name || '',
        hub_code: deliveredEvent.hub_code || '',
        location: deliveredEvent.location || '',
        // Standard fields per validation
        delivery_date: deliveredEvent.event_time_utc ? new Date(deliveredEvent.event_time_utc).toISOString().split('T')[0] : '',
        delivery_time: deliveredEvent.event_time_utc ? toRiyadhTime(deliveredEvent.event_time_utc).split(' ')[1] : ''
    };
}

function extractTimeline(events) {
    if (!events || !Array.isArray(events)) {
        return {
            first_hub_scan_time_riyadh: '',
            ofd_time_riyadh: '',
            first_delivery_attempt_time_riyadh: '',
            last_delivery_attempt_time_riyadh: '',
            delivered_time_riyadh: ''
        };
    }

    const byTimeAsc = [...events].sort((a, b) => new Date(a.event_time_utc || 0) - new Date(b.event_time_utc || 0));
    const byTimeDesc = [...byTimeAsc].reverse();

    const firstHub = byTimeAsc.find(ev => {
        const t = (ev.type || '').toLowerCase();
        const name = (ev.event_name || '').toLowerCase();
        return t.includes('reachedathub') || t.includes('hub') || t.includes('scan') || name.includes('hub') || name.includes('scan') || name.includes('arrival');
    });

    const ofd = byTimeAsc.find(ev => {
        const t = (ev.type || '').toLowerCase();
        const statusExternal = (ev.status_external || '').toLowerCase();
        const name = (ev.event_name || '').toLowerCase();
        return t.includes('accept') || t.includes('ofd') || statusExternal.includes('out for delivery') || name.includes('out for delivery');
    });

    const firstAttempt = byTimeAsc.find(ev => {
        const t = (ev.type || '').toLowerCase();
        const name = (ev.event_name || '').toLowerCase();
        return t.includes('attempt') || name.includes('attempt');
    });

    const lastAttempt = byTimeDesc.find(ev => {
        const t = (ev.type || '').toLowerCase();
        const name = (ev.event_name || '').toLowerCase();
        return t.includes('attempt') || name.includes('attempt');
    });

    const delivered = byTimeDesc.find(ev => (ev.type || '').toLowerCase() === 'delivered' || (ev.event_name || '').toLowerCase() === 'delivered');

    return {
        first_hub_scan_time_riyadh: toRiyadhTime(firstHub?.event_time_utc),
        ofd_time_riyadh: toRiyadhTime(ofd?.event_time_utc),
        first_delivery_attempt_time_riyadh: toRiyadhTime(firstAttempt?.event_time_utc),
        last_delivery_attempt_time_riyadh: toRiyadhTime(lastAttempt?.event_time_utc),
        delivered_time_riyadh: toRiyadhTime(delivered?.event_time_utc)
    };
}
