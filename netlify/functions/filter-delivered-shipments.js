import axios from 'axios';

// Configuration
const API_URL = 'https://starlinksapi.app/api/v1/shipment/history';
const API_KEY = process.env.STARLINKS_API_KEY || '399c08024f1f5206d6eef361c1203394d3be9763';
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
        const { shipments, dateFrom, dateTo } = JSON.parse(event.body);

        if (!Array.isArray(shipments) || shipments.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid input: shipments array required' })
            };
        }

        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;

        // Process concurrently
        const results = await Promise.all(shipments.map(async (row) => {
            const trackNumber = row.track_number;

            if (!trackNumber) {
                return { ...row, filter_status: 'skipped_no_track_number' };
            }

            try {
                const response = await axios.get(API_URL, {
                    params: {
                        api_key: API_KEY,
                        tracking_number: trackNumber
                    },
                    timeout: REQUEST_TIMEOUT
                });

                const apiResp = response.data;
                const historyEvents = apiResp?.[trackNumber];

                if (!historyEvents || !Array.isArray(historyEvents)) {
                    return { ...row, filter_status: 'skipped_no_history' };
                }

                // Find delivered events in range
                const deliveredEvents = historyEvents.filter(ev => {
                    if (ev.event_name !== 'Delivered') return false;
                    if (!fromDate || !toDate) return true; // If no date range, keep all delivered
                    const eventDate = new Date(ev.event_date.replace(' ', 'T'));
                    return eventDate >= fromDate && eventDate <= toDate;
                });

                if (deliveredEvents.length === 0) {
                    return { ...row, filter_status: 'filtered_out_not_delivered_in_range' };
                }

                // Extract timeline
                const timeline = extractTimelineFromHistory(historyEvents);

                return {
                    ...row,
                    filter_status: 'kept',
                    delivered_events: JSON.stringify(deliveredEvents),
                    ...timeline
                };

            } catch (error) {
                console.error(`Error processing history for ${trackNumber}:`, error.message);
                return { ...row, filter_status: 'error', filter_error: error.message };
            }
        }));

        // Filter out items that were not kept (if the UI wants strict filtering, or we return all with status)
        // Returning all allows the UI to show "skipped X rows"
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

function extractTimelineFromHistory(historyEvents) {
    if (!Array.isArray(historyEvents)) {
        return {
            first_hub_scan: '',
            ofd_time: '',
            first_delivery_attempt: '',
            last_delivery_attempt: '',
            delivered_time: ''
        };
    }
    const parseDt = s => new Date((s || '').replace(' ', 'T'));
    const byAsc = [...historyEvents].sort((a, b) => parseDt(a.event_date) - parseDt(b.event_date));
    const byDesc = [...byAsc].reverse();

    const firstHub = byAsc.find(ev => (ev.event_name || '').toLowerCase().match(/hub|facility|arrival|scan/));
    const ofd = byAsc.find(ev => (ev.event_name || '').toLowerCase().match(/ofd|out.*delivery/));
    const firstAttempt = byAsc.find(ev => (ev.event_name || '').toLowerCase().includes('attempt'));
    const lastAttempt = byDesc.find(ev => (ev.event_name || '').toLowerCase().includes('attempt'));
    const delivered = byDesc.find(ev => (ev.event_name || '').toLowerCase() === 'delivered');

    return {
        first_hub_scan: firstHub?.event_date || '',
        ofd_time: ofd?.event_date || '',
        first_delivery_attempt: firstAttempt?.event_date || '',
        last_delivery_attempt: lastAttempt?.event_date || '',
        delivered_time: delivered?.event_date || ''
    };
}
