import * as fs from 'fs';
import * as path from 'path';

const VOLATILE_FIELDS = new Set([
    'capturedAt',
    'time',
    'lastUpdated',
    'uptime',
    'startTime',
    'lastComm',
    'emitDirty',
    'freeze',
]);

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

function deepDiff(a: any, b: any, prefix: string, results: DiffResult[]): void {
    if (a === b) return;
    if (a === null || b === null || typeof a !== typeof b) {
        if (!isVolatile(prefix)) {
            results.push({ path: prefix, type: 'changed', before: a, after: b });
        }
        return;
    }
    if (typeof a !== 'object') {
        if (a !== b && !isVolatile(prefix)) {
            results.push({ path: prefix, type: 'changed', before: a, after: b });
        }
        return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
            const p = `${prefix}[${i}]`;
            if (i >= a.length) {
                if (!isVolatile(p)) results.push({ path: p, type: 'added', after: b[i] });
            } else if (i >= b.length) {
                if (!isVolatile(p)) results.push({ path: p, type: 'removed', before: a[i] });
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
            if (!isVolatile(p)) results.push({ path: p, type: 'added', after: b[key] });
        } else if (!(key in b)) {
            if (!isVolatile(p)) results.push({ path: p, type: 'removed', before: a[key] });
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
if (args.length < 2) {
    console.error('Usage: npx ts-node scripts/diff-snapshots.ts <before.json> <after.json>');
    process.exit(2);
}

const beforePath = path.resolve(args[0]);
const afterPath = path.resolve(args[1]);

if (!fs.existsSync(beforePath)) { console.error(`File not found: ${beforePath}`); process.exit(2); }
if (!fs.existsSync(afterPath)) { console.error(`File not found: ${afterPath}`); process.exit(2); }

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

const diffs: DiffResult[] = [];
deepDiff(before, after, '', diffs);

if (diffs.length === 0) {
    console.log('No differences found (volatile fields excluded).');
    process.exit(0);
}

const grouped = groupByDomain(diffs);
console.log(`\n=== Snapshot Diff: ${diffs.length} difference(s) ===\n`);
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
                console.log(`  ~ ${d.path}: ${truncateValue(d.before)} → ${truncateValue(d.after)}`);
                break;
        }
    }
    console.log();
}

console.log(`Total: ${diffs.length} difference(s) across ${grouped.size} domain(s).`);
process.exit(1);
