/*
 * HydraulicsCalc.ts
 * Pure hydraulic math helpers for pool pump scheduling.
 * No project-level imports — safe to use in unit tests and CLI scripts.
 *
 * Physics notes
 * ─────────────
 * Affinity Laws (centrifugal pumps):
 *   Flow scales linearly with RPM:    Q2 = Q1 × (RPM2 / RPM1)
 *   Head scales as the square:        H2 = H1 × (RPM2 / RPM1)²
 *   Power scales as the cube:         P2 = P1 × (RPM2 / RPM1)³
 *
 * GPM ↔ RPM model used here:
 *   Rather than a full TDH (Total Dynamic Head) curve, we use a single
 *   empirical reference point (referenceRPM → referenceGPM measured at
 *   the user's system pressure) and scale linearly via the affinity law.
 *   This is accurate enough for residential plumbing where TDH changes
 *   only modestly across the VS operating range.
 *
 * Pipe velocity / flow limit:
 *   1.5" Schedule-40 PVC: recommended max 5 ft/s → ≈50 GPM at that bore.
 *   Exceeding this causes hydraulic noise and risk of cavitation at the
 *   pump volute; the algorithm hard-caps GPM at poolConfig.maxSafeGPM.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoolConfig {
    poolVolumeGallons: number;
    maxSafeGPM: number;         // Pipe flow ceiling (1.5" → 50 GPM)
    maxPumpRPM: number;         // Hayward Super Pump VS 700: 3450
    minPumpRPM: number;         // Firmware minimum: 600 (algorithm floor: 1000)
    targetTurnovers: number;    // Gallons to move = volume × this (default 1.2)
    referenceRPM: number;       // Empirical calibration point RPM (default 2850)
    referenceGPM: number;       // Actual GPM measured at referenceRPM (default 45)
    highBlockStartHour: number; // Hour (0-23) the High block begins (default 6)
    highBlockDurationHours: number; // Fixed High block duration in hours (default 2)
    medBlockDurationHours: number;  // Minimum Medium block duration in hours (default 4)
    lowBlockMinHours: number;   // Low block floor (default 10)
    lowBlockMaxHours: number;   // Low block ceiling (default 14)
    equipmentRequirements: {
        heaterMinGPM: number;   // Minimum flow for heater ignition (default 30)
        saltCellMinGPM: number; // Minimum flow for salt cell operation (default 25)
        skimmerMinGPM: number;  // Minimum flow for surface skimming (default 45)
    };
}

export interface ScheduleBlock {
    phase: 'high' | 'medium' | 'low';
    rpm: number;
    gpm: number;
    durationHours: number;
    startMinutes: number; // Minutes from midnight (0–1439)
    endMinutes: number;
    gallons: number;
    estimatedWatts: number;
    /** True when this block's GPM is below saltCellMinGPM — caller should log a warning */
    saltCellWarning: boolean;
}

export interface SchedulePlan {
    blocks: [ScheduleBlock, ScheduleBlock, ScheduleBlock];
    totalGallons: number;
    totalRunHours: number;
    turnovers: number;
}

// ─── Core math ────────────────────────────────────────────────────────────────

/**
 * Target volume to move per day.
 *   turnoverVolume = poolVolume × targetTurnovers
 */
export function calcTurnoverVolume(poolVolumeGallons: number, targetTurnovers: number): number {
    return poolVolumeGallons * targetTurnovers;
}

/**
 * Average GPM required across total run hours to hit target volume.
 *   averageGPM = turnoverVolume / (totalRunHours × 60)
 */
export function calcTargetGPM(turnoverVolumeGallons: number, totalRunHours: number): number {
    return turnoverVolumeGallons / (totalRunHours * 60);
}

/**
 * Convert RPM → GPM using the linear affinity-law model anchored to a
 * known empirical reference point.
 *   gpm = referenceGPM × (rpm / referenceRPM)
 *
 * This is the Q-scaling leg of the Affinity Laws (flow ∝ RPM).
 */
export function gpmForRPM(rpm: number, referenceRPM: number, referenceGPM: number): number {
    return referenceGPM * (rpm / referenceRPM);
}

/**
 * Convert GPM → RPM (inverse of gpmForRPM).
 *   rpm = referenceRPM × (gpm / referenceGPM)
 */
export function rpmForGPM(gpm: number, referenceRPM: number, referenceGPM: number): number {
    return referenceRPM * (gpm / referenceGPM);
}

/**
 * Pump Affinity Law — power scaling.
 *   P2 = P1 × (RPM2 / RPM1)³
 *
 * Energy savings are dramatic: dropping from 3450 → 1000 RPM reduces power
 * consumption to just (1000/3450)³ ≈ 2.4 % of full-speed draw.
 *
 * @param p1Watts   Known power draw at rpm1
 * @param rpm1      Reference RPM corresponding to p1
 * @param rpm2      Target RPM to estimate power for
 */
export function affinityPower(p1Watts: number, rpm1: number, rpm2: number): number {
    return p1Watts * Math.pow(rpm2 / rpm1, 3);
}

// ─── Schedule block builder ────────────────────────────────────────────────────

const ALGO_MIN_RPM = 1000;   // Floor for Low block — keeps filter pressure adequate
const LOW_TIER_MAX_RPM = 1500; // If Low block hours overflow 14h, nudge RPM up to here

/**
 * Compute the full 24-hour three-block schedule plan from a pool configuration.
 *
 * Algorithm:
 *   1. High block  — fixed 2 hrs at the highest RPM that stays ≤ maxSafeGPM.
 *                    Sized for surface skimming and pre-filter priming.
 *   2. Medium block — fixed (medBlockDurationHours) hrs at the RPM required to
 *                    safely exceed heaterMinGPM.  Covers heating cycles and
 *                    salt-cell chlorination at adequate flow.
 *   3. Low block   — fills remaining turnover volume at the lowest practical RPM
 *                    (≥1000 RPM floor).  Duration is clamped to [lowMin, lowMax].
 *                    If the required hours exceed lowMax, RPM is nudged up until
 *                    the hours fit — maximising Affinity Law energy savings.
 *
 * @param cfg  Pool configuration (see PoolConfig)
 * @param referenceWattsAtMaxRPM  Optional reference power draw at maxPumpRPM.
 *             Hayward Super Pump VS 700 nameplate: ~1100 W at max speed.
 *             Used only for estimatedWatts; does not affect RPM/GPM/time math.
 */
export function calcScheduleBlocks(cfg: PoolConfig, referenceWattsAtMaxRPM = 1100): SchedulePlan {
    const { poolVolumeGallons, targetTurnovers, maxSafeGPM, maxPumpRPM,
            minPumpRPM, referenceRPM, referenceGPM,
            highBlockStartHour, highBlockDurationHours, medBlockDurationHours,
            lowBlockMinHours, lowBlockMaxHours, equipmentRequirements } = cfg;

    // ── 1. Turnover target ─────────────────────────────────────────────────────
    const turnoverVolume = calcTurnoverVolume(poolVolumeGallons, targetTurnovers);

    // ── 2. High block ──────────────────────────────────────────────────────────
    // Target GPM = 90 % of the pipe ceiling so there is headroom.
    // Convert to RPM and clamp to hardware limits.
    // NOTE: the Hayward VS 700 has a known firmware speed plateau around 2967 RPM
    // (≈86 % of 3450).  We stay well below at ≈82 % (2850 RPM) to avoid it.
    const highTargetGPM = maxSafeGPM * 0.90;
    const highRPMRaw = rpmForGPM(highTargetGPM, referenceRPM, referenceGPM);
    const highRPM = Math.min(Math.round(highRPMRaw / 10) * 10, maxPumpRPM);
    const highGPM = Math.min(gpmForRPM(highRPM, referenceRPM, referenceGPM), maxSafeGPM);
    const highGallons = highGPM * highBlockDurationHours * 60;
    const highStart = highBlockStartHour * 60;
    const highEnd = highStart + highBlockDurationHours * 60;
    const highWatts = affinityPower(referenceWattsAtMaxRPM, maxPumpRPM, highRPM);

    // ── 3. Medium block ────────────────────────────────────────────────────────
    // Target: at least heaterMinGPM + 5 GPM margin to guarantee heater ignition
    // and salt-cell minimum in a single comfortable band.
    const medTargetGPM = equipmentRequirements.heaterMinGPM + 5;
    const medRPMRaw = rpmForGPM(medTargetGPM, referenceRPM, referenceGPM);
    const medRPM = Math.max(
        Math.min(Math.round(medRPMRaw / 10) * 10, maxPumpRPM),
        minPumpRPM
    );
    const medGPM = gpmForRPM(medRPM, referenceRPM, referenceGPM);
    const medGallons = medGPM * medBlockDurationHours * 60;
    const medStart = highEnd;
    const medEnd = medStart + medBlockDurationHours * 60;
    const medWatts = affinityPower(referenceWattsAtMaxRPM, maxPumpRPM, medRPM);

    // ── 4. Low block — find the lowest RPM that fits the window ───────────────
    const remainingGallons = turnoverVolume - highGallons - medGallons;

    // Start with the algorithm minimum RPM and work up if needed.
    let lowRPM = Math.max(ALGO_MIN_RPM, minPumpRPM);
    let lowGPM = gpmForRPM(lowRPM, referenceRPM, referenceGPM);
    let lowHoursNeeded = remainingGallons / (lowGPM * 60);

    // If we need more than lowBlockMaxHours, nudge RPM up in 10-RPM steps
    // until the hours fit — but cap the nudge at LOW_TIER_MAX_RPM.
    while (lowHoursNeeded > lowBlockMaxHours && lowRPM < LOW_TIER_MAX_RPM) {
        lowRPM += 10;
        lowGPM = gpmForRPM(lowRPM, referenceRPM, referenceGPM);
        lowHoursNeeded = remainingGallons / (lowGPM * 60);
    }

    // Clamp duration to the configured window.
    const lowDurationHours = Math.max(lowBlockMinHours, Math.min(lowHoursNeeded, lowBlockMaxHours));
    const lowGallons = lowGPM * lowDurationHours * 60;
    const lowStart = medEnd;
    // endMinutes may cross midnight (> 1440) — callers must handle wrap-around.
    const lowEnd = lowStart + Math.round(lowDurationHours * 60);
    const lowWatts = affinityPower(referenceWattsAtMaxRPM, maxPumpRPM, lowRPM);

    // ── 5. Assemble plan ───────────────────────────────────────────────────────
    const high: ScheduleBlock = {
        phase: 'high',
        rpm: highRPM,
        gpm: parseFloat(highGPM.toFixed(1)),
        durationHours: highBlockDurationHours,
        startMinutes: highStart,
        endMinutes: highEnd,
        gallons: Math.round(highGallons),
        estimatedWatts: Math.round(highWatts),
        saltCellWarning: highGPM < equipmentRequirements.saltCellMinGPM,
    };

    const medium: ScheduleBlock = {
        phase: 'medium',
        rpm: medRPM,
        gpm: parseFloat(medGPM.toFixed(1)),
        durationHours: medBlockDurationHours,
        startMinutes: medStart,
        endMinutes: medEnd,
        gallons: Math.round(medGallons),
        estimatedWatts: Math.round(medWatts),
        saltCellWarning: medGPM < equipmentRequirements.saltCellMinGPM,
    };

    const low: ScheduleBlock = {
        phase: 'low',
        rpm: lowRPM,
        gpm: parseFloat(lowGPM.toFixed(1)),
        durationHours: parseFloat(lowDurationHours.toFixed(2)),
        startMinutes: lowStart,
        endMinutes: lowEnd,
        gallons: Math.round(lowGallons),
        estimatedWatts: Math.round(lowWatts),
        saltCellWarning: lowGPM < equipmentRequirements.saltCellMinGPM,
    };

    const totalGallons = high.gallons + medium.gallons + low.gallons;
    const totalRunHours = high.durationHours + medium.durationHours + low.durationHours;

    return {
        blocks: [high, medium, low],
        totalGallons,
        totalRunHours: parseFloat(totalRunHours.toFixed(2)),
        turnovers: parseFloat((totalGallons / poolVolumeGallons).toFixed(3)),
    };
}

/** Format minutes-from-midnight as "HH:MM" for display / logging. */
export function minutesToTime(minutes: number): string {
    const m = ((minutes % 1440) + 1440) % 1440; // normalise negative / overflow
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
