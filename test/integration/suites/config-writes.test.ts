import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHarness, TestOperation } from '../helpers';

const harness = new TestHarness();

const configOps: TestOperation[] = [
  // --- PUMPS ---
  {
    id: 'T-20', name: 'Set pump speed', category: 'pumps',
    write: (api) => api.put('/config/pump', { id: 1, circuits: [{ id: 1, circuit: 6, speed: 2800 }] }),
    readApi: (api) => api.get('/config/options/pumps'),
    readOcp: (ocp) => ocp.getParam('p0101', ['SPEED', 'CIRCUIT']),
    compare: (rs485, ws) => rs485['SPEED'] === ws['SPEED'],
  },
  {
    id: 'T-21', name: 'Set pump name', category: 'pumps',
    write: (api) => api.put('/config/pump', { id: 1, name: 'TestPump' }),
    readApi: (api) => api.get('/config/options/pumps'),
    readOcp: (ocp) => ocp.getParam('PMP01', ['SNAME']),
    revert: (api) => api.put('/config/pump', { id: 1, name: 'Pump 1' }),
    compare: (rs485, ws) => rs485['SNAME'] === ws['SNAME'],
  },

  // --- SCHEDULES ---
  {
    id: 'T-30', name: 'Create schedule', category: 'schedules',
    write: (api) => api.put('/config/schedule', { id: 0, circuit: 3, startTime: 540, endTime: 1020, scheduleDays: { val: 127 }, scheduleType: 0 }),
    readApi: (api) => api.get('/state/schedules'),
    readOcp: async (ocp) => {
      const scheds = await ocp.getParamByType('SCHED', ['OBJNAM', 'TIME', 'TIMOUT', 'DAY', 'ACT']);
      const active = scheds.find((s: any) => s.params?.ACT === 'ON');
      return active?.params || {};
    },
    compare: (rs485, ws) => rs485['TIME'] === ws['TIME'] && rs485['TIMOUT'] === ws['TIMOUT'],
  },
  {
    id: 'T-31', name: 'Edit schedule time', category: 'schedules',
    write: async (api) => {
      const scheds = await api.get('/state/schedules');
      const target = Array.isArray(scheds) ? scheds.find((s: any) => s.circuit?.id === 3) : null;
      if (target) {
        await api.put('/config/schedule', { id: target.id, startTime: 600 });
      }
    },
    readApi: (api) => api.get('/state/schedules'),
    readOcp: async (ocp) => {
      const scheds = await ocp.getParamByType('SCHED', ['OBJNAM', 'TIME', 'ACT']);
      const active = scheds.find((s: any) => s.params?.ACT === 'ON');
      return active?.params || {};
    },
    compare: (rs485, ws) => rs485['TIME'] === ws['TIME'],
  },
  {
    id: 'T-32', name: 'Delete schedule', category: 'schedules',
    write: async (api) => {
      const scheds = await api.get('/state/schedules');
      const target = Array.isArray(scheds) ? scheds.find((s: any) => s.circuit?.id === 3) : null;
      if (target) {
        await api.delete('/config/schedule', { id: target.id });
      }
    },
    readApi: (api) => api.get('/state/schedules'),
    readOcp: async (ocp) => {
      const scheds = await ocp.getParamByType('SCHED', ['OBJNAM', 'ACT']);
      return { activeCount: String(scheds.filter((s: any) => s.params?.ACT === 'ON').length) };
    },
    compare: (rs485, ws) => rs485['activeCount'] === ws['activeCount'],
  },

  // --- HEATERS ---
  {
    id: 'T-40', name: 'Set heater body', category: 'heaters',
    write: (api) => api.put('/config/heater', { id: 1, body: 1 }),
    readApi: (api) => api.get('/config/options/heaters'),
    readOcp: (ocp) => ocp.getParam('H0001', ['BODY', 'SUBTYP']),
    compare: (rs485, ws) => rs485['BODY'] === ws['BODY'],
  },
  {
    id: 'T-41', name: 'Set heater cooling', category: 'heaters',
    write: (api) => api.put('/config/heater', { id: 1, coolingEnabled: true }),
    readApi: (api) => api.get('/config/options/heaters'),
    readOcp: (ocp) => ocp.getParam('H0001', ['COOL']),
    revert: (api) => api.put('/config/heater', { id: 1, coolingEnabled: false }),
    compare: (rs485, ws) => rs485['COOL'] === ws['COOL'],
  },

  // --- VALVES ---
  {
    id: 'T-50', name: 'Set valve circuit', category: 'valves',
    write: (api) => api.put('/config/valve', { id: 1, circuit: 6 }),
    readApi: (api) => api.get('/config/options/valves'),
    readOcp: (ocp) => ocp.getParam('VAL01', ['CIRCUIT', 'DLY']),
    compare: (rs485, ws) => rs485['CIRCUIT'] === ws['CIRCUIT'],
  },

  // --- COVERS ---
  {
    id: 'T-60', name: 'Set cover body', category: 'covers',
    write: (api) => api.put('/config/cover', { id: 1, body: 1 }),
    readApi: (api) => api.get('/config/options/covers'),
    readOcp: (ocp) => ocp.getParam('CVR01', ['BODY', 'STATUS']),
    compare: (rs485, ws) => rs485['BODY'] === ws['BODY'],
  },

  // --- CHLORINATOR ---
  {
    id: 'T-70', name: 'Set chlor pool setpoint', category: 'chlorinator',
    write: (api) => api.put('/state/chlorinator', { id: 1, poolSetpoint: 55 }),
    readApi: (api) => api.get('/state/chlorinator/1'),
    readOcp: (ocp) => ocp.getParam('CHR01', ['PRIM', 'SEC']),
    revert: (api) => api.put('/state/chlorinator', { id: 1, poolSetpoint: 50 }),
    compare: (rs485, ws) => rs485['PRIM'] === ws['PRIM'],
  },
  {
    id: 'T-71', name: 'Set chlor spa setpoint', category: 'chlorinator',
    write: (api) => api.put('/state/chlorinator', { id: 1, spaSetpoint: 10 }),
    readApi: (api) => api.get('/state/chlorinator/1'),
    readOcp: (ocp) => ocp.getParam('CHR01', ['SEC']),
    revert: (api) => api.put('/state/chlorinator', { id: 1, spaSetpoint: 5 }),
    compare: (rs485, ws) => rs485['SEC'] === ws['SEC'],
  },
  {
    id: 'T-72', name: 'Super chlorinate', category: 'chlorinator',
    write: (api) => api.put('/state/chlorinator/superChlorinate', { id: 1, superChlorinate: true, superChlorHours: 8 }),
    readApi: (api) => api.get('/state/chlorinator/1'),
    readOcp: (ocp) => ocp.getParam('CHR01', ['SUPER']),
    revert: (api) => api.put('/state/chlorinator/superChlorinate', { id: 1, superChlorinate: false }),
    compare: (rs485, ws) => rs485['SUPER'] === ws['SUPER'],
  },

  // --- CHEMISTRY ---
  {
    id: 'T-80', name: 'Set pH setpoint', category: 'chemistry',
    write: (api) => api.put('/state/chemController', { id: 1, ph: { setpoint: 7.4 } }),
    readApi: (api) => api.get('/state/chemControllers'),
    readOcp: (ocp) => ocp.getParam('CHM01', ['PHSET']),
    compare: (rs485, ws) => rs485['PHSET'] === ws['PHSET'],
  },
  {
    id: 'T-81', name: 'Set ORP setpoint', category: 'chemistry',
    write: (api) => api.put('/state/chemController', { id: 1, orp: { setpoint: 700 } }),
    readApi: (api) => api.get('/state/chemControllers'),
    readOcp: (ocp) => ocp.getParam('CHM01', ['ORPSET']),
    compare: (rs485, ws) => rs485['ORPSET'] === ws['ORPSET'],
  },
];

describe('Config Writes - RS-485 vs WebSocket', () => {
  beforeAll(async () => {
    await harness.setup();
  }, 30_000);

  afterAll(async () => {
    const reporter = harness.getReporter();
    reporter.writeJsonReport('config-writes.json');
    reporter.printConsoleReport();
    reporter.logIssuesToPlanQA();
    await harness.teardown();
  }, 30_000);

  for (const op of configOps) {
    it(`${op.id}: ${op.name} — OCP ACK matches on both transports`, async () => {
      const result = await harness.runOperation(op);
      if (result.comparison === 'skipped') return;
      expect(result.comparison, `${op.id} failed: ${result.notes}`).toBe('match');
    }, 300_000);
  }
});
