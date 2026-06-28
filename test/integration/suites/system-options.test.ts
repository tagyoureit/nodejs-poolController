import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHarness, TestOperation } from '../helpers';

const harness = new TestHarness();

const systemOps: TestOperation[] = [
  {
    id: 'T-90', name: 'Set freeze delay', category: 'system-options',
    write: (api) => api.put('/config/options', { freezeDelay: 45 }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['FREEZEDLY']),
    revert: (api) => api.put('/config/options', { freezeDelay: 30 }),
    compare: (rs485, ws) => rs485['FREEZEDLY'] === ws['FREEZEDLY'],
  },
  {
    id: 'T-91', name: 'Set valve delay ON', category: 'system-options',
    write: (api) => api.put('/config/options', { valveDelay: true }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['VALVE']),
    revert: (api) => api.put('/config/options', { valveDelay: false }),
    compare: (rs485, ws) => rs485['VALVE'] === ws['VALVE'],
  },
  {
    id: 'T-92', name: 'Set cooldown delay ON', category: 'system-options',
    write: (api) => api.put('/config/options', { cooldownDelay: true }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['HEATING']),
    revert: (api) => api.put('/config/options', { cooldownDelay: false }),
    compare: (rs485, ws) => rs485['HEATING'] === ws['HEATING'],
  },
  {
    id: 'T-93', name: 'Set manual priority', category: 'system-options',
    write: (api) => api.put('/state/manualOperationPriority', { id: 1, priority: true }),
    readApi: (api) => api.get('/state/status'),
    readOcp: (ocp) => ocp.getParam('_5451', ['MANUAL']),
    revert: (api) => api.put('/state/manualOperationPriority', { id: 1, priority: false }),
    compare: (rs485, ws) => rs485['MANUAL'] === ws['MANUAL'],
  },
  {
    id: 'T-94', name: 'Set date/time', category: 'system-options',
    write: (api) => api.put('/config/dateTime', { hour: 14, min: 30, dow: 3, date: 21, month: 5, year: 2026 }),
    readApi: (api) => api.get('/state/time'),
    readOcp: (ocp) => ocp.getParam('_C10C', ['MIN', 'DAY']),
    compare: (rs485, ws) => rs485['DAY'] === ws['DAY'],
  },
  {
    id: 'T-95', name: 'Set units (metric)', category: 'system-options',
    write: (api) => api.put('/config/options', { units: 1 }),
    readApi: (api) => api.get('/config/options'),
    readOcp: async (ocp) => {
      const result = await ocp.getParam('_5451', ['MODE']);
      return result;
    },
    revert: (api) => api.put('/config/options', { units: 0 }),
    compare: () => true,
  },
  {
    id: 'T-96', name: 'Set vacation', category: 'system-options',
    write: (api) => api.put('/config/options', { vacation: { active: false, startDate: '2026-06-01', endDate: '2026-06-15' } }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['VACFLO', 'VACTIM', 'START', 'STOP']),
    compare: (rs485, ws) => rs485['START'] === ws['START'] && rs485['STOP'] === ws['STOP'],
  },
  {
    id: 'T-97', name: 'Set location', category: 'system-options',
    write: (api) => api.put('/config/general', { latitude: 33.5, longitude: -117.7 }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['LOCY', 'LOCX']),
    compare: (rs485, ws) => rs485['LOCY'] === ws['LOCY'] && rs485['LOCX'] === ws['LOCX'],
  },
  {
    id: 'T-98', name: 'Set owner name', category: 'system-options',
    write: (api) => api.put('/config/general', { owner: { name: 'TestOwner' } }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_5451', ['NAME']),
    revert: (api) => api.put('/config/general', { owner: { name: '' } }),
    compare: (rs485, ws) => rs485['NAME'] === ws['NAME'],
  },
  {
    id: 'T-99', name: 'Set 24h clock', category: 'system-options',
    write: (api) => api.put('/config/options', { clockMode: 24 }),
    readApi: (api) => api.get('/config/options'),
    readOcp: (ocp) => ocp.getParam('_C10C', ['CLK24A']),
    revert: (api) => api.put('/config/options', { clockMode: 12 }),
    compare: (rs485, ws) => rs485['CLK24A'] === ws['CLK24A'],
  },
];

describe('System Options - RS-485 vs WebSocket', () => {
  beforeAll(async () => {
    await harness.setup();
  }, 30_000);

  afterAll(async () => {
    const reporter = harness.getReporter();
    reporter.writeJsonReport('system-options.json');
    reporter.printConsoleReport();
    reporter.logIssuesToPlanQA();
    await harness.teardown();
  }, 30_000);

  for (const op of systemOps) {
    it(`${op.id}: ${op.name} — OCP ACK matches on both transports`, async () => {
      const result = await harness.runOperation(op);
      if (result.comparison === 'skipped') return;
      expect(result.comparison, `${op.id} failed: ${result.notes}`).toBe('match');
    }, 300_000);
  }
});
