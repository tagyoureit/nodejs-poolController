import { ApiClient } from './api-client';
import { OCPVerificationClient } from './ocp-ws-client';
import { restartNjsPC, stopNjsPC } from './njspc-lifecycle';
import { switchTransport, wipePoolData, backupConfig, restoreConfig, TransportMode } from './transport-toggle';
import { Reporter, TestResult, ComparisonEntry } from './reporter';

export interface TestOperation {
  id: string;
  name: string;
  category: string;
  skip?: boolean;
  skipReason?: string;
  write: (api: ApiClient) => Promise<any>;
  readApi: (api: ApiClient) => Promise<any>;
  readOcp: (ocp: OCPVerificationClient) => Promise<Record<string, string>>;
  revert?: (api: ApiClient) => Promise<void>;
  compare?: (rs485Ocp: Record<string, string>, wsOcp: Record<string, string>) => boolean;
}

export interface HarnessConfig {
  njspcHost: string;
  njspcPort: number;
  ocpHost: string;
  ocpPort: number;
  coldBootWaitMs: number;
  settleDelayMs: number;
}

const DEFAULT_CONFIG: HarnessConfig = {
  njspcHost: '127.0.0.1',
  njspcPort: 4200,
  ocpHost: '10.0.0.111',
  ocpPort: 6680,
  coldBootWaitMs: 90_000,
  settleDelayMs: 5000,
};

export class TestHarness {
  private api: ApiClient;
  private ocp: OCPVerificationClient;
  private reporter: Reporter;
  private config: HarnessConfig;

  constructor(config: Partial<HarnessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.api = new ApiClient({ host: this.config.njspcHost, port: this.config.njspcPort });
    this.ocp = new OCPVerificationClient({ host: this.config.ocpHost, port: this.config.ocpPort });
    this.reporter = new Reporter();
  }

  async setup(): Promise<void> {
    backupConfig();
    await this.ocp.connect();
  }

  async teardown(): Promise<void> {
    this.ocp.disconnect();
    await stopNjsPC();
    restoreConfig();
  }

  async runOperation(op: TestOperation): Promise<ComparisonEntry> {
    if (op.skip) {
      const entry: ComparisonEntry = {
        id: op.id, name: op.name, category: op.category,
        rs485: null, ws: null,
        comparison: 'skipped', notes: op.skipReason || 'skipped',
      };
      this.reporter.addResult(entry);
      return entry;
    }

    const rs485Result = await this.runOnTransport('rs485', op);
    const wsResult = await this.runOnTransport('ocpws', op);

    const comparison = this.compareResults(rs485Result, wsResult, op);

    const entry: ComparisonEntry = {
      id: op.id, name: op.name, category: op.category,
      rs485: rs485Result, ws: wsResult,
      comparison, notes: this.buildNotes(rs485Result, wsResult, comparison),
    };

    this.reporter.addResult(entry);
    return entry;
  }

  async runSingleTransport(mode: TransportMode, op: TestOperation): Promise<TestResult> {
    return this.runOnTransport(mode, op);
  }

  getReporter(): Reporter {
    return this.reporter;
  }

  private async runOnTransport(mode: TransportMode, op: TestOperation): Promise<TestResult> {
    try {
      switchTransport(mode);
      wipePoolData();

      const ready = await restartNjsPC(this.api, this.config.coldBootWaitMs);
      if (!ready) {
        return { apiState: null, ocpState: {}, status: 'error', error: `njsPC did not become ready in ${mode} mode` };
      }

      await sleep(this.config.settleDelayMs);

      await op.write(this.api);
      await sleep(2000);

      const apiState = await op.readApi(this.api);

      if (!this.ocp.isConnected()) {
        await this.ocp.connect();
      }
      const ocpState = await op.readOcp(this.ocp);

      if (op.revert) {
        try { await op.revert(this.api); } catch {}
      }

      return { apiState, ocpState, status: 'pass' };
    } catch (err: any) {
      return { apiState: null, ocpState: {}, status: 'fail', error: err.message || String(err) };
    }
  }

  private compareResults(rs485: TestResult, ws: TestResult, op: TestOperation): ComparisonEntry['comparison'] {
    if (rs485.status !== 'pass' && ws.status !== 'pass') return 'both-failed';
    if (rs485.status !== 'pass' || ws.status !== 'pass') return 'one-sided';

    if (op.compare) {
      return op.compare(rs485.ocpState, ws.ocpState) ? 'match' : 'discrepancy';
    }

    const rs485Keys = Object.keys(rs485.ocpState).sort();
    const wsKeys = Object.keys(ws.ocpState).sort();

    if (JSON.stringify(rs485Keys) !== JSON.stringify(wsKeys)) return 'discrepancy';

    for (const key of rs485Keys) {
      if (rs485.ocpState[key] !== ws.ocpState[key]) return 'discrepancy';
    }

    return 'match';
  }

  private buildNotes(rs485: TestResult, ws: TestResult, comparison: string): string {
    if (comparison === 'match') return '';
    const parts: string[] = [];
    if (rs485.error) parts.push(`RS485 error: ${rs485.error}`);
    if (ws.error) parts.push(`WS error: ${ws.error}`);
    if (comparison === 'discrepancy') {
      parts.push(`RS485 OCP: ${JSON.stringify(rs485.ocpState)}`);
      parts.push(`WS OCP: ${JSON.stringify(ws.ocpState)}`);
    }
    return parts.join(' | ');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
