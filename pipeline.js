// ============================================================
// CSAT Full Automation Pipeline
// Usage: node pipeline.js <csv-path> <date-label>
// Example: node pipeline.js C:\...\results_2026-03-08.csv 2026-03-08
// ============================================================

import 'dotenv/config';
import axios from 'axios';
import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Config ----
const STARLINKS_API_KEY  = process.env.STARLINKS_API_KEY;
const SHIPSY_API_KEY     = process.env.SHIPSY_API_KEY;
const REQUEST_TIMEOUT    = 15000;

// ---- Telegram progress (credentials passed via env from scheduler.js) ----
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID   = process.env.TG_CHAT_ID   || '';

async function sendTg(text) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
    try {
        await axios.post(
            `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
            { chat_id: TG_CHAT_ID, text },
            { timeout: 10000 }
        );
    } catch { /* non-fatal */ }
}

const csvPath   = process.argv[2];
const dateLabel = process.argv[3]; // e.g. '2026-03-08'

if (!csvPath || !dateLabel) {
    console.error('Usage: node pipeline.js <csv-path> <date-label>');
    process.exit(1);
}

const outputDir  = path.dirname(csvPath);
const outputPath = path.join(outputDir, `pipeline_${dateLabel}.xlsx`);

// ---- Utilities ----

function cleanMobile(mobile) {
    let s = String(mobile).replace(/[\s\-\(\)]/g, '');
    s = s.replace(/^0+/, '');
    if (s.length === 9) return '966' + s;
    if (s.length === 10 && s.startsWith('0')) return '966' + s.substring(1);
    return s;
}

function normalizeMobile(val) {
    if (!val) return '';
    let s = String(val).toLowerCase().trim();
    if (s.endsWith('.0')) s = s.slice(0, -2);
    s = s.replace(/\D/g, '');
    if (s.startsWith('05') && s.length === 10) return '966' + s.substring(1);
    if (s.startsWith('5')  && s.length === 9)  return '966' + s;
    return s;
}

function toRiyadhTime(utcString) {
    if (!utcString) return '';
    try {
        const date = new Date(utcString);
        if (isNaN(date.getTime())) return '';
        date.setHours(date.getHours() + 3);
        return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch { return ''; }
}

// Convert Excel date serial → "YYYY-MM-DD HH:MM:SS" in the timezone the string was written.
// Works correctly whether the pipeline runs on UTC (GitHub Actions) or UTC+3 (local Windows).
function serialToDatetimeString(serial) {
    const utcMs  = (serial - 25569) * 86400 * 1000;
    const localMs = utcMs - new Date(utcMs).getTimezoneOffset() * 60000;
    return new Date(localMs).toISOString().replace('T', ' ').slice(0, 19);
}

// Format "YYYY-MM-DD HH:MM:SS" (already Riyadh time) → "Mar 10, 11:47 PM"
function formatSubmittedAt(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return String(s);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h24 = +m[4], min = +m[5];
    const h12 = h24 % 12 || 12;
    return `${months[+m[2] - 1]} ${+m[3]}, ${h12}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

async function processBatches(label, items, batchSize, fn) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await fn(batch);
        results.push(...batchResults);
        process.stdout.write(`\r  ${label}: ${Math.min(i + batchSize, items.length)}/${items.length}   `);
    }
    process.stdout.write('\n');
    return results;
}

// ---- STEP 1: Mobile Lookup (Starlinks) ----
async function step1(typebotRows) {
    console.log(`\n[Step 1] Mobile Lookup — ${typebotRows.length} survey responses`);

    // Deduplicate mobiles to reduce API calls
    const mobileMap = new Map(); // cleanMobile -> [typebotRows]
    for (const row of typebotRows) {
        const raw = String(row['Mobile'] || row['mobile'] || '').trim();
        if (!raw) continue;
        const clean = cleanMobile(raw);
        if (!mobileMap.has(clean)) mobileMap.set(clean, []);
        mobileMap.get(clean).push(row);
    }

    const uniqueMobiles = Array.from(mobileMap.keys());
    console.log(`  Unique mobiles: ${uniqueMobiles.length}`);

    const shipmentRows = await processBatches('Mobiles', uniqueMobiles, 5, async (batch) => {
        const batchResults = await Promise.all(batch.map(async (cleanMobile) => {
            try {
                const response = await axios.get('https://starlinksapi.app/api/v1/shipments/get-list', {
                    params: { search_value: cleanMobile, include_completed: true },
                    headers: { 'Authorization': `Bearer ${STARLINKS_API_KEY}`, 'Content-Type': 'application/json' },
                    timeout: REQUEST_TIMEOUT
                });

                const shipments = response.data || [];
                if (!Array.isArray(shipments) || shipments.length === 0) return [];

                return shipments.map(shipment => {
                    const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];
                    return {
                        _cleanMobile: cleanMobile,
                        mobile:       cleanMobile,
                        found:        true,
                        // Shipment
                        status:                   shipment.status                   || '',
                        track_number:             shipment.track_number             || '',
                        customer_name:            shipment.customer_name            || '',
                        service_code:             shipment.service_code             || '',
                        order_reference:          shipment.order_reference          || '',
                        customer_id_reference:    shipment.customer_id_reference    || '',
                        invoice:                  shipment.invoice                  || '',
                        incoterm:                 shipment.incoterm                 || '',
                        currency:                 shipment.currency                 || '',
                        price:                    shipment.price                    || '',
                        cod_value:                shipment.cod_value                || '',
                        cod_currency:             shipment.cod_currency             || '',
                        category:                 shipment.category                 || '',
                        label_format:             shipment.label_format             || '',
                        estimated_delivery_date:  shipment.estimated_delivery_date  || '',
                        scheduled_delivery_date:  shipment.scheduled_delivery_date  || '',
                        // Consignee
                        consignee_name:     shipment.consignee_address?.name     || '',
                        consignee_phone:    shipment.consignee_address?.phone    || '',
                        consignee_email:    shipment.consignee_address?.email    || '',
                        consignee_city:     shipment.consignee_address?.city     || '',
                        consignee_state:    shipment.consignee_address?.state    || '',
                        consignee_country:  shipment.consignee_address?.country  || '',
                        consignee_address1: shipment.consignee_address?.address1 || '',
                        consignee_address2: shipment.consignee_address?.address2 || '',
                        // Shipper
                        shipper_name:     shipment.shipper_address?.name     || '',
                        shipper_phone:    shipment.shipper_address?.phone    || '',
                        shipper_city:     shipment.shipper_address?.city     || '',
                        shipper_country:  shipment.shipper_address?.country  || '',
                        shipper_address1: shipment.shipper_address?.address1 || '',
                        // Parcels
                        parcel_description:  parcels.map(p => p.description        || '').join(' | '),
                        parcel_warehouse:    parcels.map(p => p.warehouse           || '').join(' | '),
                        product_sku:         parcels.map(p => p.product_sku         || '').join(' | '),
                        product_description: parcels.map(p => p.product_description || '').join(' | '),
                        product_quantity:    parcels.map(p => p.product_quantity     || '').join(' | '),
                        product_image_url:   parcels.map(p => p.product_image_url   || '').join(' | '),
                    };
                });
            } catch (e) {
                console.error(`\n  Error for mobile ${cleanMobile}: ${e.message}`);
                return [];
            }
        }));
        return batchResults.flat();
    });

    const valid = shipmentRows.filter(r => r.track_number);
    console.log(`  → ${valid.length} shipments found`);
    await sendTg(`[1/5] ✅ Mobile Lookup\n→ ${uniqueMobiles.length} unique mobiles → ${valid.length} shipments found`);
    return valid;
}

// ---- STEP 2: Filter Delivered (Starlinks history) ----
async function step2(rows, dateLabel) {
    console.log(`\n[Step 2] Filter Delivered — ${rows.length} shipments`);

    const refDate = new Date(dateLabel);
    const dateFrom = new Date(refDate);
    dateFrom.setDate(dateFrom.getDate() - 1);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(refDate);
    dateTo.setHours(23, 59, 59, 999);

    console.log(`  Window: ${dateFrom.toISOString().slice(0,10)} → ${dateTo.toISOString().slice(0,10)}`);

    const parseDt = s => new Date((s || '').replace(' ', 'T'));

    const results = await processBatches('Shipments', rows, 50, async (batch) => {
        const batchResults = await Promise.all(batch.map(async (row) => {
            const trackNumber = row.track_number;
            if (!trackNumber) return null;

            try {
                const response = await axios.get('https://starlinksapi.app/api/v1/shipment/history', {
                    params: { api_key: STARLINKS_API_KEY, tracking_number: trackNumber },
                    timeout: REQUEST_TIMEOUT
                });

                const historyEvents = response.data?.[trackNumber];
                if (!historyEvents || !Array.isArray(historyEvents)) return null;

                const deliveredEvents = historyEvents.filter(ev => {
                    if (ev.event_name !== 'Delivered') return false;
                    const eventDate = parseDt(ev.event_date);
                    return eventDate >= dateFrom && eventDate <= dateTo;
                });

                if (deliveredEvents.length === 0) return null;

                // Extract timeline (same logic as filter-delivered-shipments.js)
                const byAsc  = [...historyEvents].sort((a, b) => parseDt(a.event_date) - parseDt(b.event_date));
                const byDesc = [...byAsc].reverse();

                const firstHub     = byAsc.find(ev  => (ev.event_name || '').toLowerCase().match(/hub|facility|arrival|scan/));
                const ofd          = byAsc.find(ev  => (ev.event_name || '').toLowerCase().match(/ofd|out.*delivery/));
                const firstAttempt = byAsc.find(ev  => (ev.event_name || '').toLowerCase().includes('attempt'));
                const lastAttempt  = byDesc.find(ev => (ev.event_name || '').toLowerCase().includes('attempt'));
                const delivered    = byDesc.find(ev => (ev.event_name || '').toLowerCase() === 'delivered');

                return {
                    ...row,
                    filter_status:          'kept',
                    first_hub_scan:         firstHub?.event_date     || '',
                    ofd_time:               ofd?.event_date          || '',
                    first_delivery_attempt: firstAttempt?.event_date || '',
                    last_delivery_attempt:  lastAttempt?.event_date  || '',
                    delivered_time:         delivered?.event_date     || '',
                };
            } catch (e) {
                console.error(`\n  Error for track ${trackNumber}: ${e.message}`);
                return null;
            }
        }));
        return batchResults.filter(Boolean);
    });

    console.log(`  → ${results.length} delivered shipments kept`);
    await sendTg(`[2/5] ✅ Delivered Filter\n→ ${results.length} / ${rows.length} delivered within window`);
    return results;
}

// ---- STEP 3: Courier Enrichment (Shipsy) ----
async function step3(rows) {
    console.log(`\n[Step 3] Courier Enrichment — ${rows.length} shipments`);

    const results = await processBatches('Shipments', rows, 20, async (batch) => {
        const batchResults = await Promise.all(batch.map(async (row) => {
            const trackNumber = row.track_number;
            if (!trackNumber) return { ...row, courier_status: 'skipped_no_track_number' };

            try {
                const response = await axios.get('https://app.shipsy.in/api/client/integration/consignment/track', {
                    params: { reference_number: trackNumber },
                    headers: { 'api-key': SHIPSY_API_KEY, 'Content-Type': 'application/json' },
                    timeout: REQUEST_TIMEOUT
                });

                const events = response.data?.events;
                if (!response.data) return { ...row, courier_status: 'skipped_no_api_response' };

                const deliveredEvent = Array.isArray(events) ? events.find(ev => ev.type === 'delivered') : null;
                if (!deliveredEvent) return { ...row, courier_status: 'skipped_no_delivered_event' };

                // Timeline (same logic as process-couriers.js)
                const byAsc  = Array.isArray(events) ? [...events].sort((a, b) => new Date(a.event_time_utc || 0) - new Date(b.event_time_utc || 0)) : [];
                const byDesc = [...byAsc].reverse();

                const firstHub     = byAsc.find(ev  => { const t = (ev.type||'').toLowerCase(), n = (ev.event_name||'').toLowerCase(); return t.includes('reachedathub')||t.includes('hub')||t.includes('scan')||n.includes('hub')||n.includes('scan')||n.includes('arrival'); });
                const ofd          = byAsc.find(ev  => { const t = (ev.type||'').toLowerCase(), se = (ev.status_external||'').toLowerCase(), n = (ev.event_name||'').toLowerCase(); return t.includes('accept')||t.includes('ofd')||se.includes('out for delivery')||n.includes('out for delivery'); });
                const firstAttempt = byAsc.find(ev  => { const t = (ev.type||'').toLowerCase(), n = (ev.event_name||'').toLowerCase(); return t.includes('attempt')||n.includes('attempt'); });
                const lastAttempt  = byDesc.find(ev => { const t = (ev.type||'').toLowerCase(), n = (ev.event_name||'').toLowerCase(); return t.includes('attempt')||n.includes('attempt'); });
                const deliveredTl  = byDesc.find(ev => (ev.type||'').toLowerCase() === 'delivered' || (ev.event_name||'').toLowerCase() === 'delivered');

                const deliveryRiyadh = toRiyadhTime(deliveredEvent.event_time_utc);
                const [delivery_date, delivery_time] = deliveryRiyadh ? deliveryRiyadh.split(' ') : ['', ''];

                return {
                    ...row,
                    courier_status:  'found',
                    worker_name:     deliveredEvent.worker_name    || '',
                    worker_code:     deliveredEvent.worker_code    || '',
                    worker_phone:    deliveredEvent.worker_phone   || '',
                    vehicle_number:  deliveredEvent.vehicle_number || '',
                    hub_name:        deliveredEvent.hub_name       || '',
                    hub_code:        deliveredEvent.hub_code       || '',
                    location:        deliveredEvent.location       || '',
                    delivery_date,
                    delivery_time,
                    first_hub_scan_time_riyadh:            toRiyadhTime(firstHub?.event_time_utc),
                    ofd_time_riyadh:                       toRiyadhTime(ofd?.event_time_utc),
                    first_delivery_attempt_time_riyadh:    toRiyadhTime(firstAttempt?.event_time_utc),
                    last_delivery_attempt_time_riyadh:     toRiyadhTime(lastAttempt?.event_time_utc),
                    delivered_time_riyadh:                 toRiyadhTime(deliveredTl?.event_time_utc),
                };
            } catch (e) {
                console.error(`\n  Error for track ${trackNumber}: ${e.message}`);
                return { ...row, courier_status: 'error', courier_error: e.message };
            }
        }));
        return batchResults;
    });

    const found = results.filter(r => r.courier_status === 'found').length;
    console.log(`  → ${found}/${results.length} courier records found`);
    await sendTg(`[3/5] ✅ Courier Enrichment\n→ ${found} / ${results.length} courier records found`);
    return results;
}

// ---- STEP 4: Merge Typebot CSAT into Shipments ----
async function step4(shipmentRows, typebotRows) {
    console.log(`\n[Step 4] Merge CSAT — ${shipmentRows.length} shipments × ${typebotRows.length} survey responses`);

    // Build map: normalizedMobile → [typebotRow, ...]
    const csatMap = new Map();
    for (const row of typebotRows) {
        const key = normalizeMobile(row['Mobile'] || row['mobile'] || '');
        if (!key) continue;
        if (!csatMap.has(key)) csatMap.set(key, []);
        csatMap.get(key).push(row);
    }

    const results = [];
    let matchCount = 0;

    for (const shipment of shipmentRows) {
        const key     = normalizeMobile(shipment._cleanMobile || shipment.mobile || shipment.consignee_phone || '');
        const matches = csatMap.get(key) || [];

        if (matches.length === 0) {
            results.push({ ...shipment });
        } else {
            matchCount++;
            for (const csat of matches) {
                results.push({
                    ...shipment,
                    SubmittedAt:         csat['SubmittedAt']         || '',
                    NPS:                 csat['NPS']                 || '',
                    CSAT_Overall:        csat['CSAT_Overall']        || '',
                    SpeedOfDelivery:     csat['SpeedOfDelivery']     || '',
                    ShipmentCondition:   csat['ShipmentCondition']   || '',
                    CourierBehavior:     csat['CourierBehavior']     || '',
                    COD:                 csat['COD']                 || '',
                    Verbatim_Improvment: csat['Verbatim_Improvment'] || '',
                    COD_Verbatim:        csat['COD_Verbatim']        || '',
                    COD_Issue:           csat['COD_Issue']           || '',
                });
            }
        }
    }

    console.log(`  → ${results.length} rows after merge (${matchCount} mobiles matched)`);
    await sendTg(`[4/5] ✅ CSAT Merge\n→ ${matchCount} mobiles matched → ${results.length} rows`);
    return results;
}

// ---- STEP 5: Smart Dedup (closest delivery to survey submission) ----
async function step5(rows) {
    console.log(`\n[Step 5] Smart Dedup — ${rows.length} rows`);

    // Group by normalized mobile
    const groups   = new Map();
    const noMobile = [];

    for (const row of rows) {
        const key = normalizeMobile(row._cleanMobile || row.mobile || row.consignee_phone || '');
        if (!key) { noMobile.push(row); continue; }
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    const results = [...noMobile];

    for (const [, groupRows] of groups.entries()) {
        if (groupRows.length === 1) {
            results.push(groupRows[0]);
            continue;
        }

        // Try to pick the row whose delivery is closest to the survey submission
        let bestRow  = groupRows[groupRows.length - 1]; // fallback: last row
        let bestDiff = Infinity;

        for (const row of groupRows) {
            const submittedAt   = String(row['SubmittedAt'] || '');
            const deliveryDate  = String(row['delivery_date'] || (row['delivered_time_riyadh'] || '').split(' ')[0] || '');
            const deliveryTime  = String(row['delivery_time'] || (row['delivered_time_riyadh'] || '').split(' ')[1] || '00:00:00');

            if (!submittedAt || !deliveryDate) continue;

            const surveyDt   = new Date(submittedAt.replace(' ', 'T'));
            const deliveryDt = new Date(`${deliveryDate}T${deliveryTime}`);

            if (isNaN(surveyDt.getTime()) || isNaN(deliveryDt.getTime())) continue;

            const diff = Math.abs(surveyDt.getTime() - deliveryDt.getTime());
            if (diff < bestDiff) {
                bestDiff = diff;
                bestRow  = row;
            }
        }

        results.push(bestRow);
    }

    console.log(`  → ${results.length} rows after dedup (removed ${rows.length - results.length})`);
    await sendTg(`[5/5] ✅ Dedup\n→ ${results.length} final rows (${rows.length - results.length} removed)`);
    return results;
}

// ---- MAIN ----
async function main() {
    console.log('============================================================');
    console.log('  CSAT Pipeline');
    console.log(`  Input:  ${csvPath}`);
    console.log(`  Date:   ${dateLabel}`);
    console.log(`  Output: ${outputPath}`);
    console.log('============================================================');

    // Read Typebot CSV as UTF-8 string first (avoids SheetJS codepage misdetection)
    let csvContent = fs.readFileSync(csvPath, 'utf8');
    // Strip UTF-8 BOM if present
    if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);
    const workbook    = XLSX.read(csvContent, { type: 'string' });
    const sheet       = workbook.Sheets[workbook.SheetNames[0]];
    const typebotRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // SheetJS auto-converts date strings to Excel serial numbers — convert back to strings
    for (const row of typebotRows) {
        if (typeof row['SubmittedAt'] === 'number') {
            row['SubmittedAt'] = serialToDatetimeString(row['SubmittedAt']);
        }
    }

    console.log(`\nLoaded ${typebotRows.length} Typebot survey responses`);

    if (typebotRows.length === 0) {
        console.log('No survey responses. Exiting.');
        process.exit(0);
    }

    const s1 = await step1(typebotRows);
    if (s1.length === 0) { console.error('\nStep 1 returned 0 shipments. Exiting.'); process.exit(1); }

    const s2 = await step2(s1, dateLabel);
    if (s2.length === 0) { console.error('\nStep 2 returned 0 delivered shipments. Exiting.'); process.exit(1); }

    const s3 = await step3(s2);
    const s4 = await step4(s3, typebotRows);
    const s5 = await step5(s4);

    // Remove internal fields + format SubmittedAt for display
    const finalRows = s5.map(({ _cleanMobile, ...rest }) => {
        if (rest.SubmittedAt) rest.SubmittedAt = formatSubmittedAt(String(rest.SubmittedAt));
        return rest;
    });

    // Print stats for scheduler.js to parse
    console.log('PIPELINE_STATS:' + JSON.stringify({
        s1_shipments: s1.length,
        s2_delivered: s2.length,
        s3_total:     s3.length,
        s4_rows:      s4.length,
        s5_final:     finalRows.length,
    }));

    // Write Excel
    const outSheet    = XLSX.utils.json_to_sheet(finalRows);
    const outWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outWorkbook, outSheet, 'Results');
    XLSX.writeFile(outWorkbook, outputPath);

    console.log('\n============================================================');
    console.log(`  Done! Total rows: ${finalRows.length}`);
    console.log(`  Saved to: ${outputPath}`);
    console.log('============================================================');
}

main().catch(e => {
    console.error('\nPipeline failed:', e.message);
    process.exit(1);
});
