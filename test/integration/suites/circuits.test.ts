import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHarness, TestOperation } from '../helpers';

const harness = new TestHarness();

const circuitOps: TestOperation[] = [
  {
    id: 'T-01', name: 'Circuit ON', category: 'circuits',
    write: (api) => api.put('/state/circuit/setState', { id: 3, state: true }),
    readApi: (api) => api.get('/state/circuit/3'),
    readOcp: (ocp) => ocp.getParam('C0003', ['STATUS']),
    revert: (api) => api.put('/state/circuit/setState', { id: 3, state: false }),
  },
  {
    id: 'T-02', name: 'Circuit OFF', category: 'circuits',
    write: async (api) => {
      await api.put('/state/circuit/setState', { id: 3, state: true });
      await new Promise(r => setTimeout(r, 2000));
      await api.put('/state/circuit/setState', { id: 3, state: false });
    },
    readApi: (api) => api.get('/state/circuit/3'),
    readOcp: (ocp) => ocp.getParam('C0003', ['STATUS']),
  },
  {
    id: 'T-03', name: 'Feature ON', category: 'features',
    write: (api) => api.put('/state/circuit/setState', { id: 129, state: true }),
    readApi: (api) => api.get('/state/circuit/129'),
    readOcp: (ocp) => ocp.getParam('FTR01', ['STATUS']),
    revert: (api) => api.put('/state/circuit/setState', { id: 129, state: false }),
  },
  {
    id: 'T-04', name: 'Feature OFF', category: 'features',
    write: async (api) => {
      await api.put('/state/circuit/setState', { id: 129, state: true });
      await new Promise(r => setTimeout(r, 2000));
      await api.put('/state/circuit/setState', { id: 129, state: false });
    },
    readApi: (api) => api.get('/state/circuit/129'),
    readOcp: (ocp) => ocp.getParam('FTR01', ['STATUS']),
  },
  {
    id: 'T-05', name: 'Pool body ON', category: 'bodies',
    write: (api) => api.put('/state/circuit/setState', { id: 6, state: true }),
    readApi: (api) => api.get('/state/circuit/6'),
    readOcp: (ocp) => ocp.getParam('C0006', ['STATUS']),
    revert: (api) => api.put('/state/circuit/setState', { id: 6, state: false }),
  },
  {
    id: 'T-06', name: 'Spa body ON', category: 'bodies',
    write: (api) => api.put('/state/circuit/setState', { id: 1, state: true }),
    readApi: (api) => api.get('/state/circuit/1'),
    readOcp: (ocp) => ocp.getParam('C0001', ['STATUS']),
    revert: (api) => api.put('/state/circuit/setState', { id: 1, state: false }),
  },
  {
    id: 'T-07', name: 'Pool setpoint UP', category: 'bodies',
    write: (api) => api.put('/state/body/setPoint', { id: 1, setPoint: 88 }),
    readApi: (api) => api.get('/state/body/1'),
    readOcp: (ocp) => ocp.getParam('B1101', ['HITMP', 'HTMODE', 'SETTMP']),
    revert: (api) => api.put('/state/body/setPoint', { id: 1, setPoint: 87 }),
    compare: (rs485, ws) => rs485['HITMP'] === ws['HITMP'],
  },
  {
    id: 'T-08', name: 'Pool setpoint DOWN', category: 'bodies',
    write: (api) => api.put('/state/body/setPoint', { id: 1, setPoint: 84 }),
    readApi: (api) => api.get('/state/body/1'),
    readOcp: (ocp) => ocp.getParam('B1101', ['HITMP', 'SETTMP']),
    revert: (api) => api.put('/state/body/setPoint', { id: 1, setPoint: 87 }),
    compare: (rs485, ws) => rs485['HITMP'] === ws['HITMP'],
  },
  {
    id: 'T-09', name: 'Pool heat mode change', category: 'bodies',
    write: (api) => api.put('/state/body/heatMode', { id: 1, mode: 3 }),
    readApi: (api) => api.get('/state/body/1'),
    readOcp: (ocp) => ocp.getParam('B1101', ['HTMODE']),
    revert: (api) => api.put('/state/body/heatMode', { id: 1, mode: 5 }),
    compare: (rs485, ws) => rs485['HTMODE'] === ws['HTMODE'],
  },
  {
    id: 'T-10', name: 'Spa setpoint', category: 'bodies',
    write: (api) => api.put('/state/body/setPoint', { id: 2, setPoint: 102 }),
    readApi: (api) => api.get('/state/body/2'),
    readOcp: (ocp) => ocp.getParam('B1102', ['HITMP', 'SETTMP']),
    revert: (api) => api.put('/state/body/setPoint', { id: 2, setPoint: 100 }),
    compare: (rs485, ws) => rs485['HITMP'] === ws['HITMP'],
  },
  {
    id: 'T-11', name: 'Cool setpoint', category: 'bodies',
    write: (api) => api.put('/state/body/setPoint', { id: 1, coolSetPoint: 90 }),
    readApi: (api) => api.get('/state/body/1'),
    readOcp: (ocp) => ocp.getParam('B1101', ['LOTMP']),
    revert: (api) => api.put('/state/body/setPoint', { id: 1, coolSetPoint: 88 }),
    compare: (rs485, ws) => rs485['LOTMP'] === ws['LOTMP'],
  },
  {
    id: 'T-12', name: 'Cancel delay', category: 'system',
    skip: true,
    skipReason: 'ISSUE-125 Won\'t Fix — cancel delay has no WS equivalent (Action 168 cat 19 is RS-485 only)',
    write: (api) => api.put('/state/cancelDelay', {}),
    readApi: (api) => api.get('/state/status'),
    readOcp: async (ocp) => {
      const result = await ocp.getParam('_5451', ['MANUAL', 'SERVICE']);
      return result;
    },
    compare: () => true,
  },
];

describe('Circuit/Feature/Body State - RS-485 vs WebSocket', () => {
  beforeAll(async () => {
    await harness.setup();
  }, 30_000);

  afterAll(async () => {
    const reporter = harness.getReporter();
    reporter.writeJsonReport('circuits-features-bodies.json');
    reporter.printConsoleReport();
    reporter.logIssuesToPlanQA();
    await harness.teardown();
  }, 30_000);

  for (const op of circuitOps) {
    it(`${op.id}: ${op.name} — OCP ACK matches on both transports`, async () => {
      const result = await harness.runOperation(op);
      if (result.comparison === 'skipped') return;
      expect(result.comparison, `${op.id} failed: ${result.notes}`).toBe('match');
    }, 300_000);
  }
});
