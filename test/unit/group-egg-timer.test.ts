// Group egg timers on Nixie (ISSUE-230 / ISSUE-231, GitHub #1243).
// Loads the real NixieCircuitCommands / NixieFeatureCommands and the real
// CircuitCommands.setEndTime(); sys/state are small fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({
    circuitGroups: [] as any[],
    lightGroups: [] as any[],
    groupStates: new Map<number, any>(),
    lightStates: new Map<number, any>(),
    circuits: new Map<number, any>(),
    schedules: [] as any[],      // state.schedules entries
    schedConfigs: new Map<number, any>(),
    mode: 0,
    info: () => {},
}));

vi.mock('../../logger/Logger', () => ({ logger: {
    error: () => {}, warn: () => {}, info: (...a: any[]) => (fx.info as any)(...a),
    verbose: () => {}, debug: () => {}, silly: () => {},
} }));
vi.mock('../../controller/Lockouts', () => ({ delayMgr: {
    cancelManualPriorityDelays: () => {}, cancelManualPriorityDelay: () => {},
} }));
vi.mock('../../controller/nixie/NixieEquipment', () => ({
    NixieEquipment: class {}, NixieChildEquipment: class {}, NixieEquipmentCollection: class extends Array {},
}));
vi.mock('../../controller/Equipment', () => {
    const groupConfig = (id: number) => fx.circuitGroups.find(g => g.id === id) || fx.lightGroups.find(g => g.id === id);
    return { sys: {
        circuitGroups: {
            get length() { return fx.circuitGroups.length; },
            getItemByIndex: (i: number) => fx.circuitGroups[i],
            getItemById: (id: number) => groupConfig(id) || { id, dataName: 'circuitGroupConfig', isActive: false, circuits: { toArray: () => [] } },
        },
        lightGroups: {
            get length() { return fx.lightGroups.length; },
            getItemByIndex: (i: number) => fx.lightGroups[i],
        },
        circuits: { getInterfaceById: (id: number) => groupConfig(id) },
        schedules: { getItemById: (id: number) => fx.schedConfigs.get(id) },
        general: { options: {} },
        board: {} as any,
    } };
});
vi.mock('../../controller/State', () => ({ state: {
    get mode() { return fx.mode; },
    circuitGroups: {
        getItemById: (id: number) => fx.groupStates.get(id),
        get length() { return fx.circuitGroups.length; },
        getItemByIndex: (i: number) => fx.groupStates.get(fx.circuitGroups[i].id),
    },
    lightGroups: {
        getItemById: (id: number) => fx.lightStates.get(id),
        get length() { return fx.lightGroups.length; },
        getItemByIndex: (i: number) => fx.lightStates.get(fx.lightGroups[i].id),
    },
    circuits: { getInterfaceById: (id: number) => fx.circuits.get(id) },
    schedules: {
        get length() { return fx.schedules.length; },
        getItemByIndex: (i: number) => fx.schedules[i],
        getActiveSchedules: () => [],
    },
    emitEquipmentChanges: () => {},
} }));

import { sys } from '../../controller/Equipment';
import { Timestamp } from '../../controller/Constants';
import { NixieCircuitCommands, NixieFeatureCommands } from '../../controller/boards/NixieBoard';
import { CircuitCommands } from '../../controller/boards/SystemBoard';

const EGG_MIN = 180;   // 3h, as in the #1243 report
const POOL = 6, PUMP_HIGH = 8, POOL_HIGH = 194, LIGHTS = 196, LIGHT_A = 20, LIGHT_B = 21;

let circuits: NixieCircuitCommands;
let features: NixieFeatureCommands;
let setCircuit: ReturnType<typeof vi.fn>;

function member(circuit: number, desiredState: number) { return { circuit, desiredState }; }
function groupOf(id: number, members: any[], dataName = 'circuitGroupConfig') {
    return {
        id, dataName, isActive: true, eggTimer: EGG_MIN, dontStop: false,
        circuits: { toArray: () => members, getItemByIndex: (i: number) => members[i] },
    };
}
function groupState(id: number) {
    return { id, isActive: true, isOn: false, manualPriorityActive: false,
        startTime: undefined as Timestamp | undefined, endTime: undefined as Timestamp | undefined,
        emitEquipmentChange: () => {} };
}
function scheduleOn(id: number, circuit: number) {
    fx.schedConfigs.set(id, { id, circuit, isActive: true });
    fx.schedules.push({ id, isOn: true });
}
function memberOn(id: number, on = true) { fx.circuits.get(id).isOn = on; }
const pg = () => fx.groupStates.get(POOL_HIGH);
const lg = () => fx.lightStates.get(LIGHTS);
const minutesFromNow = (ts: Timestamp) => (ts.getTime() - Date.now()) / 60000;

beforeEach(() => {
    fx.circuitGroups.length = 0; fx.lightGroups.length = 0; fx.schedules.length = 0;
    fx.groupStates.clear(); fx.lightStates.clear(); fx.circuits.clear(); fx.schedConfigs.clear();
    fx.mode = 0;
    fx.info = vi.fn();
    // "Pool High": Pool on/ignore + Pump High on/off.
    fx.circuitGroups.push(groupOf(POOL_HIGH, [member(POOL, 4), member(PUMP_HIGH, 1)]));
    fx.groupStates.set(POOL_HIGH, groupState(POOL_HIGH));
    fx.lightGroups.push(groupOf(LIGHTS, [member(LIGHT_A, 1), member(LIGHT_B, 1)], 'lightGroupConfig'));
    fx.lightStates.set(LIGHTS, groupState(LIGHTS));
    for (const id of [POOL, PUMP_HIGH, LIGHT_A, LIGHT_B]) fx.circuits.set(id, { id, isOn: false });

    circuits = new NixieCircuitCommands(null as any);
    features = new NixieFeatureCommands(null as any);
    // Member writes just flip the fake state; the real Nixie path is out of scope here.
    setCircuit = vi.fn(async (id: number, val: boolean) => { memberOn(id, val); return fx.circuits.get(id); });
    (circuits as any).setCircuitStateAsync = setCircuit;
    Object.assign((sys as any).board, {
        circuits,
        features,
        valves: { syncValveStates: () => {} },
        schedules: { includesCircuit: (sched: any, id: number) => sched.circuit === id },
    });
});

describe('ISSUE-230: inferred group state never starts a group egg timer', () => {
    it('members turned on by their own schedules: group is on, no endTime (#1243 sequence)', () => {
        scheduleOn(1, POOL); scheduleOn(2, PUMP_HIGH);
        memberOn(POOL); memberOn(PUMP_HIGH);
        features.syncGroupStates();
        expect(pg().isOn).toBe(true);
        expect(pg().endTime).toBeUndefined();
    });

    it('members switched on manually one by one: still no group timer (members keep their own)', () => {
        memberOn(POOL); memberOn(PUMP_HIGH);
        features.syncGroupStates();
        expect(pg().isOn).toBe(true);
        expect(pg().endTime).toBeUndefined();
    });

    it('light group inferred on: no endTime', () => {
        memberOn(LIGHT_A); memberOn(LIGHT_B);
        features.syncGroupStates();
        expect(lg().isOn).toBe(true);
        expect(lg().endTime).toBeUndefined();
    });

    it('clears an already-expired deadline once the inferred group drops out', () => {
        pg().endTime = new Timestamp(new Date(Date.now() - 60000));
        features.syncGroupStates();   // members off -> inferred off
        expect(pg().endTime).toBeUndefined();
        // Members line up again later: nothing stale left for the expiry check to fire on.
        memberOn(POOL); memberOn(PUMP_HIGH);
        features.syncGroupStates();
        expect(pg().endTime).toBeUndefined();
    });

    it('keeps a running (future) deadline while the group is momentarily unmatched mid-cascade', () => {
        const deadline = new Timestamp(new Date(Date.now() + 30 * 60000));
        pg().endTime = deadline;
        features.syncGroupStates();   // members not on yet
        expect(pg().endTime.getTime()).toBe(deadline.getTime());
    });
});

describe('ISSUE-230: explicit group ON still gets the egg timer', () => {
    it('stamps the timer on a normal off->on', async () => {
        await circuits.setCircuitGroupStateAsync(POOL_HIGH, true);
        expect(pg().isOn).toBe(true);
        expect(minutesFromNow(pg().endTime)).toBeCloseTo(EGG_MIN, 0);
    });

    it('stamps the timer when the group already looks on from its members', async () => {
        memberOn(POOL); memberOn(PUMP_HIGH);
        features.syncGroupStates();
        expect(pg().isOn).toBe(true);
        expect(pg().endTime).toBeUndefined();
        await circuits.setCircuitGroupStateAsync(POOL_HIGH, true);
        expect(minutesFromNow(pg().endTime)).toBeCloseTo(EGG_MIN, 0);
    });

    it('keeps an existing running timer on a repeat ON', async () => {
        const deadline = new Timestamp(new Date(Date.now() + 10 * 60000));
        pg().isOn = true; pg().endTime = deadline;
        await circuits.setCircuitGroupStateAsync(POOL_HIGH, true);
        expect(pg().endTime.getTime()).toBe(deadline.getTime());
    });

    it('survives a status pass that runs between member writes', async () => {
        // Each Nixie member write ends in processStatusAsync() -> syncGroupStates().
        setCircuit.mockImplementation(async (id: number, val: boolean) => {
            memberOn(id, val);
            features.syncGroupStates();
            return fx.circuits.get(id);
        });
        await circuits.setCircuitGroupStateAsync(POOL_HIGH, true);
        expect(pg().endTime).toBeDefined();
        expect(minutesFromNow(pg().endTime)).toBeCloseTo(EGG_MIN, 0);
    });

    it('light group explicit ON stamps the timer', async () => {
        await circuits.setLightGroupStateAsync(LIGHTS, true);
        expect(minutesFromNow(lg().endTime)).toBeCloseTo(EGG_MIN, 0);
    });
});

describe('ISSUE-231: egg-timer expiry leaves schedule-held members on', () => {
    beforeEach(() => {
        memberOn(POOL); memberOn(PUMP_HIGH);
        pg().isOn = true;
        pg().endTime = new Timestamp(new Date(Date.now() - 1000));
    });

    it('expiry skips a member a schedule is holding on and turns the rest off', async () => {
        scheduleOn(2, PUMP_HIGH);
        await circuits.expireCircuitGroupAsync(POOL_HIGH);
        expect(setCircuit).not.toHaveBeenCalledWith(PUMP_HIGH, false);
        expect(fx.circuits.get(PUMP_HIGH).isOn).toBe(true);
        expect(pg().isOn).toBe(false);
        expect(pg().endTime).toBeUndefined();
        expect(fx.info).toHaveBeenCalledTimes(1);
    });

    it('expiry turns the member off when its schedule is not running (stood down / ended)', async () => {
        fx.schedConfigs.set(2, { id: 2, circuit: PUMP_HIGH, isActive: true });
        fx.schedules.push({ id: 2, isOn: false });
        await circuits.expireCircuitGroupAsync(POOL_HIGH);
        expect(setCircuit).toHaveBeenCalledWith(PUMP_HIGH, false);
    });

    it('an explicit user group OFF still turns a scheduled member off', async () => {
        scheduleOn(2, PUMP_HIGH);
        await circuits.setCircuitGroupStateAsync(POOL_HIGH, false);
        expect(setCircuit).toHaveBeenCalledWith(PUMP_HIGH, false);
    });

    it('checkEggTimerExpirationAsync routes group expiry through expireCircuitGroupAsync', async () => {
        scheduleOn(2, PUMP_HIGH);
        Object.assign(sys as any, { features: { length: 0 } });
        (sys as any).circuits.length = 0;
        const expire = vi.spyOn(circuits, 'expireCircuitGroupAsync');
        await circuits.checkEggTimerExpirationAsync();
        expect(expire).toHaveBeenCalledWith(POOL_HIGH);
        expect(fx.circuits.get(PUMP_HIGH).isOn).toBe(true);
    });

    it('light group expiry skips a schedule-held light', async () => {
        memberOn(LIGHT_A); memberOn(LIGHT_B);
        lg().isOn = true;
        scheduleOn(3, LIGHT_A);
        await circuits.expireLightGroupAsync(LIGHTS);
        expect(setCircuit).not.toHaveBeenCalledWith(LIGHT_A, false);
        expect(setCircuit).toHaveBeenCalledWith(LIGHT_B, false);
    });

    it('base CircuitCommands expiry hooks default to a plain group OFF', async () => {
        const base = new CircuitCommands(null as any);
        const off = vi.spyOn(base, 'setCircuitGroupStateAsync').mockResolvedValue({} as any);
        const loff = vi.spyOn(base, 'setLightGroupStateAsync').mockResolvedValue({} as any);
        await base.expireCircuitGroupAsync(5);
        await base.expireLightGroupAsync(6);
        expect(off).toHaveBeenCalledWith(5, false);
        expect(loff).toHaveBeenCalledWith(6, false);
    });
});
