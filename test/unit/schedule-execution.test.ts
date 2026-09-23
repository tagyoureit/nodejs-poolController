import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
    schedules: [] as any[],
    circuits: new Map<number, any>(),
    configs: new Map<number, any>(),
    bodies: [] as any[],
    options: { manualPriority: false },
    setCircuit: vi.fn(),
    setHeatMode: vi.fn(),
    setHeatSetpoint: vi.fn(),
    setCoolSetpoint: vi.fn(),
    emit: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    delay: vi.fn(),
    activeFilter: (s: any): boolean => true,
}));

vi.mock('../../logger/Logger', () => ({ logger: { error: fixtures.error, info: fixtures.info } }));
vi.mock('../../controller/Equipment', () => ({ sys: {
    schedules: { getItemById: (id: number) => fixtures.configs.get(id) },
    bodies: { find: (predicate: any) => fixtures.bodies.find(predicate) },
    general: { options: fixtures.options },
    board: {
        circuits: { setCircuitStateAsync: fixtures.setCircuit },
        bodies: {
            setHeatModeAsync: fixtures.setHeatMode,
            setHeatSetpointAsync: fixtures.setHeatSetpoint,
            setCoolSetpointAsync: fixtures.setCoolSetpoint,
        },
        valueMaps: { heatSources: {
            transform: (value: number) => ({
                name: ['nochange', 'heater', 'heatpump', 'off'][value],
                hasCoolSetpoint: value === 2,
            }),
            getValue: (name: string) => ['nochange', 'heater', 'heatpump', 'off'].indexOf(name),
        } },
    },
} }));
vi.mock('../../controller/State', () => ({ state: {
    schedules: {
        get length() { return fixtures.schedules.length; },
        getItemByIndex: (i: number) => fixtures.schedules[i],
        getActiveSchedules: () => fixtures.schedules.filter(fixtures.activeFilter),
    },
    circuits: { getInterfaceById: (id: number) => fixtures.circuits.get(id) },
    emitEquipmentChanges: fixtures.emit,
} }));
vi.mock('../../controller/Lockouts', () => ({ delayMgr: { setManualPriorityDelay: fixtures.delay } }));
vi.mock('../../controller/nixie/NixieEquipment', () => ({
    NixieEquipment: class {},
    NixieEquipmentCollection: class extends Array {},
}));

import { NixieScheduleCollection } from '../../controller/nixie/schedules/Schedule';

function addSchedule(id: number, circuit: number, overrides: Record<string, any> = {}, master = 1) {
    const schedule = {
        id, circuit, isOn: false, triggered: false, manualPriorityActive: false,
        divergedSince: undefined as Date | undefined,
        heatSource: 0, heatSetpoint: 82, coolSetpoint: 95,
        scheduleTime: { shouldBeOn: true }, ...overrides,
    };
    fixtures.schedules.push(schedule);
    fixtures.configs.set(id, { id, master });
    if (!fixtures.circuits.has(circuit)) {
        fixtures.circuits.set(circuit, { id: circuit, isOn: false, manualPriorityActive: false });
    }
    return schedule;
}

async function tick() {
    await new NixieScheduleCollection({} as any).triggerSchedules();
}

// A single long-lived collection, so per-instance bookkeeping (suppression logging, any
// bounded-retry accounting) persists across ticks the way it does in the running process.
// Tests that assert behaviour ACROSS polls must use this, not tick(), or a fresh instance
// would silently reset the very counters under test.
function collection() {
    const ncp = new NixieScheduleCollection({} as any);
    return async () => { await ncp.triggerSchedules(); };
}

beforeEach(() => {
    vi.resetAllMocks();
    fixtures.activeFilter = (s: any) => true;
    fixtures.schedules.length = 0;
    fixtures.circuits.clear();
    fixtures.configs.clear();
    fixtures.bodies.length = 0;
    fixtures.options.manualPriority = false;
    fixtures.setCircuit.mockImplementation(async (id: number, on: boolean) => {
        fixtures.circuits.get(id).isOn = on;
        return fixtures.circuits.get(id);
    });
});

describe('schedule characterization without controller startup', () => {
    it('activates overlapping schedules with one successful circuit write', async () => {
        const first = addSchedule(1, 8);
        const second = addSchedule(2, 8);
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, true]]);
        expect([first.triggered, second.triggered]).toEqual([true, true]);
        await tick();
        expect(fixtures.setCircuit).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])('respects manual off within an occurrence (priority=%s)', async priority => {
        fixtures.options.manualPriority = priority;
        const schedule = addSchedule(1, 8, { triggered: true });
        await tick();
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
        expect(schedule.triggered).toBe(true);
        expect(schedule.manualPriorityActive).toBe(priority);
    });

    it('does not turn off manual operation outside a schedule window', async () => {
        addSchedule(1, 8, { scheduleTime: { shouldBeOn: false } });
        fixtures.circuits.get(8).isOn = true;
        await tick();
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
    });

    it('does not execute OCP-only schedules', async () => {
        addSchedule(1, 8, {}, 0);
        await tick();
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
    });

    it('retains mixed local/OCP schedule execution on one circuit', async () => {
        addSchedule(1, 8, {}, 0);
        addSchedule(2, 8);
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, true]]);
    });

    it('waits for the circuit command before marking activation', async () => {
        const schedule = addSchedule(1, 8);
        let complete: () => void;
        fixtures.setCircuit.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
        const pending = tick();
        expect(schedule.triggered).toBe(false);
        fixtures.circuits.get(8).isOn = true;
        complete!();
        await pending;
        expect(schedule.triggered).toBe(true);
    });

    it('characterizes deferred board results as a remaining outcome-contract gap', async () => {
        const schedule = addSchedule(1, 8);
        fixtures.setCircuit.mockImplementation(async (id: number) => fixtures.circuits.get(id));
        await tick();
        expect(fixtures.circuits.get(8).isOn).toBe(false);
        expect(schedule.triggered).toBe(true);
    });
});

describe('schedule reliability regressions', () => {
    it('uses each body circuit schedule for its own heat settings', async () => {
        addSchedule(1, 8, { heatSource: 0, heatSetpoint: 65 });
        addSchedule(2, 1, { heatSource: 1, heatSetpoint: 99 });
        addSchedule(3, 6, { heatSource: 2, heatSetpoint: 84, coolSetpoint: 92 });
        fixtures.bodies.push({ id: 2, circuit: 1 }, { id: 1, circuit: 6 });
        await tick();
        expect(fixtures.setHeatMode.mock.calls).toEqual([[fixtures.bodies[0], 1], [fixtures.bodies[1], 2]]);
        expect(fixtures.setHeatSetpoint.mock.calls).toEqual([[fixtures.bodies[0], 99], [fixtures.bodies[1], 84]]);
        expect(fixtures.setCoolSetpoint.mock.calls).toEqual([[fixtures.bodies[1], 92]]);
        expect(fixtures.error).not.toHaveBeenCalled();
        await tick();
        expect(fixtures.setHeatSetpoint).toHaveBeenCalledTimes(2);
    });

    it('skips triggered heat settings in the per-circuit subset', async () => {
        addSchedule(1, 8, { triggered: true });
        addSchedule(2, 6, { heatSource: 1, heatSetpoint: 81 });
        addSchedule(3, 6, { triggered: true, heatSource: 2, heatSetpoint: 95 });
        fixtures.bodies.push({ id: 1, circuit: 6 });
        await tick();
        expect(fixtures.setHeatMode.mock.calls).toEqual([[fixtures.bodies[0], 1]]);
        expect(fixtures.setHeatSetpoint.mock.calls).toEqual([[fixtures.bodies[0], 81]]);
    });

    it('keeps no-change heat settings untouched on activation', async () => {
        addSchedule(1, 6);
        fixtures.bodies.push({ id: 1, circuit: 6 });
        await tick();
        expect(fixtures.setHeatMode).not.toHaveBeenCalled();
        expect(fixtures.setHeatSetpoint).not.toHaveBeenCalled();
        expect(fixtures.setCoolSetpoint).not.toHaveBeenCalled();
        expect(fixtures.setCircuit.mock.calls).toEqual([[6, true]]);
    });

    it('does not overwrite a user heat change after activation', async () => {
        addSchedule(1, 6, { heatSource: 1, heatSetpoint: 82 });
        fixtures.bodies.push({ id: 1, circuit: 6, setPoint: 70 });
        fixtures.setHeatSetpoint.mockImplementation(async (body, temperature) => { body.setPoint = temperature; });
        await tick();
        expect(fixtures.bodies[0].setPoint).toBe(82);
        fixtures.bodies[0].setPoint = 86;
        await tick();
        expect(fixtures.bodies[0].setPoint).toBe(86);
        expect(fixtures.setHeatSetpoint).toHaveBeenCalledTimes(1);
    });

    it.each([[1, 2, 8], [1, 8, 2], [8, 2, 1], [2, 8, 1], [8, 1, 2], [2, 1, 8]])(
        'puts the body first for input %s, %s, %s', async (...order) => {
            order.forEach((circuit, index) => addSchedule(index + 1, circuit));
            fixtures.bodies.push({ id: 2, circuit: 1 });
            await tick();
            expect(fixtures.setCircuit.mock.calls).toEqual([[1, true], [8, true], [2, true]]);
        },
    );

    it('recognizes configured body circuits without hardcoded IDs', async () => {
        addSchedule(1, 40);
        addSchedule(2, 7);
        fixtures.bodies.push({ id: 1, circuit: 7 });
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[7, true], [40, true]]);
    });

    it('keeps body ties in schedule order and non-body IDs descending', async () => {
        [6, 1, 8, 2].forEach((circuit, index) => addSchedule(index + 1, circuit));
        fixtures.bodies.push({ id: 1, circuit: 6 }, { id: 2, circuit: 1 });
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[6, true], [1, true], [8, true], [2, true]]);
    });

    it('continues independent shutdown and activation after a heat command rejects', async () => {
        const failed = addSchedule(1, 1, { heatSource: 1 });
        const ending = addSchedule(2, 8, { isOn: true, triggered: true, scheduleTime: { shouldBeOn: false } });
        addSchedule(3, 2);
        fixtures.bodies.push({ id: 2, circuit: 1 });
        fixtures.circuits.get(8).isOn = true;
        fixtures.setHeatMode.mockRejectedValue(new Error('heat rejected'));
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, false], [2, true]]);
        expect(ending.triggered).toBe(false);
        expect(failed.triggered).toBe(false);
        expect(fixtures.error).toHaveBeenCalledWith(expect.stringContaining('circuit 1'));
        expect(fixtures.error).toHaveBeenCalledWith(expect.stringContaining('heat rejected'));
    });

    it('contains circuit-write rejection and retries the untriggered circuit next pass', async () => {
        const failed = addSchedule(1, 8);
        addSchedule(2, 2);
        fixtures.setCircuit.mockRejectedValueOnce(new Error('relay unavailable'));
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, true], [2, true]]);
        expect(failed.triggered).toBe(false);
        await tick();
        expect(failed.triggered).toBe(true);
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, true], [2, true], [8, true]]);
    });

    it('retains board authority to reject dependent activation after body failure', async () => {
        addSchedule(1, 1, { heatSource: 1 });
        const cleaner = addSchedule(2, 2);
        addSchedule(3, 8);
        fixtures.bodies.push({ id: 2, circuit: 1 });
        const relayWrites: number[] = [];
        fixtures.setHeatMode.mockRejectedValue(new Error('body heat failed'));
        fixtures.setCircuit.mockImplementation(async (id: number, on: boolean) => {
            if (id === 2 && !fixtures.circuits.get(1).isOn) throw new Error('body prerequisite unavailable');
            relayWrites.push(id);
            fixtures.circuits.get(id).isOn = on;
        });
        await tick();
        expect(relayWrites).toEqual([8]);
        expect(cleaner.triggered).toBe(false);
        expect(fixtures.error).toHaveBeenCalledTimes(2);
    });

    it('logs non-Error rejections and still processes the next circuit', async () => {
        addSchedule(1, 8);
        addSchedule(2, 2);
        fixtures.setCircuit.mockRejectedValueOnce('relay unavailable');
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[8, true], [2, true]]);
        expect(fixtures.error).toHaveBeenCalledWith(
            'Error triggering nixie schedules for circuit 8 (schedules 1): relay unavailable',
        );
    });
});

describe('clearExpiredTriggerState and re-entrancy (issue #1243)', () => {
    it('clears triggered and logs for an orphaned schedule returned by getActiveSchedules with !isOn && !shouldBeOn', async () => {
        // The schedule IS in getActiveSchedules but the main loop skips it at the !isOn && !shouldBeOn
        // guard (line 99), so only clearExpiredTriggerState can reset it.
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: false } });
        await tick();
        expect(schedule.triggered).toBe(false);
        expect(fixtures.info).toHaveBeenCalledWith(
            expect.stringContaining('Clearing stale trigger state for schedule 1'),
        );
    });

    it('clears triggered for a schedule invisible to getActiveSchedules (filtered out by activeFilter)', async () => {
        // The schedule lives in fixtures.schedules (visible to clearExpiredTriggerState via
        // length/getItemByIndex) but is excluded from getActiveSchedules by activeFilter.
        // This is the gap the original proposal missed: without clearExpiredTriggerState the
        // evaluation loop never sees the schedule and therefore never resets its triggered flag.
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: false } });
        fixtures.activeFilter = (s: any) => s.id !== 1;
        await tick();
        expect(schedule.triggered).toBe(false);
        expect(fixtures.info).toHaveBeenCalledWith(
            expect.stringContaining('Clearing stale trigger state for schedule 1'),
        );
    });

    it('does NOT clear isOn on a schedule whose window closed while circuit is still on, and still issues OFF write', async () => {
        // isOn=true guard in clearExpiredTriggerState must skip this schedule so it survives
        // into the evaluation loop, which then issues the OFF command.  (#1243)
        addSchedule(1, 8, { isOn: true, triggered: true, scheduleTime: { shouldBeOn: false } });
        fixtures.circuits.get(8).isOn = true;
        await tick();
        // OFF write must have been issued — proof that isOn was not wiped by cleanup
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, false);
    });

    it('clears isOn with the latches once the window closed and the circuit is already off', async () => {
        // Residual case: the schedule still reports isOn but the circuit is off, so no OFF
        // command is outstanding.  Cleanup must not depend on the syncScheduleStates() isOn
        // clobber to make this record eligible.  (#1243)
        const schedule = addSchedule(1, 8, { isOn: true, triggered: true, scheduleTime: { shouldBeOn: false } });
        fixtures.circuits.get(8).isOn = false;
        await tick();
        expect([schedule.isOn, schedule.triggered, schedule.manualPriorityActive]).toEqual([false, false, false]);
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
    });

    it('does NOT clear triggered for a schedule inside its window (manual-off suppression preserved)', async () => {        // shouldBeOn=true guard in clearExpiredTriggerState must skip this schedule so the
        // manual-off suppression latch (triggered=true) is preserved for the remainder of
        // the occurrence.
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        await tick();
        expect(schedule.triggered).toBe(true);
        // clearExpiredTriggerState must not have produced a cleanup log for this schedule
        expect(fixtures.info).not.toHaveBeenCalledWith(
            expect.stringContaining('Clearing stale trigger state for schedule 1'),
        );
    });

    it('re-entrant triggerSchedules call is a no-op; outer pass issues one circuit write and marks schedule triggered', async () => {
        // setCircuitStateAsync re-enters triggerSchedules on the same collection instance.
        // The inner call must return immediately (_triggering guard) without issuing any
        // additional circuit writes.  The outer pass must still complete.
        const schedule = addSchedule(1, 8);
        const col = new NixieScheduleCollection({} as any);
        fixtures.setCircuit.mockImplementation(async (id: number, on: boolean) => {
            await col.triggerSchedules(); // re-entrant — must be a no-op
            fixtures.circuits.get(id).isOn = on;
        });
        await col.triggerSchedules();
        expect(fixtures.setCircuit).toHaveBeenCalledTimes(1);
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, true);
        expect(schedule.triggered).toBe(true);
    });

    it('suppression logging fires once per occurrence, then again after activation clears the latch', async () => {
        // All schedules for the circuit are triggered but the circuit is off: suppression
        // is logged exactly once.  A second tick with identical state must not re-log.
        // After activation (_suppressionLogged cleared) and a subsequent manual-off,
        // suppression is logged again.
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const col = new NixieScheduleCollection({} as any);

        // Tick 1: suppression logged for the first time
        await col.triggerSchedules();
        expect(fixtures.info).toHaveBeenCalledWith(expect.stringContaining('Schedule 1 should be on but circuit'));
        const logCount1 = fixtures.info.mock.calls.length;

        // Tick 2: same suppressed state — must NOT produce a second log entry
        await col.triggerSchedules();
        expect(fixtures.info.mock.calls.length).toBe(logCount1);

        // Activation: clear triggered so the schedule fires and _suppressionLogged is cleared
        schedule.triggered = false;
        await col.triggerSchedules();
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, true);
        expect(schedule.triggered).toBe(true);

        // Simulate manual-off after activation (circuit goes off, schedule.isOn=false, triggered stays true)
        fixtures.circuits.get(8).isOn = false;
        schedule.isOn = false;

        // Tick after re-suppression: latch was cleared on activation so suppression is logged again
        await col.triggerSchedules();
        const logCount2 = fixtures.info.mock.calls.length;
        expect(logCount2).toBeGreaterThan(logCount1);
        expect(fixtures.info).toHaveBeenLastCalledWith(expect.stringContaining('Schedule 1 should be on but circuit'));
    });
});
describe('in-window divergence (ISSUE-232)', () => {
    // THIS IS THE GUARD TEST.  A deliberate manual off must be respected for the remainder
    // of the occurrence.  Any recovery mechanism for the forced-off case that also re-asserts
    // here has regressed the Manual OP spec quoted at Schedule.ts:73-94 and must not ship.
    it.each([false, true])(
        'never re-asserts a circuit across repeated polls while suppressed in-window (manualPriority=%s)',
        async priority => {
            fixtures.options.manualPriority = priority;
            // Window is open, the schedule already fired and latched, and the circuit is now off.
            const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
            fixtures.circuits.get(8).isOn = false;
            const tickOnce = collection();
            for (let i = 0; i < 6; i++) await tickOnce();
            expect(fixtures.setCircuit).not.toHaveBeenCalled();
            expect(schedule.triggered).toBe(true);
            expect(fixtures.circuits.get(8).isOn).toBe(false);
        },
    );

    it('keeps the suppression visible in the log without acting on it', async () => {
        addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        await tickOnce();
        expect(fixtures.info).toHaveBeenCalledWith(expect.stringContaining('Schedule 1'));
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
    });
});

describe('divergence condition is observable (ISSUE-232 resolution c)', () => {
    it('records divergedSince as an instant and holds it steady across polls', async () => {
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        await tickOnce();
        const first = schedule.divergedSince;
        expect(first).toBeInstanceOf(Date);
        await tickOnce();
        // The condition marks when divergence STARTED; it must not be refreshed on every poll or
        // a consumer cannot tell how long the schedule has been stranded.
        expect(schedule.divergedSince).toBe(first);
    });

    it('clears divergedSince when the schedule activates', async () => {
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        await tickOnce();
        expect(schedule.divergedSince).toBeInstanceOf(Date);
        // Simulate the window re-arming after the latch was cleared at window close.
        schedule.triggered = false;
        await tickOnce();
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, true);
        expect(schedule.divergedSince).toBeUndefined();
    });

    it('clears divergedSince once the window closes', async () => {
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        await tickOnce();
        expect(schedule.divergedSince).toBeInstanceOf(Date);
        schedule.scheduleTime.shouldBeOn = false;
        await tickOnce();
        expect(schedule.divergedSince).toBeUndefined();
        expect(schedule.triggered).toBe(false);
    });

    it('does not set divergedSince on a healthy activation', async () => {
        const schedule = addSchedule(1, 8);
        await tick();
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, true);
        expect(schedule.divergedSince).toBeUndefined();
    });
});

describe('no-retry policy is cause-independent (ISSUE-232 resolution b)', () => {
    // The scheduler cannot read provenance, and the agreed policy is that it does not need to:
    // an off circuit stands the schedule down for the occurrence whatever turned it off.  These
    // tests pin that policy so a future change cannot quietly introduce a re-assert.
    it.each([
        ['a deliberate manual off', false],
        ['a non-user actor such as a group egg-timer cascade', false],
    ])('does not re-assert the circuit after %s', async (_cause, priority) => {
        fixtures.options.manualPriority = priority;
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        for (let i = 0; i < 4; i++) await tickOnce();
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
        expect(schedule.divergedSince).toBeInstanceOf(Date);
    });

    it('stands down only for the occurrence — the next window fires normally', async () => {
        const schedule = addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        const tickOnce = collection();
        await tickOnce();
        expect(fixtures.setCircuit).not.toHaveBeenCalled();
        // Window closes: the stand-down state is cleared, proving this is a deadline and not a latch.
        schedule.scheduleTime.shouldBeOn = false;
        await tickOnce();
        expect([schedule.triggered, schedule.isOn]).toEqual([false, false]);
        expect(schedule.divergedSince).toBeUndefined();
        // Next occurrence opens.
        schedule.scheduleTime.shouldBeOn = true;
        await tickOnce();
        expect(fixtures.setCircuit).toHaveBeenCalledWith(8, true);
        expect(schedule.triggered).toBe(true);
    });

    it('stands down per circuit without blocking an unrelated schedule in the same pass', async () => {
        addSchedule(1, 8, { triggered: true, isOn: false, scheduleTime: { shouldBeOn: true } });
        addSchedule(2, 2);
        await tick();
        expect(fixtures.setCircuit.mock.calls).toEqual([[2, true]]);
    });
});
