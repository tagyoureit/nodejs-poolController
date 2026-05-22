/*
 * HydraulicsCalc.ts
 * Pure hydraulic math helpers for pool pump scheduling.
 * No project-level imports — safe to use in unit tests and CLI scripts.
 *
 * Physics
 * ───────
 * Affinity Laws (centrifugal pumps):
 *   Flow scales linearly with RPM:  Q2 = Q1 × (RPM2 / RPM1)
 *   Power scales as the cube:       P2 = P1 × (RPM2 / RPM1)³
 *
 * GPM ↔ RPM model:
 *   Anchored to a single empirical reference point per pipe size and scaled
 *   linearly via the affinity law — accurate enough for residential plumbing.
 *
 * Pipe flow limits (velocity ≤ 5 ft/s rule of thumb):
 *   1.5" Schedule-40 PVC: max safe ~50 GPM
 *   2.0" Schedule-40 PVC: max safe ~75 GPM
 */

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * The only three inputs the user needs to supply.
 * All hydraulic parameters (RPM caps, reference curves, durations) are derived
 * automatically inside calcScheduleBlocks.
 */
export interface SimplePoolConfig {
    poolVolumeGallons: number;  // Pool water volume in gallons (e.g. 20000)
    pipeDiameter: 1.5 | 2;     // Main plumbing size in inches
}

export interface ScheduleBlock {
    phase: 'high' | 'medium' | 'low';
    rpm: number;
    gpm: number;
    durationHours: number;
    startMinutes: number;   // Minutes from midnight (0–1439)
    endMinutes: number;
    gallons: number;
}

export interface SchedulePlan {
    blocks: [ScheduleBlock, ScheduleBlock, ScheduleBlock];  // [high, medium, low]
    totalGallons: number;
    totalRunHours: number;
    turnovers: number;
}

// ─── Math utilities ────────────────────────────────────────────────────────────

/** Flow scales linearly with RPM (affinity law, first leg). */
export function gpmForRPM(rpm: number, refRPM: number, refGPM: number): number {
    return refGPM * (rpm / refRPM);
}

/** Inverse: GPM → RPM. */
export function rpmForGPM(gpm: number, refRPM: number, refGPM: number): number {
    return refRPM * (gpm / refGPM);
}

/** Power scales as the cube of the RPM ratio (affinity law, third leg). */
export function affinityPower(p1Watts: number, rpm1: number, rpm2: number): number {
    return p1Watts * Math.pow(rpm2 / rpm1, 3);
}

/** Convert minutes-from-midnight to "HH:MM" string. */
export function minutesToTime(minutes: number): string {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

// ─── Pipe-size constants ───────────────────────────────────────────────────────

interface PipeTier {
    maxSafeGPM: number;         // Velocity-safe flow ceiling (≤ 5 ft/s rule)
}

const PIPE_TIERS: Record<string, PipeTier> = {
    '1.5': { maxSafeGPM: 50 },
    '2':   { maxSafeGPM: 75 },
};

// ─── Scheduling policy (hardcoded — not user-configurable) ────────────────────

const TARGET_TURNOVERS    = 1.2;   // Gallons/day = pool volume × 1.2
const HIGH_START_HOUR     = 6;     // 6 AM — morning skim and filter prime
const HIGH_DURATION_HRS   = 2;     // High block is always 2 hours
const MEDIUM_DURATION_HRS = 4;     // Chemistry window — keeps flow switch closed
const MEDIUM_TARGET_GPM   = 30;    // Minimum GPM to close the salt-cell flow switch
const ALGO_MIN_RPM        = 1000;  // RPM floor (filter pressure / seal longevity)
const LOW_MAX_RPM         = 1500;  // RPM ceiling for low block (energy efficiency)
const MAX_LOW_HOURS       = 14;    // Maximum low-block runtime

// ─── Schedule builder ─────────────────────────────────────────────────────────

/**
 * Compute the daily three-block pump schedule.
 *
 * The reference curve is anchored dynamically to (pumpMaxRPM, maxSafeGPM) so
 * the schedule scales correctly for any VS pump and pipe size combination.
 *
 *   HIGH block   — 2 hrs at 90 % of the pipe's max safe GPM (= 90 % of max RPM).
 *                  Morning surface skim and filter prime.
 *
 *   MEDIUM block — 4 hrs at exactly MEDIUM_TARGET_GPM (30 GPM).
 *                  Keeps the salt-cell / chemistry flow switch closed.
 *
 *   LOW block    — fills the remaining turnover volume at the lowest practical
 *                  RPM (≥ ALGO_MIN_RPM).  RPM is nudged up in 10-RPM steps if
 *                  the volume cannot fit in MAX_LOW_HOURS (capped at LOW_MAX_RPM).
 *
 * @param cfg        User pool config (volume + pipe diameter).
 * @param pumpMaxRPM Pump's hardware maximum RPM (from sys.pumps, default 3450).
 */
export function calcScheduleBlocks(cfg: SimplePoolConfig, pumpMaxRPM: number): SchedulePlan {
    const pipe = PIPE_TIERS[String(cfg.pipeDiameter)];
    if (!pipe) throw new Error(`Unknown pipe diameter: ${cfg.pipeDiameter}`);

    const { maxSafeGPM } = pipe;
    // Dynamic reference curve: at pumpMaxRPM the pump delivers maxSafeGPM.
    // All RPM ↔ GPM conversions use this calibration anchor.
    const refRPM = pumpMaxRPM;
    const refGPM = maxSafeGPM;
    const targetGallons = cfg.poolVolumeGallons * TARGET_TURNOVERS;

    // ── HIGH block ─────────────────────────────────────────────────────────────
    // Run at 90 % of max safe GPM → 90 % of pump max RPM.
    const highRPM  = Math.min(
        Math.round(rpmForGPM(maxSafeGPM * 0.9, refRPM, refGPM) / 10) * 10,
        pumpMaxRPM
    );
    const highGPM  = parseFloat(gpmForRPM(highRPM, refRPM, refGPM).toFixed(1));
    const highGals = Math.round(highGPM * HIGH_DURATION_HRS * 60);
    const highStart = HIGH_START_HOUR * 60;
    const highEnd   = highStart + HIGH_DURATION_HRS * 60;

    // ── MEDIUM block (chemistry window) ────────────────────────────────────────
    const mediumRPM = Math.max(
        ALGO_MIN_RPM,
        Math.min(
            Math.round(rpmForGPM(MEDIUM_TARGET_GPM, refRPM, refGPM) / 10) * 10,
            pumpMaxRPM
        )
    );
    const mediumGPM  = parseFloat(gpmForRPM(mediumRPM, refRPM, refGPM).toFixed(1));
    const mediumGals = Math.round(mediumGPM * MEDIUM_DURATION_HRS * 60);
    const mediumStart = highEnd;
    const mediumEnd   = mediumStart + MEDIUM_DURATION_HRS * 60;

    // ── LOW block ──────────────────────────────────────────────────────────────
    const remaining = Math.max(0, targetGallons - highGals - mediumGals);
    let lowRPM  = ALGO_MIN_RPM;
    let lowGPM  = gpmForRPM(lowRPM, refRPM, refGPM);
    let lowHours = remaining > 0 ? remaining / (lowGPM * 60) : 0;

    // Nudge RPM up in 10-RPM steps until the volume fits within MAX_LOW_HOURS.
    while (lowHours > MAX_LOW_HOURS && lowRPM < LOW_MAX_RPM) {
        lowRPM  += 10;
        lowGPM   = gpmForRPM(lowRPM, refRPM, refGPM);
        lowHours = remaining / (lowGPM * 60);
    }

    const lowDurationHours = parseFloat(Math.min(lowHours, MAX_LOW_HOURS).toFixed(2));
    const lowStart = mediumEnd;
    const lowEnd   = lowStart + Math.round(lowDurationHours * 60);

    // ── Assemble ───────────────────────────────────────────────────────────────
    const highBlock: ScheduleBlock = {
        phase: 'high',
        rpm: highRPM,
        gpm: highGPM,
        durationHours: HIGH_DURATION_HRS,
        startMinutes: highStart,
        endMinutes: highEnd,
        gallons: highGals,
    };

    const mediumBlock: ScheduleBlock = {
        phase: 'medium',
        rpm: mediumRPM,
        gpm: mediumGPM,
        durationHours: MEDIUM_DURATION_HRS,
        startMinutes: mediumStart,
        endMinutes: mediumEnd,
        gallons: mediumGals,
    };

    const lowBlock: ScheduleBlock = {
        phase: 'low',
        rpm: lowRPM,
        gpm: parseFloat(lowGPM.toFixed(1)),
        durationHours: lowDurationHours,
        startMinutes: lowStart,
        endMinutes: lowEnd,
        gallons: Math.round(lowGPM * lowDurationHours * 60),
    };

    const totalGallons  = highBlock.gallons + mediumBlock.gallons + lowBlock.gallons;
    const totalRunHours = HIGH_DURATION_HRS + MEDIUM_DURATION_HRS + lowDurationHours;

    return {
        blocks: [highBlock, mediumBlock, lowBlock],
        totalGallons,
        totalRunHours: parseFloat(totalRunHours.toFixed(2)),
        turnovers: parseFloat((totalGallons / cfg.poolVolumeGallons).toFixed(3)),
    };
}
