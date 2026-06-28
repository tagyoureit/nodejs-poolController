/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import * as fs from 'fs';
import * as path from 'path';

const VOLATILE_FIELDS = new Set([
    'capturedAt', 'time', 'lastUpdated', 'uptime', 'startTime', 'lastComm',
    'emitDirty', 'freeze', 'temp', 'rpm', 'gpm', 'watts', 'status',
    'isOn', 'saltLevel', 'heatStatus', 'registration', 'mode',
]);

const WS_ONLY_FIELDS = new Set(['objnam']);

interface DiffResult {
    path: string;
    type: 'added' | 'removed' | 'changed';
    before?: any;
    after?: any;
}

function isVolatile(fieldPath: string): boolean {
    const parts = fieldPath.split('.');
    const leaf = parts[parts.length - 1];
    return VOLATILE_FIELDS.has(leaf);
}

function isWSOnly(fieldPath: string): boolean {
    const parts = fieldPath.split('.');
    const leaf = parts[parts.length - 1];
    return WS_ONLY_FIELDS.has(leaf);
}

function deepDiff(a: any, b: any, prefix: string, results: DiffResult[]): void {
    if (a === b) return;
    if (a === null || b === null || typeof a !== typeof b) {
        if (!isVolatile(prefix) && !isWSOnly(prefix)) {
            results.push({ path: prefix, type: 'changed', before: a, after: b });
        }
        return;
    }
    if (typeof a !== 'object') {
        if (a !== b && !isVolatile(prefix) && !isWSOnly(prefix)) {
            results.push({ path: prefix, type: 'changed', before: a, after: b });
        }
        return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
            const p = `${prefix}[${i}]`;
            if (i >= a.length) {
                if (!isVolatile(p) && !isWSOnly(p)) results.push({ path: p, type: 'added', after: b[i] });
            } else if (i >= b.length) {
                if (!isVolatile(p) && !isWSOnly(p)) results.push({ path: p, type: 'removed', before: a[i] });
            } else {
                deepDiff(a[i], b[i], p, results);
            }
        }
        return;
    }
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
        const p = prefix ? `${prefix}.${key}` : key;
        if (!(key in a)) {
            if (!isVolatile(p) && !isWSOnly(p)) results.push({ path: p, type: 'added', after: b[key] });
        } else if (!(key in b)) {
            if (!isVolatile(p) && !isWSOnly(p)) results.push({ path: p, type: 'removed', before: a[key] });
        } else {
            deepDiff(a[key], b[key], p, results);
        }
    }
}

function groupByDomain(diffs: DiffResult[]): Map<string, DiffResult[]> {
    const groups = new Map<string, DiffResult[]>();
    for (const d of diffs) {
        const domain = d.path.split('.')[0] || 'root';
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain)!.push(d);
    }
    return groups;
}

function truncateValue(val: any, maxLen = 80): string {
    const s = JSON.stringify(val);
    return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

const args = process.argv.slice(2);
const defaultBaseline = path.resolve(__dirname, '../test/golden/fixtures/v3-init/poolConfig.json');
const baselinePath = args[0] ? path.resolve(args[0]) : defaultBaseline;
const wsSnapshotPath = args[1] ? path.resolve(args[1]) : path.resolve('data/poolConfig.json');

if (!fs.existsSync(baselinePath)) { console.error(`RS-485 baseline not found: ${baselinePath}`); process.exit(2); }
if (!fs.existsSync(wsSnapshotPath)) { console.error(`WS snapshot not found: ${wsSnapshotPath}`); process.exit(2); }

console.log(`RS-485 baseline: ${baselinePath}`);
console.log(`WS snapshot:     ${wsSnapshotPath}`);
console.log();

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const wsSnapshot = JSON.parse(fs.readFileSync(wsSnapshotPath, 'utf8'));

const diffs: DiffResult[] = [];
deepDiff(baseline, wsSnapshot, '', diffs);

if (diffs.length === 0) {
    console.log('No differences found (volatile + WS-only fields excluded).');
    process.exit(0);
}

const grouped = groupByDomain(diffs);
console.log(`=== RS-485 vs WS Diff: ${diffs.length} difference(s) ===\n`);
for (const [domain, domainDiffs] of grouped) {
    console.log(`--- ${domain} (${domainDiffs.length} diff(s)) ---`);
    for (const d of domainDiffs) {
        switch (d.type) {
            case 'added':
                console.log(`  + ${d.path}: ${truncateValue(d.after)}`);
                break;
            case 'removed':
                console.log(`  - ${d.path}: ${truncateValue(d.before)}`);
                break;
            case 'changed':
                console.log(`  ~ ${d.path}: ${truncateValue(d.before)} -> ${truncateValue(d.after)}`);
                break;
        }
    }
    console.log();
}

console.log(`Total: ${diffs.length} difference(s) across ${grouped.size} domain(s).`);
process.exit(diffs.length > 0 ? 1 : 0);
