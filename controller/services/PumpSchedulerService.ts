/*
 * PumpSchedulerService.ts
 * Automatically generates and applies a 24-hour variable-speed pump schedule
 * based on hydraulic calculations (see HydraulicsCalc.ts).
 *
 * Integration:
 *   • Called from controller/nixie/Nixie.ts initAsync() / closeAsync().
 *   • Writes schedule entries via sys.board.schedules.setScheduleAsync() — the
 *     same path used by the REST config API — so schedule changes appear in the
 *     dashboard and survive controller restarts.
 *   • Creates three Feature circuits (IDs configured in services.pumpScheduler)
 *     that are mapped as pump circuits at the computed RPMs.  The existing
 *     NixiePumpVS.setTargetSpeed() logic then picks the highest-RPM active
 *     feature and drives the pump accordingly.
 *
 * Schedule ID constraints:
 *   sys.equipment.maxSchedules defaults to 12.  This service reserves the top
 *   three IDs (default 10/11/12) so it never collides with user schedules.
 *
 * Daily regeneration:
 *   At midnight the schedule times are recomputed (times are stable but RPMs
 *   may shift if the config has changed).  Uses setTimeout → re-arm rather than
 *   setInterval so the timer always fires at the next real midnight boundary.
 */
import { EventEmitter } from 'events';
import { logger } from '../../logger/Logger';
import { config } from '../../config/Config';
import { sys } from '../Equipment';
import { state } from '../State';
import { webApp } from '../../web/Server';
import {
    SimplePoolConfig, SchedulePlan, ScheduleBlock,
    calcScheduleBlocks, minutesToTime,
} from './HydraulicsCalc';

// ─── Default configuration ────────────────────────────────────────────────────

const DEFAULT_POOL_CONFIG: SimplePoolConfig = {
    poolVolumeGallons: 20000,
    pipeDiameter: 1.5,
};

// Default fallback when the pump's maxSpeed is unavailable (e.g. not yet configured).
const DEFAULT_PUMP_MAX_RPM = 3450;

// scheduleType 128 = "Repeats" (daily on selected days).
// See SystemBoard.ts scheduleTypes value map.
const SCHEDULE_TYPE_REPEAT = 128;
// scheduleDays 0x7F = all 7 days (bits 0-6 set, one per day).
const ALL_DAYS = 0x7f;
// scheduleTimeType 0 = manual (the only valid value in the base board).
const TIME_TYPE_MANUAL = 0;

interface SchedulerConfig {
    enabled: boolean;
    pumpId: number;
    featureIds: { high: number; medium: number; low: number };
    scheduleIds: { high: number; medium: number; low: number };
    poolConfig: SimplePoolConfig;
}

const DEFAULT_SCHEDULER_CFG: SchedulerConfig = {
    enabled: false,
    pumpId: 1,
    featureIds: { high: 0, medium: 0, low: 0 },
    scheduleIds: { high: 10, medium: 11, low: 12 },
    poolConfig: DEFAULT_POOL_CONFIG,
};

// ─── Service class ────────────────────────────────────────────────────────────

export class PumpSchedulerService {
    public readonly emitter = new EventEmitter();

    private _midnightTimer: NodeJS.Timeout | null = null;
    private _cfg: SchedulerConfig = { ...DEFAULT_SCHEDULER_CFG };
    private _lastPlan: SchedulePlan | null = null;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    public async initAsync(): Promise<void> {
        try {
            logger.info('PumpSchedulerService: initializing');
            this._loadConfig();

            if (!this._cfg.enabled) {
                logger.info('PumpSchedulerService: disabled in config, skipping');
                return;
            }

            // Listen for hot-reloads so a config file change triggers a regen.
            config.emitter.on('reloaded', () => {
                this._loadConfig();
                if (this._cfg.enabled) {
                    logger.info('PumpSchedulerService: config reloaded, regenerating');
                    this.generateScheduleAsync().catch(err =>
                        logger.error(`PumpSchedulerService config reload regen error: ${err.message}`)
                    );
                }
            });

            await this._ensureFeaturesExistAsync();
            await this.generateScheduleAsync();
            this._armMidnightTimer();
            logger.info('PumpSchedulerService: initialized');
        } catch (err) {
            logger.error(`PumpSchedulerService initAsync: ${err.message}`);
            // Non-fatal — pool controller continues without the scheduler.
        }
    }

    public async closeAsync(): Promise<void> {
        if (this._midnightTimer) {
            clearTimeout(this._midnightTimer);
            this._midnightTimer = null;
        }
        config.emitter.removeAllListeners('reloaded');
        logger.info('PumpSchedulerService: closed');
    }

    // ── Public API (used by REST routes) ──────────────────────────────────────

    /** Recompute the schedule and push it to sys.schedules. */
    public async generateScheduleAsync(): Promise<SchedulePlan> {
        try {
            const pump = sys.pumps.getItemById(this._cfg.pumpId);
            const pumpMaxRPM = (pump && pump.isActive && pump.maxSpeed > 0)
                ? pump.maxSpeed
                : DEFAULT_PUMP_MAX_RPM;

            const plan = calcScheduleBlocks(this._cfg.poolConfig, pumpMaxRPM);
            this._lastPlan = plan;

            this._logPlan(plan);
            await this._writeSchedulesAsync(plan);

            this.emitter.emit('scheduleGenerated', plan);
            webApp.emitToClients('pumpScheduler', this.getScheduleSnapshot());
            return plan;
        } catch (err) {
            logger.error(`PumpSchedulerService generateScheduleAsync: ${err.message}`);
            return Promise.reject(err);
        }
    }

    /** Merge new pool config values and regenerate. */
    public async updateConfigAsync(data: Partial<SchedulerConfig>): Promise<SchedulePlan> {
        try {
            if (data.poolConfig) {
                this._cfg.poolConfig = Object.assign({}, this._cfg.poolConfig, data.poolConfig);
            }
            if (typeof data.enabled !== 'undefined') this._cfg.enabled = data.enabled;
            if (typeof data.pumpId !== 'undefined') this._cfg.pumpId = data.pumpId;
            if (data.featureIds) this._cfg.featureIds = Object.assign({}, this._cfg.featureIds, data.featureIds);
            if (data.scheduleIds) this._cfg.scheduleIds = Object.assign({}, this._cfg.scheduleIds, data.scheduleIds);

            this._saveConfig();

            await this._ensureFeaturesExistAsync();
            const plan = await this.generateScheduleAsync();
            await this._ensurePumpCircuitsAsync(plan);
            return plan;
        } catch (err) {
            logger.error(`PumpSchedulerService updateConfigAsync: ${err.message}`);
            return Promise.reject(err);
        }
    }

    /** Return current plan + config for REST responses. */
    public getScheduleSnapshot(): object {
        return {
            enabled: this._cfg.enabled,
            pumpId: this._cfg.pumpId,
            featureIds: this._cfg.featureIds,
            scheduleIds: this._cfg.scheduleIds,
            poolConfig: this._cfg.poolConfig,
            plan: this._lastPlan,
        };
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private _loadConfig(): void {
        const saved = config.getSection('web.services.pumpScheduler', {});
        // Merge saved values over defaults so any omitted field uses the default.
        this._cfg = {
            enabled: saved.enabled ?? DEFAULT_SCHEDULER_CFG.enabled,
            pumpId: saved.pumpId ?? DEFAULT_SCHEDULER_CFG.pumpId,
            featureIds: Object.assign({}, DEFAULT_SCHEDULER_CFG.featureIds, saved.featureIds),
            scheduleIds: Object.assign({}, DEFAULT_SCHEDULER_CFG.scheduleIds, saved.scheduleIds),
            poolConfig: Object.assign({}, DEFAULT_POOL_CONFIG, saved.poolConfig),
        };
    }

    private _saveConfig(): void {
        config.setSection('web.services.pumpScheduler', {
            enabled: this._cfg.enabled,
            pumpId: this._cfg.pumpId,
            featureIds: this._cfg.featureIds,
            scheduleIds: this._cfg.scheduleIds,
            poolConfig: this._cfg.poolConfig,
        });
    }

    /**
     * Ensure the three speed-tier Feature circuits exist so that:
     *   1. setScheduleAsync() passes its circuit-reference validation.
     *   2. NixiePumpVS.setTargetSpeed() can read their isOn state.
     * Features are created with showInFeatures: false so they don't clutter the UI.
     */
    private async _ensureFeaturesExistAsync(): Promise<void> {
        const wanted: Array<{ key: 'high' | 'medium' | 'low'; name: string }> = [
            { key: 'high',   name: 'PumpSched-High'   },
            { key: 'medium', name: 'PumpSched-Medium' },
            { key: 'low',    name: 'PumpSched-Low'    },
        ];
        let dirty = false;
        for (const w of wanted) {
            // If we already have a tracked ID, verify it still exists.
            const trackedId = this._cfg.featureIds[w.key];
            if (trackedId > 0) {
                const existing = sys.features.find(f => f.id === trackedId && f.isActive);
                if (existing) continue;
            }
            // Search by name in case it was created with a different ID.
            const byName = sys.features.find(f => f.name === w.name && f.isActive);
            if (byName) {
                if (this._cfg.featureIds[w.key] !== byName.id) {
                    this._cfg.featureIds[w.key] = byName.id;
                    dirty = true;
                }
                continue;
            }
            // Create it — no id supplied so the board auto-assigns from the valid range.
            try {
                const feat = await sys.board.features.setFeatureAsync({ name: w.name, showInFeatures: false });
                logger.info(`PumpSchedulerService: created feature ${feat.id} (${w.name})`);
                this._cfg.featureIds[w.key] = feat.id;
                dirty = true;
            } catch (err) {
                logger.error(`PumpSchedulerService: could not create feature (${w.name}): ${err.message}`);
            }
        }
        if (dirty) this._saveConfig();
    }

    /**
     * When the scheduler is first enabled, automatically add the two managed
     * Feature circuits to the pump's circuit list (if not already present).
     * Does NOT update RPMs on existing entries — preserves user customisation.
     */
    private async _ensurePumpCircuitsAsync(plan: SchedulePlan): Promise<void> {
        const pump = sys.pumps.getItemById(this._cfg.pumpId);
        if (!pump.isActive) {
            logger.warn(
                `PumpSchedulerService: pump ${this._cfg.pumpId} not found — ` +
                `add PumpSched-High and PumpSched-Low circuits manually.`
            );
            return;
        }

        const existingCircuits: any[] = pump.circuits.get();
        const rpmUnits = sys.board.valueMaps.pumpUnits.getValue('rpm');

        const toAdd = [
            { circuit: this._cfg.featureIds.high,   speed: plan.blocks[0].rpm },
            { circuit: this._cfg.featureIds.medium, speed: plan.blocks[1].rpm },
            { circuit: this._cfg.featureIds.low,    speed: plan.blocks[2].rpm },
        ].filter(d => !existingCircuits.find((pc: any) => pc.circuit === d.circuit));

        if (toAdd.length === 0) return;

        const merged = [
            ...existingCircuits,
            ...toAdd.map(d => ({ circuit: d.circuit, speed: d.speed, units: rpmUnits })),
        ];

        try {
            await sys.board.pumps.setPumpAsync({ id: this._cfg.pumpId, circuits: merged });
            for (const d of toAdd) {
                logger.info(
                    `PumpSchedulerService: added circuit ${d.circuit} @ ${d.speed} RPM ` +
                    `to pump ${this._cfg.pumpId}`
                );
            }
        } catch (err) {
            logger.error(`PumpSchedulerService: failed to auto-configure pump circuits: ${err.message}`);
        }
    }

    /**
     * Write (or update) the three managed schedule entries in sys.schedules.
     * Uses scheduleType 128 (Repeats) with all-days bitmask 0x7F.
     *
     * If the user already has schedules occupying the reserved IDs those
     * schedules are overwritten — the IDs are documented in defaultConfig.json.
     *
     * Guard: if sys.equipment.maxSchedules is less than the highest reserved ID
     * the method logs a warning instead of throwing so the controller keeps running.
     */
    private async _writeSchedulesAsync(plan: SchedulePlan): Promise<void> {
        const maxSched = sys.equipment.maxSchedules;
        const ids   = this._cfg.scheduleIds;
        const feats = this._cfg.featureIds;

        const entries = [
            { id: ids.high,   featureId: feats.high,   block: plan.blocks[0] },
            { id: ids.medium, featureId: feats.medium, block: plan.blocks[1] },
            { id: ids.low,    featureId: feats.low,    block: plan.blocks[2] },
        ];

        for (const entry of entries) {
            if (entry.id > maxSched) {
                logger.warn(
                    `PumpSchedulerService: schedule ID ${entry.id} exceeds maxSchedules (${maxSched}). ` +
                    `Increase sys.equipment.maxSchedules or lower scheduleIds in config.`
                );
                continue;
            }

            const { block } = entry;
            // endMinutes may exceed 1439 (past midnight) — wrap to [0, 1439].
            const endTime = block.endMinutes % 1440;

            try {
                const sched = await sys.board.schedules.setScheduleAsync({
                    id: entry.id,
                    circuit: entry.featureId,
                    scheduleType: SCHEDULE_TYPE_REPEAT,
                    scheduleDays: ALL_DAYS,
                    startTime: block.startMinutes,
                    endTime,
                    startTimeType: TIME_TYPE_MANUAL,
                    endTimeType: TIME_TYPE_MANUAL,
                    heatSource: 0,
                    isActive: true,
                });
                logger.verbose(
                    `PumpSchedulerService: wrote schedule #${entry.id} ` +
                    `[${block.phase}] ${minutesToTime(block.startMinutes)}–${minutesToTime(block.endMinutes)} ` +
                    `@ ${block.rpm} RPM (${block.gpm} GPM)`
                );
                webApp.emitToClients('schedule', sched.get(true));
            } catch (err) {
                logger.error(
                    `PumpSchedulerService: failed to write schedule #${entry.id} (${block.phase}): ${err.message}`
                );
            }
        }
    }

    /**
     * Fire at the next midnight using setTimeout (not setInterval).
     * setInterval(fn, 86400000) drifts — it fires 24h from *service start*,
     * not from midnight.  This implementation calculates exact ms to midnight
     * and re-arms itself after each fire so it always aligns to 00:00:00.
     */
    private _armMidnightTimer(): void {
        if (this._midnightTimer) clearTimeout(this._midnightTimer);
        const now = Date.now();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0); // next midnight
        const msUntilMidnight = midnight.getTime() - now;

        this._midnightTimer = setTimeout(async () => {
            logger.info('PumpSchedulerService: midnight — regenerating daily schedule');
            try {
                await this.generateScheduleAsync();
            } catch (err) {
                logger.error(`PumpSchedulerService midnight regen: ${err.message}`);
            }
            this._armMidnightTimer(); // re-arm for the next night
        }, msUntilMidnight);
    }

    private _logPlan(plan: SchedulePlan): void {
        logger.info(
            `PumpSchedulerService: plan — ${plan.totalGallons.toLocaleString()} gal / ` +
            `${plan.turnovers.toFixed(2)} turnovers / ${plan.totalRunHours.toFixed(1)} hrs`
        );
        for (const b of plan.blocks) {
            logger.info(
                `  [${b.phase.padEnd(6)}] ${minutesToTime(b.startMinutes)}–${minutesToTime(b.endMinutes)} ` +
                `${b.rpm} RPM  ${b.gpm} GPM  ~${b.estimatedWatts} W  ${b.gallons.toLocaleString()} gal`
            );
        }
    }
}

export const pumpScheduler = new PumpSchedulerService();
