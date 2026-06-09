import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  apiState: any;
  ocpState: Record<string, string>;
  error?: string;
  status: 'pass' | 'fail' | 'skip' | 'error';
}

export interface ComparisonEntry {
  id: string;
  name: string;
  category: string;
  rs485: TestResult | null;
  ws: TestResult | null;
  comparison: 'match' | 'discrepancy' | 'one-sided' | 'both-failed' | 'skipped';
  notes: string;
}

export interface TestReport {
  timestamp: string;
  transportsTested: string[];
  summary: { total: number; pass: number; fail: number; skip: number };
  tests: ComparisonEntry[];
  notAvailable: { id: string; reason: string }[];
}

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const ISSUES_DIR = path.resolve(__dirname, '..', '..', '..', '.plan');

export class Reporter {
  private entries: ComparisonEntry[] = [];
  private skipped: { id: string; reason: string }[] = [];

  addResult(entry: ComparisonEntry): void {
    this.entries.push(entry);
  }

  addSkip(id: string, reason: string): void {
    this.skipped.push({ id, reason });
  }

  getReport(): TestReport {
    const pass = this.entries.filter(e => e.comparison === 'match').length;
    const fail = this.entries.filter(e => e.comparison === 'discrepancy' || e.comparison === 'both-failed').length;
    const skip = this.entries.filter(e => e.comparison === 'skipped').length + this.skipped.length;

    return {
      timestamp: new Date().toISOString(),
      transportsTested: ['rs485', 'ocpws'],
      summary: { total: this.entries.length + this.skipped.length, pass, fail, skip },
      tests: this.entries,
      notAvailable: this.skipped,
    };
  }

  writeJsonReport(filename?: string): string {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    const report = this.getReport();
    const fname = filename || `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(REPORTS_DIR, fname);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    return filepath;
  }

  printConsoleReport(): void {
    const report = this.getReport();
    const line = '═'.repeat(72);
    console.log(`\n╔${line}╗`);
    console.log(`║  ICv3 Transport Comparison Test Results${' '.repeat(31)}║`);
    console.log(`╠════╦═══════════════════════════════╦═══════╦═══════╦════════════════╣`);
    console.log(`║ ID ║ Test                          ║ RS485 ║  WS   ║ Compare        ║`);
    console.log(`╠════╬═══════════════════════════════╬═══════╬═══════╬════════════════╣`);

    for (const entry of this.entries) {
      const id = entry.id.padEnd(4).slice(0, 4);
      const name = entry.name.padEnd(29).slice(0, 29);
      const rs = (entry.rs485?.status || 'skip').toUpperCase().padEnd(5).slice(0, 5);
      const ws = (entry.ws?.status || 'skip').toUpperCase().padEnd(5).slice(0, 5);
      const cmp = entry.comparison.toUpperCase().padEnd(14).slice(0, 14);
      console.log(`║${id}║ ${name} ║ ${rs} ║ ${ws} ║ ${cmp} ║`);
    }

    console.log(`╚════╩═══════════════════════════════╩═══════╩═══════╩════════════════╝`);
    console.log(`Summary: ${report.summary.pass}/${report.summary.total} PASS | ${report.summary.fail} FAIL | ${report.summary.skip} SKIP\n`);
  }

  logIssuesToPlanQA(): void {
    const failures = this.entries.filter(e => e.comparison === 'discrepancy');
    if (failures.length === 0) return;

    const issueFile = path.join(ISSUES_DIR, 'ISSUES-TEST.md');
    const header = fs.existsSync(issueFile) ? '' : '# Transport Comparison Test Issues\n\n';
    const timestamp = new Date().toISOString().split('T')[0];

    let content = header;
    for (const f of failures) {
      content += `## TEST-${f.id}: ${f.name} — transport discrepancy\n\n`;
      content += `| Field | Details |\n|---|---|\n`;
      content += `| **Test ID** | ${f.id} |\n`;
      content += `| **Category** | ${f.category} |\n`;
      content += `| **Date Found** | ${timestamp} |\n`;
      content += `| **RS-485 Result** | ${f.rs485?.status} — OCP: ${JSON.stringify(f.rs485?.ocpState)} |\n`;
      content += `| **WS Result** | ${f.ws?.status} — OCP: ${JSON.stringify(f.ws?.ocpState)} |\n`;
      content += `| **Notes** | ${f.notes} |\n\n---\n\n`;
    }

    if (fs.existsSync(issueFile)) {
      fs.appendFileSync(issueFile, content);
    } else {
      fs.writeFileSync(issueFile, content);
    }
  }
}
