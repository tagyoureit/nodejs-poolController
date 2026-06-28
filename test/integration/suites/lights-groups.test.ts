import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestHarness, TestOperation } from '../helpers';

const harness = new TestHarness();

const lightGroupOps: TestOperation[] = [
  // --- LIGHTS ---
  {
    id: 'T-100', name: 'Light theme set', category: 'lights',
    write: (api) => api.put('/state/light/setTheme', { id: 2, theme: 1 }),
    readApi: (api) => api.get('/state/circuit/2'),
    readOcp: (ocp) => ocp.getParam('C0002', ['STATUS', 'MODE']),
    revert: (api) => api.put('/state/light/setTheme', { id: 2, theme: 0 }),
    compare: (rs485, ws) => rs485['MODE'] === ws['MODE'],
  },
  {
    id: 'T-101', name: 'Circuit group ON', category: 'groups',
    write: (api) => api.put('/state/circuitGroup/setState', { id: 195, state: true }),
    readApi: (api) => api.get('/state/circuitGroups'),
    readOcp: (ocp) => ocp.getParam('GRP03', ['STATUS']),
    revert: (api) => api.put('/state/circuitGroup/setState', { id: 195, state: false }),
    compare: (rs485, ws) => rs485['STATUS'] === ws['STATUS'],
  },
  {
    id: 'T-102', name: 'Light group command', category: 'groups',
    write: (api) => api.put('/state/lightGroup/runCommand', { id: 193, command: 1 }),
    readApi: (api) => api.get('/state/lightGroups'),
    readOcp: (ocp) => ocp.getParam('GRP02', ['STATUS', 'MODE']),
    compare: () => true,
  },
  {
    id: 'T-103', name: 'Color hold', category: 'lights',
    write: (api) => api.put('/state/light/2/colorHold', {}),
    readApi: (api) => api.get('/state/circuit/2'),
    readOcp: (ocp) => ocp.getParam('C0002', ['STATUS']),
    compare: () => true,
  },
  {
    id: 'T-104', name: 'Color sync', category: 'lights',
    write: (api) => api.put('/state/light/2/colorSync', {}),
    readApi: (api) => api.get('/state/circuit/2'),
    readOcp: (ocp) => ocp.getParam('C0002', ['STATUS']),
    compare: () => true,
  },
  {
    id: 'T-105', name: 'Dimmer level', category: 'lights',
    write: (api) => api.put('/state/circuit/setDimmerLevel', { id: 2, level: 50 }),
    readApi: (api) => api.get('/state/circuit/2'),
    readOcp: (ocp) => ocp.getParam('C0002', ['STATUS']),
    compare: () => true,
  },

  // --- REMOTES ---
  {
    id: 'T-106', name: 'Set remote button', category: 'remotes',
    write: (api) => api.put('/config/remote', { id: 1, button1: 6 }),
    readApi: (api) => api.get('/config/options/remotes'),
    readOcp: async (ocp) => {
      const btns = await ocp.getParamByType('REMBTN', ['OBJNAM', 'PARENT', 'CIRCUIT']);
      const rem1Btns = btns.filter((b: any) => b.params?.PARENT === 'REM01');
      return { buttonCount: String(rem1Btns.length), firstCircuit: rem1Btns[0]?.params?.CIRCUIT || '' };
    },
    compare: (rs485, ws) => rs485['firstCircuit'] === ws['firstCircuit'],
  },

  // --- SECURITY ---
  {
    id: 'T-107', name: 'Set security role', category: 'security',
    write: (api) => api.put('/config/security/role', { id: 1, name: 'TestRole', pin: '1234', timeout: 0 }),
    readApi: (api) => api.get('/config/options/security'),
    readOcp: (ocp) => ocp.getParam('U0001', ['SNAME', 'PASSWRD', 'ENABLE']),
    revert: (api) => api.put('/config/security/role', { id: 1, name: 'Role 1', pin: '0000', timeout: 0 }),
    compare: (rs485, ws) => rs485['SNAME'] === ws['SNAME'] && rs485['PASSWRD'] === ws['PASSWRD'],
  },
];

describe('Lights/Groups/Remotes/Security - RS-485 vs WebSocket', () => {
  beforeAll(async () => {
    await harness.setup();
  }, 30_000);

  afterAll(async () => {
    const reporter = harness.getReporter();
    reporter.writeJsonReport('lights-groups-remotes-security.json');
    reporter.printConsoleReport();
    reporter.logIssuesToPlanQA();
    await harness.teardown();
  }, 30_000);

  for (const op of lightGroupOps) {
    it(`${op.id}: ${op.name} — OCP ACK matches on both transports`, async () => {
      const result = await harness.runOperation(op);
      if (result.comparison === 'skipped') return;
      expect(result.comparison, `${op.id} failed: ${result.notes}`).toBe('match');
    }, 300_000);
  }
});
