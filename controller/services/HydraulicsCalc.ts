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
    hasSaltCell: boolean;       // Has salt chlorinator — ensures low RPM keeps GPM ≥ 25
}

export interface ScheduleBlock {
    phase: 'high' | 'low';
    rpm: number;
    gpm: number;
    durationHours: number;
    startMinutes: number;   // Minutes from midnight (0–1439)
    endMinutes: number;
    gallons: number;
    estimatedWatts: number;
}

export interface SchedulePlan {
    blocks: [ScheduleBlock, ScheduleBlock];  // [high, low]
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
    maxSafeGPM: number;
    maxRPM: number;
    refRPM: number;   // Empirical calibration point
    refGPM: number;
    refWatts: number; // Estimated draw at refRPM (Hayward Super Pump VS)
}

const PIPE_TIERS: Record<string, PipeTier> = {
    '1.5': { maxSafeGPM: 50, maxRPM: 2850, refRPM: 2850, refGPM: 45, refWatts: 900  },
    '2':   { maxSafeGPM: 75, maxRPM: 3450, refRPM: 3000, refGPM: 65, refWatts: 1100 },
};

// ─── Scheduling policy (hardcoded — not user-configurable) ────────────────────

const TARGET_TURNOVERS  = 1.2;   // Gallons/day = pool volume × 1.2
const HIGH_START_HOUR   = 6;     // 6 AM — morning skim and filter prime
const HIGH_DURATION_HRS = 2;     // High block is always 2 hours
const SALT_CELL_MIN_GPM = 25;    // Salt cell flow-switch trip point
const ALGO_MIN_RPM      = 1000;  // RPM floor (filter pressure / seal longevity)
const LOW_MAX_RPM       = 1500;  // RPM ceiling for low block (energy efficiency)
const MAX_LOW_HOURS     = 14;    // Maximum low-block runtime

// ─── Schedule builder ─────────────────────────────────────────────────────────

/**
 * Compute the daily two-block pump schedule from a simplified pool config.
 *
 *   HIGH block — 2 hrs at 90 % of max safe GPM, starting at 6 AM.
 *                Morning surface skim and filter prime.
 *
 *   LOW block  — fills the remaining turnover volume at the lowest practical
 *                RPM.  If hasSaltCell is true, the RPM floor is raised so GPM
 *                stays ≥ 25 and the flow switch remains closed.
 *                If the volume cannot be moved in MAX_LOW_HOURS, RPM is nudged
 *                up in 10-RPM steps until it fits (capped at LOW_MAX_RPM or
 *                the salt-cell floor, whichever is higher).
 */
export function calcScheduleBlocks(cfg: SimplePoolConfig): SchedulePlan {
    const pipe = PIPE_TIERS[String(cfg.pipeDiameter)];
    if (!pipe) throw new Error(`Unknown pipe diameter: ${cfg.pipeDiameter}`);

    const { maxSafeGPM, maxRPM, refRPM, refGPM, refWatts } = pipe;
    const targetGallons = cfg.poolVolumeGallons * TARGET_TURNOVERS;

    // ── HIGH block ─────────────────────────────────────────────────────────────
    const highRPM  = Math.min(
        Math.round(rpmForGPM(maxSafeGPM * 0.9, refRPM, refGPM) / 10) * 10,
        maxRPM
    );
    const highGPM  = parseFloat(gpmForRPM(highRPM, refRPM, refGPM).toFixed(1));
    const highGals = Math.round(highGPM * HIGH_DURATION_HRS * 60);
    const highStart = HIGH_START_HOUR * 60;
    const highEnd   = highStart + HIGH_DURATION_HRS * 60;

    // ── LOW block ──────────────────────────────────────────────────────────────
    const remaining = targetGallons - highGals;

    // RPM floor: raise if salt cell needs GPM ≥ 25.
    const saltFloorRPM = Math.ceil(rpmForGPM(SALT_CELL_MIN_GPM, refRPM, refGPM) / 10) * 10;
    let lowRPM  = cfg.hasSaltCell ? Math.max(saltFloorRPM, ALGO_MIN_RPM) : ALGO_MIN_RPM;
    const lowRPMCap = cfg.hasSaltCell ? Math.max(LOW_MAX_RPM, saltFloorRPM) : LOW_MAX_RPM;

    let lowGPM   = gpmForRPM(lowRPM, refRPM, refGPM);
    let lowHours = remaining / (lowGPM * 60);

    // Nudge RPM up if volume cannot fit in MAX_LOW_HOURS.
    while (lowHours > MAX_LOW_HOURS && lowRPM < lowRPMCap) {
        lowRPM  += 10;
        lowGPM   = gpmForRPM(lowRPM, refRPM, refGPM);
        lowHours = remaining / (lowGPM * 60);
    }

    const lowDurationHours = parseFloat(Math.min(lowHours, MAX_LOW_HOURS).toFixed(2));
    const lowStart = highEnd;
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
        estimatedWatts: Math.round(affinityPower(refWatts, refRPM, highRPM)),
    };

    const lowBlock: ScheduleBlock = {
        phase: 'low',
        rpm: lowRPM,
        gpm: parseFloat(lowGPM.toFixed(1)),
        durationHours: lowDurationHours,
        startMinutes: lowStart,
        endMinutes: lowEnd,
        gallons: Math.round(lowGPM * lowDurationHours * 60),
        estimatedWatts: Math.round(affinityPower(refWatts, refRPM, lowRPM)),
    };

    const totalGallons  = highBlock.gallons + lowBlock.gallons;
    const totalRunHours = HIGH_DURATION_HRS + lowDurationHours;

    return {
        blocks: [highBlock, lowBlock],
        totalGallons,
        totalRunHours: parseFloat(totalRunHours.toFixed(2)),
        turnovers: parseFloat((totalGallons / cfg.poolVolumeGallons).toFixed(3)),
    };
}
