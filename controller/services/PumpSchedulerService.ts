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
    PoolConfig, SchedulePlan, ScheduleBlock,
    calcScheduleBlocks, minutesToTime,
} from './HydraulicsCalc';

// ─── Default configuration ────────────────────────────────────────────────────

const DEFAULT_POOL_CONFIG: PoolConfig = {
    poolVolumeGallons: 20000,
    maxSafeGPM: 50,
    maxPumpRPM: 3450,
    minPumpRPM: 600,
    targetTurnovers: 1.2,
    referenceRPM: 2850,
    referenceGPM: 45,
    highBlockStartHour: 6,
    highBlockDurationHours: 2,
    medBlockDurationHours: 4,
    lowBlockMinHours: 10,
    lowBlockMaxHours: 14,
    equipmentRequirements: {
        heaterMinGPM: 30,
        saltCellMinGPM: 25,
        skimmerMinGPM: 45,
    },
};

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
    poolConfig: PoolConfig;
}

const DEFAULT_SCHEDULER_CFG: SchedulerConfig = {
    enabled: true,
    pumpId: 1,
    // Feature IDs 14-16 sit at the top of the default 7-16 feature range,
    // leaving room for user-defined features below.
    featureIds: { high: 14, medium: 15, low: 16 },
    // Schedule IDs 10-12 sit at the top of the default 1-12 schedule range.
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
            const plan = calcScheduleBlocks(this._cfg.poolConfig);
            this._lastPlan = plan;

            // Warn if salt cell flow requirements won't be met.
            for (const block of plan.blocks) {
                if (block.saltCellWarning) {
                    logger.warn(
                        `PumpSchedulerService: ${block.phase} block GPM (${block.gpm}) is below ` +
                        `saltCellMinGPM (${this._cfg.poolConfig.equipmentRequirements.saltCellMinGPM}). ` +
                        `Salt chlorination may be reduced during this period.`
                    );
                }
            }

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
            // Deep-merge poolConfig if provided.
            if (data.poolConfig) {
                this._cfg.poolConfig = Object.assign({}, this._cfg.poolConfig, data.poolConfig);
                if (data.poolConfig.equipmentRequirements) {
                    this._cfg.poolConfig.equipmentRequirements = Object.assign(
                        {},
                        this._cfg.poolConfig.equipmentRequirements,
                        data.poolConfig.equipmentRequirements
                    );
                }
            }
            if (typeof data.enabled !== 'undefined') this._cfg.enabled = data.enabled;
            if (typeof data.pumpId !== 'undefined') this._cfg.pumpId = data.pumpId;
            if (data.featureIds) this._cfg.featureIds = Object.assign({}, this._cfg.featureIds, data.featureIds);
            if (data.scheduleIds) this._cfg.scheduleIds = Object.assign({}, this._cfg.scheduleIds, data.scheduleIds);

            this._saveConfig();

            await this._ensureFeaturesExistAsync();
            return await this.generateScheduleAsync();
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
            poolConfig: Object.assign({}, DEFAULT_POOL_CONFIG, saved.poolConfig, {
                equipmentRequirements: Object.assign(
                    {},
                    DEFAULT_POOL_CONFIG.equipmentRequirements,
                    saved.poolConfig?.equipmentRequirements
                ),
            }),
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
        const featureMap = [
            { id: this._cfg.featureIds.high,   name: 'PumpSched-High'   },
            { id: this._cfg.featureIds.medium,  name: 'PumpSched-Medium' },
            { id: this._cfg.featureIds.low,     name: 'PumpSched-Low'    },
        ];
        for (const f of featureMap) {
            const existing = sys.features.find(feat => feat.id === f.id);
            if (typeof existing === 'undefined' || !existing.isActive) {
                try {
                    await sys.board.features.setFeatureAsync({ id: f.id, name: f.name, showInFeatures: false });
                    logger.info(`PumpSchedulerService: created feature ${f.id} (${f.name})`);
                } catch (err) {
                    logger.error(`PumpSchedulerService: could not create feature ${f.id}: ${err.message}`);
                }
            }
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
        const ids = this._cfg.scheduleIds;
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
                `${b.rpm} RPM  ${b.gpm} GPM  ~${b.estimatedWatts} W  ${b.gallons.toLocaleString()} gal` +
                (b.saltCellWarning ? '  ⚠ salt-cell flow low' : '')
            );
        }
    }
}

export const pumpScheduler = new PumpSchedulerService();
