import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.NJSPC_URL || 'http://localhost:4200';
const OUTPUT_FILE = process.argv[2] || 'snapshot.json';

function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function captureSnapshot() {
    console.log(`Capturing snapshot from ${BASE_URL}...`);

    const [configRaw, stateRaw] = await Promise.all([
        httpGet(`${BASE_URL}/config`),
        httpGet(`${BASE_URL}/state/all`),
    ]);

    let valueMapsRaw: string;
    try {
        valueMapsRaw = await httpGet(`${BASE_URL}/app/diagnostics/valueMaps`);
    } catch {
        console.warn('Warning: /app/diagnostics/valueMaps not available; valueMaps section will be empty.');
        valueMapsRaw = '{}';
    }

    const snapshot = {
        capturedAt: new Date().toISOString(),
        config: JSON.parse(configRaw),
        state: JSON.parse(stateRaw),
        valueMaps: JSON.parse(valueMapsRaw),
    };

    const outPath = path.resolve(OUTPUT_FILE);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log(`Snapshot written to ${outPath}`);
    console.log(`  config keys: ${Object.keys(snapshot.config).length}`);
    console.log(`  state keys:  ${Object.keys(snapshot.state).length}`);
    console.log(`  valueMaps:   ${Object.keys(snapshot.valueMaps).length} maps`);
}

captureSnapshot().catch((err) => {
    console.error(`Error capturing snapshot: ${err.message}`);
    process.exit(1);
});
