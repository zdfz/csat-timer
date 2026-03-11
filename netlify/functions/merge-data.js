const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { mainData, secondaryData, mainMobileCol, secondaryMobileCol } = body;

        if (!Array.isArray(mainData) || !Array.isArray(secondaryData)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid input: mainData and secondaryData must be arrays' })
            };
        }

        // Helper to find mobile col if not provided
        const findMobileCol = (row) => {
            const aliases = ['mobile', 'consignee phone', 'phone', 'contact number', 'tel', 'consignee_phone'];
            const keys = Object.keys(row);
            return keys.find(k => aliases.includes(k.toLowerCase())) || keys.find(k => k.toLowerCase().includes('mobile'));
        };

        const effectiveMainCol = mainMobileCol || findMobileCol(mainData[0] || {});
        const effectiveSecCol = secondaryMobileCol || findMobileCol(secondaryData[0] || {});

        if (!effectiveMainCol) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not detect mobile column in main file' }) };
        }

        // Clean mobile function
        // Create robust normalization key for comparison
        const normalizeMobile = (val) => {
            if (!val) return '';

            // 1. Convert to string, lowercase, trim
            let s = String(val).toLowerCase().trim();

            // 2. Remove floating point .0 if present (excel artifact)
            if (s.endsWith('.0')) s = s.slice(0, -2);

            // 3. Remove all non-digit characters
            s = s.replace(/\D/g, '');

            // 4. Standardize Saudi format (assuming 9 digit core)
            // If starts with 05... (10 digits) -> 9665...
            if (s.startsWith('05') && s.length === 10) {
                return '966' + s.substring(1);
            }
            // If starts with 5... (9 digits) -> 9665...
            if (s.startsWith('5') && s.length === 9) {
                return '966' + s;
            }
            // If starts with 966... -> keep as is

            return s;
        };

        // Helper to get value case-insensitively if needed
        const getValue = (row, colName) => {
            if (row[colName] !== undefined) return row[colName];
            // Fallback: search keys case-insensitive
            const key = Object.keys(row).find(k => k.toLowerCase() === colName.toLowerCase());
            return key ? row[key] : undefined;
        };

        const secondaryMap = new Map();
        secondaryData.forEach(row => {
            const rawVal = getValue(row, effectiveSecCol);
            if (!rawVal) return;
            const key = normalizeMobile(rawVal);
            if (!secondaryMap.has(key)) {
                secondaryMap.set(key, []);
            }
            secondaryMap.get(key).push(row);
        });

        const results = [];
        let actualMatchCount = 0;

        // Debug collection
        const debugInfo = {
            sampleMainKeys: [],
            sampleSecKeys: Array.from(secondaryMap.keys()).slice(0, 5),
            secMapSize: secondaryMap.size,
            unmatchedSamples: []
        };

        mainData.forEach((mainRow, idx) => {
            const rawVal = getValue(mainRow, effectiveMainCol);
            const key = normalizeMobile(rawVal);

            if (idx < 5) debugInfo.sampleMainKeys.push({ raw: rawVal, normalized: key });

            const matches = secondaryMap.get(key);

            if (matches && matches.length > 0) {
                actualMatchCount += matches.length;
                // Cartesian product
                matches.forEach(match => {
                    const merged = { ...mainRow };
                    Object.keys(match).forEach(k => {
                        if (k === effectiveSecCol) return; // Skip key column from secondary
                        if (k in merged) {
                            merged[`${k}_secondary`] = match[k];
                        } else {
                            merged[k] = match[k];
                        }
                    });
                    results.push(merged);
                });
            } else {
                // No match, keep main row
                if (debugInfo.unmatchedSamples.length < 5) debugInfo.unmatchedSamples.push(key);
                results.push(mainRow);
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                results,
                meta: {
                    mainRows: mainData.length,
                    secondaryRows: secondaryData.length,
                    mergedRows: results.length,
                    matchCount: actualMatchCount,
                    debug: debugInfo
                }
            })
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
