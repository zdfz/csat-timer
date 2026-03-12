// ============================================================
// CSAT Daily Scheduler
// Runs at midnight Riyadh time (Asia/Riyadh) via node-cron
// Managed by PM2 — stays alive permanently
//
// Usage:
//   pm2 start scheduler.js --name typebot-csat
//   pm2 save
// ============================================================

import 'dotenv/config';
import cron       from 'node-cron';
import axios      from 'axios';
import FormData   from 'form-data';
import * as fs    from 'fs';
import * as path  from 'path';
import { fileURLToPath } from 'url';
import { execFile }      from 'child_process';
import { promisify }     from 'util';

const execFileAsync = promisify(execFile);
const __dirname     = path.dirname(fileURLToPath(import.meta.url));

// ---- Config ----
const TYPEBOT_API_BASE = 'https://bot.ikb.sa/api/v1';
const TYPEBOT_ID       = 'cdb3f4rfzq2726dfgmegjrq4';
const TYPEBOT_TOKEN    = process.env.TYPEBOT_TOKEN;
const EXPORT_DIR       = process.env.EXPORT_DIR       || 'C:/Users/Abdulrhman/TypebotExports';
const TG_BOT_TOKEN     = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID       = process.env.TG_CHAT_ID;
const NODE_EXE         = process.execPath;
const PIPELINE_JS      = path.join(__dirname, 'pipeline.js');
const PAGE_LIMIT       = 100;

// ---- Utilities ----

// Convert UTC ISO string → Riyadh local Date (UTC+3)
function toRiyadhDate(utcString) {
    const d = new Date(utcString);
    return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}

// Format a Date → 'YYYY-MM-DD HH:MM:SS'
function formatDatetime(d) {
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

// Get yesterday's date label in Riyadh time → 'YYYY-MM-DD'
function getYesterdayLabel() {
    const nowRiyadh = toRiyadhDate(new Date().toISOString());
    nowRiyadh.setDate(nowRiyadh.getDate() - 1);
    return nowRiyadh.toISOString().slice(0, 10);
}

// Riyadh current time as HH:MM string
function riyadhHHMM() {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().substring(11, 16) + ' AST';
}

// Log with timestamp
function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---- Typebot API ----

async function fetchTypebotResults(dateLabel) {
    const dayStart = new Date(`${dateLabel}T00:00:00+03:00`); // midnight Riyadh
    const dayEnd   = new Date(`${dateLabel}T23:59:59+03:00`); // end of day Riyadh

    const headers = {
        Accept:        'application/json',
        Authorization: `Bearer ${TYPEBOT_TOKEN}`
    };

    const allResults = [];
    let cursor = null;

    do {
        let url = `${TYPEBOT_API_BASE}/typebots/${TYPEBOT_ID}/results?limit=${PAGE_LIMIT}`;
        if (cursor) url += `&cursor=${cursor}`;

        const resp  = await axios.get(url, { headers, timeout: 15000 });
        const batch = resp.data.results || [];
        if (batch.length === 0) break;

        for (const r of batch) {
            const createdAt = new Date(r.createdAt); // UTC — dayStart/dayEnd are already UTC boundaries
            if (createdAt >= dayStart && createdAt <= dayEnd) {
                allResults.push(r);
            }
        }

        // Stop paginating once we've passed the start of the target day
        const earliestCreatedAt = new Date(batch[batch.length - 1].createdAt);
        if (earliestCreatedAt < dayStart) break;

        cursor = resp.data.nextCursor || null;
    } while (cursor);

    return allResults;
}

// Build one CSV row from a Typebot result object
function buildRow(r) {
    const vars = {};
    for (const v of (r.variables || [])) {
        if (v.name) vars[v.name.trim()] = v.value != null ? String(v.value) : '';
    }

    const submittedAt = formatDatetime(toRiyadhDate(r.createdAt));

    return {
        SubmittedAt:         submittedAt,
        NPS:                 vars['NPS']                 || '',
        CSAT_Overall:        vars['CSAT_Overall']        || '',
        SpeedOfDelivery:     vars['Speed of Delivery']   || '',
        ShipmentCondition:   vars['Shipment Condition']  || '',
        CourierBehavior:     vars['Courier Behavior']    || '',
        COD:                 vars['COD?']                || '',
        Verbatim_Improvment: vars['Verbatim_Improvment'] || '',
        COD_Verbatim:        vars['COD Verbatim']        || '',
        Mobile:              vars['Mobile']              || '',
        COD_Issue:           vars['COD Issue?']          || '',
    };
}

// ---- CSV Writer (UTF-8 BOM for Arabic in Excel) ----

function writeCSV(rows, filePath) {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escape  = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines   = [
        headers.map(escape).join(','),
        ...rows.map(r => headers.map(h => escape(r[h])).join(','))
    ];
    const BOM = '\uFEFF';
    fs.writeFileSync(filePath, BOM + lines.join('\r\n'), 'utf8');
}

// ---- Telegram helpers ----

async function sendTelegramMessage(text) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
            { chat_id: TG_CHAT_ID, text },
            { timeout: 15000 }
        );
    } catch (e) {
        log(`Telegram message failed: ${e.message}`);
    }
}

async function sendTelegramFile(filePath, caption) {
    try {
        const form = new FormData();
        form.append('chat_id',  TG_CHAT_ID);
        form.append('caption',  caption);
        form.append('document', fs.createReadStream(filePath));
        await axios.post(
            `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`,
            form,
            { headers: form.getHeaders(), timeout: 60000 }
        );
        log(`Telegram file sent: ${path.basename(filePath)}`);
    } catch (e) {
        log(`Telegram file upload failed: ${e.message}`);
    }
}

// ---- Compute averages ----

function avg(rows, col) {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (vals.length === 0) return 'N/A';
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2);
}

// ---- Concurrency guard (prevent overlapping runs) ----
let isRunning = false;

// ---- Main pipeline run ----

async function run() {
    if (isRunning) {
        log('Pipeline already running — skipping this trigger.');
        return;
    }
    isRunning = true;

    log('============================================================');
    log('CSAT Daily Pipeline starting...');

    try {
        const dateLabel = getYesterdayLabel();

        log(`Date: ${dateLabel}`);

        // 1. Fetch Typebot results
        log('Fetching Typebot results...');
        const results = await fetchTypebotResults(dateLabel);
        log(`Found ${results.length} survey response(s) for ${dateLabel}`);

        if (results.length === 0) {
            await sendTelegramMessage(
                `Typebot Daily Export\nDate: ${dateLabel}\nNo survey responses found for yesterday.`
            );
            log('No results. Done.');
            return; // finally block will still run and release the lock
        }

        // 2. Build rows and write CSV
        const rows    = results.map(buildRow);
        const csvPath = path.join(EXPORT_DIR, `results_${dateLabel}.csv`);
        writeCSV(rows, csvPath);
        log(`CSV saved: ${csvPath}`);

        // 3. Send start notification
        await sendTelegramMessage(
            `🚀 CSAT Pipeline Started\n` +
            `📅 Date: ${dateLabel}\n` +
            `📊 Survey Responses: ${results.length}\n` +
            `⏰ ${riyadhHHMM()}`
        );

        // 4. Run pipeline.js as child process
        log('Running pipeline.js...');
        const pipelineStart = Date.now();
        const { stdout, stderr } = await execFileAsync(
            NODE_EXE,
            [PIPELINE_JS, csvPath, dateLabel],
            {
                cwd: __dirname,
                timeout: 10 * 60 * 1000,
                env: { ...process.env, TG_BOT_TOKEN, TG_CHAT_ID }
            }
        );
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);

        // 5. Compute duration
        const durationSec = Math.round((Date.now() - pipelineStart) / 1000);
        const duration = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

        // 6. Parse pipeline stats from stdout
        const statsMatch = stdout.match(/PIPELINE_STATS:(\{[^\n]+\})/);
        const pstats = statsMatch ? JSON.parse(statsMatch[1]) : null;

        // 7. Compute NPS breakdown from survey rows
        const npsRows    = rows.filter(r => r.NPS !== '');
        const promoters  = npsRows.filter(r => parseFloat(r.NPS) >= 9).length;
        const passives   = npsRows.filter(r => { const v = parseFloat(r.NPS); return v >= 7 && v < 9; }).length;
        const detractors = npsRows.filter(r => parseFloat(r.NPS) < 7).length;
        const npsTotal   = promoters + passives + detractors;
        const pct        = n => npsTotal ? Math.round(n / npsTotal * 100) : 0;
        const npsScore   = pct(promoters) - pct(detractors);

        // 8. Build rich final caption
        const excelPath = path.join(EXPORT_DIR, `pipeline_${dateLabel}.xlsx`);
        const avgCSAT   = avg(rows, 'CSAT_Overall');
        const avgNPS    = avg(rows, 'NPS');

        const captionLines = [
            '✅ CSAT Pipeline Complete',
            `📅 ${dateLabel}  |  ⏱ ${duration}`,
            '',
            `📊 Responses: ${results.length}`,
            `⭐ Avg CSAT: ${avgCSAT} / 5`,
            `📈 Avg NPS:  ${avgNPS} / 10`,
            '',
            'NPS Breakdown:',
            `👍 Promoters (9-10): ${pct(promoters)}% — ${promoters}`,
            `😐 Passives  (7-8):  ${pct(passives)}% — ${passives}`,
            `👎 Detractors (0-6): ${pct(detractors)}% — ${detractors}`,
            `🏆 NPS Score: ${npsScore >= 0 ? '+' : ''}${npsScore}`,
        ];
        if (pstats) {
            captionLines.push('');
            captionLines.push(`📦 ${pstats.s1_shipments} shipments → ${pstats.s2_delivered} delivered → ${pstats.s5_final} final rows`);
        }
        const caption = captionLines.join('\n');

        if (fs.existsSync(excelPath)) {
            await sendTelegramFile(excelPath, caption);
        } else {
            log('Pipeline did not produce Excel — sending raw CSV as fallback.');
            await sendTelegramFile(csvPath, caption + '\n⚠️ (pipeline failed — raw CSV attached)');
        }

        log('Pipeline complete!');
    } catch (err) {
        log(`ERROR: ${err.message}`);
        try {
            await sendTelegramMessage(
                `❌ CSAT Pipeline ERROR\n` +
                `📅 Date: ${dateLabel}\n` +
                `🔴 ${err.message}\n` +
                `⏰ ${riyadhHHMM()}`
            );
        } catch (_) { /* ignore */ }
    } finally {
        isRunning = false;
    }

    log('============================================================');
}

// ---- Run mode ----
if (process.argv.includes('--now')) {
    // One-shot mode: used by GitHub Actions (cron handled externally)
    log('Running in one-shot mode (--now)...');
    run().then(() => {
        log('Done. Exiting.');
        process.exit(0);
    }).catch(e => {
        console.error('Fatal:', e.message);
        process.exit(1);
    });
} else {
    // Scheduler mode: used by PM2 (cron runs inside this process)
    cron.schedule('0 0 * * *', run, { timezone: 'Asia/Riyadh' });

    log('Scheduler started. Will run daily at midnight Riyadh time (Asia/Riyadh).');
    log(`Pipeline script: ${PIPELINE_JS}`);
    log(`Export folder:   ${EXPORT_DIR}`);
    log('');
    log('Useful commands:');
    log('  pm2 logs typebot-csat    → view logs');
    log('  pm2 status               → check status');
    log('  pm2 restart typebot-csat → restart after changes');
}
