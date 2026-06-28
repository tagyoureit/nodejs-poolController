import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { io, Socket } from 'socket.io-client';

const BASE_URL = process.env.NJSPC_URL || 'http://localhost:4200';
const GOLDEN_DIR = process.argv.includes('--golden')
    ? process.argv[process.argv.indexOf('--golden') + 1]
    : undefined;
const OUTPUT_DIR = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : undefined;
const SETTLE_MS = parseInt(process.env.SETTLE_MS || '3000', 10);

interface CapturedMessage {
    direction: string;
    protocol: string;
    header: number[];
    payload: number[];
    term: number[];
    action: number;
    source: number;
    dest: number;
}

interface CommandStep {
    name: string;
    method: 'GET' | 'PUT' | 'POST';
    path: string;
    body?: any;
}

const COMMAND_SEQUENCE: CommandStep[] = [
    { name: 'toggle-circuit-1', method: 'PUT', path: '/state/circuit/setState', body: { id: 1, state: true } },
    { name: 'set-pool-heat-84', method: 'PUT', path: '/state/body/heatSetpoint', body: { id: 1, heatSetpoint: 84 } },
    { name: 'create-schedule', method: 'PUT', path: '/config/schedule', body: { id: 1, circuit: 1, startTime: 480, endTime: 1020, scheduleDays: 127, scheduleType: 0 } },
    { name: 'cancel-delay', method: 'PUT', path: '/state/cancelDelay', body: {} },
    { name: 'set-pump-speed-2500', method: 'PUT', path: '/config/pump', body: { id: 1, circuits: [{ circuit: 1, speed: 2500 }] } },
    { name: 'super-chlorinate', method: 'PUT', path: '/state/chlorinator/superChlorinate', body: { id: 1, superChlorinate: true, superChlorHours: 8 } },
    { name: 'set-light-mode', method: 'PUT', path: '/state/circuit/setTheme', body: { id: 1, theme: 1 } },
];

function httpRequest(method: string, url: string, body?: any): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode || 0, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMessage(msg: any): CapturedMessage {
    return {
        direction: msg.direction,
        protocol: msg.protocol,
        header: Array.isArray(msg.header) ? msg.header : [],
        payload: Array.isArray(msg.payload) ? msg.payload : [],
        term: Array.isArray(msg.term) ? msg.term : [],
        action: msg.action,
        source: msg.source,
        dest: msg.dest,
    };
}

async function main() {
    console.log(`Connecting to ${BASE_URL}...`);
    const socket: Socket = io(BASE_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
            console.log('Connected to socket.io');
            resolve();
        });
        socket.on('connect_error', (err) => reject(new Error(`Socket connect error: ${err.message}`)));
        setTimeout(() => reject(new Error('Socket connection timeout')), 10000);
    });

    socket.emit('sendLogMessages', true);
    await sleep(500);

    const allOutbound: { step: string; messages: CapturedMessage[] }[] = [];
    let currentCapture: CapturedMessage[] = [];

    socket.on('logMessage', (msg: any) => {
        if (msg.direction === 'out') {
            currentCapture.push(normalizeMessage(msg));
        }
    });

    for (const step of COMMAND_SEQUENCE) {
        console.log(`  Executing: ${step.name} (${step.method} ${step.path})...`);
        currentCapture = [];

        try {
            const result = await httpRequest(step.method, `${BASE_URL}${step.path}`, step.body);
            if (result.status >= 400) {
                console.warn(`    Warning: ${step.name} returned HTTP ${result.status}`);
            }
        } catch (err: any) {
            console.warn(`    Warning: ${step.name} failed: ${err.message}`);
        }

        await sleep(SETTLE_MS);
        allOutbound.push({ step: step.name, messages: [...currentCapture] });
        console.log(`    Captured ${currentCapture.length} outbound message(s)`);
    }

    socket.emit('sendLogMessages', false);
    socket.disconnect();

    const transcript = {
        capturedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        settleMs: SETTLE_MS,
        steps: allOutbound,
    };

    if (OUTPUT_DIR) {
        const outDir = path.resolve(OUTPUT_DIR);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'transcript.json'), JSON.stringify(transcript, null, 2));
        console.log(`\nTranscript written to ${outDir}/transcript.json`);
    }

    if (GOLDEN_DIR) {
        const goldenPath = path.resolve(GOLDEN_DIR, 'transcript.json');
        if (!fs.existsSync(goldenPath)) {
            console.error(`Golden transcript not found: ${goldenPath}`);
            if (!OUTPUT_DIR) {
                const fallback = path.resolve(GOLDEN_DIR);
                fs.mkdirSync(fallback, { recursive: true });
                fs.writeFileSync(path.join(fallback, 'transcript.json'), JSON.stringify(transcript, null, 2));
                console.log(`Created initial golden transcript at ${goldenPath}`);
            }
            process.exit(0);
        }

        const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
        let hasDiff = false;

        for (let i = 0; i < COMMAND_SEQUENCE.length; i++) {
            const stepName = COMMAND_SEQUENCE[i].name;
            const goldenStep = golden.steps?.find((s: any) => s.step === stepName);
            const actualStep = transcript.steps.find((s) => s.step === stepName);

            if (!goldenStep) {
                console.log(`  [SKIP] ${stepName}: not in golden transcript`);
                continue;
            }
            if (!actualStep) {
                console.log(`  [MISS] ${stepName}: not in actual transcript`);
                hasDiff = true;
                continue;
            }

            const goldenMsgs = goldenStep.messages || [];
            const actualMsgs = actualStep.messages || [];

            if (goldenMsgs.length !== actualMsgs.length) {
                console.log(`  [DIFF] ${stepName}: message count ${goldenMsgs.length} → ${actualMsgs.length}`);
                hasDiff = true;
                continue;
            }

            let stepDiff = false;
            for (let j = 0; j < goldenMsgs.length; j++) {
                const g = goldenMsgs[j];
                const a = actualMsgs[j];
                if (JSON.stringify(g.header) !== JSON.stringify(a.header) ||
                    JSON.stringify(g.payload) !== JSON.stringify(a.payload)) {
                    console.log(`  [DIFF] ${stepName} msg[${j}]:`);
                    console.log(`    golden:  header=${JSON.stringify(g.header)} payload=${JSON.stringify(g.payload)}`);
                    console.log(`    actual:  header=${JSON.stringify(a.header)} payload=${JSON.stringify(a.payload)}`);
                    stepDiff = true;
                }
            }

            if (stepDiff) hasDiff = true;
            else console.log(`  [PASS] ${stepName}: ${goldenMsgs.length} message(s) match`);
        }

        if (hasDiff) {
            console.log('\nFAIL: Outbound transcript differs from golden.');
            process.exit(1);
        } else {
            console.log('\nPASS: Outbound transcript matches golden.');
            process.exit(0);
        }
    }

    if (!OUTPUT_DIR && !GOLDEN_DIR) {
        console.log(JSON.stringify(transcript, null, 2));
    }
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
