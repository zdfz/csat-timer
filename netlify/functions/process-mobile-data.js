import axios from 'axios';

// Configuration
const API_BASE_URL = 'https://starlinksapi.app/api/v1/shipments/get-list';
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
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { mobileNumbers } = JSON.parse(event.body);

        if (!Array.isArray(mobileNumbers) || mobileNumbers.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid input: mobileNumbers array required' })
            };
        }

        // Process batch concurrently
        const results = await Promise.all(mobileNumbers.map(async (item) => {
            const { mobile, rowIndex } = item;

            // Basic cleaning
            let cleanMobile = mobile.toString().replace(/[\s\-\(\)]/g, '');
            cleanMobile = cleanMobile.replace(/^0+/, '');
            if (cleanMobile.length === 9) cleanMobile = '966' + cleanMobile;
            else if (cleanMobile.length === 10 && cleanMobile.startsWith('0')) cleanMobile = '966' + cleanMobile.substring(1); else if (cleanMobile.startsWith('966')) { /* already good */ }

            try {
                const response = await axios.get(API_BASE_URL, {
                    params: {
                        search_value: cleanMobile,
                        include_completed: true
                    },
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: REQUEST_TIMEOUT
                });

                const shipments = response.data || [];

                if (shipments.length === 0) {
                    return { mobile, cleanMobile, rowIndex, found: false, error: 'No shipments found' };
                }

                // Ensure shipments is an array
                if (!Array.isArray(shipments)) {
                    // unexpected response structure
                    console.error(`Unexpected API response for ${mobile}:`, JSON.stringify(shipments));
                    return { mobile, cleanMobile, rowIndex, found: false, error: 'API returned invalid structure' };
                }

                // Map all shipments found for this mobile
                return shipments.map(shipment => enrichShipmentData(shipment, mobile, cleanMobile, rowIndex));

            } catch (error) {
                console.error(`Error processing ${mobile}:`, error.message);
                if (error.response) {
                    console.error('API Response Data:', JSON.stringify(error.response.data));
                }
                return {
                    mobile,
                    cleanMobile,
                    rowIndex,
                    found: false,
                    error: error.response?.data?.message || error.message || 'API Error'
                };
            }
        }));

        // Flatten results (since one mobile can return multiple shipments)
        const flatResults = results.flat();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ results: flatResults })
        };

    } catch (error) {
        console.error('Function error stack:', error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};

function enrichShipmentData(shipment, mobile, cleanMobile, rowIndex) {
    // Helper to extract nested fields safely
    const get = (obj, path, valid = '') => obj?.[path] || valid;

    // Flatten structure similar to original script
    const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];

    return {
        // Core Data
        mobile,
        cleanMobile,
        rowIndex,
        found: true,
        error: null,

        // Shipment Info
        status: shipment.status || '',
        track_number: shipment.track_number || '',
        customer_name: shipment.customer_name || '',
        service_code: shipment.service_code || '',
        order_reference: shipment.order_reference || '',
        customer_id_reference: shipment.customer_id_reference || '',
        invoice: shipment.invoice || '',
        incoterm: shipment.incoterm || '',
        currency: shipment.currency || '',
        price: shipment.price || '',
        cod_value: shipment.cod_value || '',
        cod_currency: shipment.cod_currency || '',
        category: shipment.category || '',
        label_format: shipment.label_format || '',
        estimated_delivery_date: shipment.estimated_delivery_date || '',
        scheduled_delivery_date: shipment.scheduled_delivery_date || '',

        // Consignee
        consignee_name: shipment.consignee_address?.name || '',
        consignee_phone: shipment.consignee_address?.phone || '',
        consignee_email: shipment.consignee_address?.email || '',
        consignee_city: shipment.consignee_address?.city || '',
        consignee_state: shipment.consignee_address?.state || '',
        consignee_country: shipment.consignee_address?.country || '',
        consignee_address1: shipment.consignee_address?.address1 || '',
        consignee_address2: shipment.consignee_address?.address2 || '',

        // Shipper
        shipper_name: shipment.shipper_address?.name || '',
        shipper_phone: shipment.shipper_address?.phone || '',
        shipper_city: shipment.shipper_address?.city || '',
        shipper_country: shipment.shipper_address?.country || '',
        shipper_address1: shipment.shipper_address?.address1 || '',

        // Parcels (Pipe separated for multiple)
        parcel_description: parcels.map(p => p.description || '').join(' | '),
        parcel_warehouse: parcels.map(p => p.warehouse || '').join(' | '),
        product_sku: parcels.map(p => p.product_sku || '').join(' | '),
        product_description: parcels.map(p => p.product_description || '').join(' | '),
        product_quantity: parcels.map(p => p.product_quantity || '').join(' | '),
        product_image_url: parcels.map(p => p.product_image_url || '').join(' | '),
    };
}
