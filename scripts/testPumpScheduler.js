#!/usr/bin/env node
/**
 * testPumpScheduler.js
 * Standalone hydraulics test script — no project imports required.
 *
 * Usage:
 *   node scripts/testPumpScheduler.js
 *   node scripts/testPumpScheduler.js --volume 25000 --turnovers 1.3
 *
 * Edit the DEFAULT_CONFIG block below to match your pool, then run this to
 * validate the schedule before deploying it on the controller.
 */
'use strict';

// ─── Inline hydraulics math (mirrors HydraulicsCalc.ts) ─────────────────────

function gpmForRPM(rpm, referenceRPM, referenceGPM) {
    return referenceGPM * (rpm / referenceRPM);
}

function rpmForGPM(gpm, referenceRPM, referenceGPM) {
    return referenceRPM * (gpm / referenceGPM);
}

function affinityPower(p1Watts, rpm1, rpm2) {
    return p1Watts * Math.pow(rpm2 / rpm1, 3);
}

function minutesToTime(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const ALGO_MIN_RPM = 1000;
const LOW_TIER_MAX_RPM = 1500;

function calcScheduleBlocks(cfg, referenceWattsAtMaxRPM) {
    referenceWattsAtMaxRPM = referenceWattsAtMaxRPM || 1100;

    const turnoverVolume = cfg.poolVolumeGallons * cfg.targetTurnovers;

    // ── High block ────────────────────────────────────────────────────────────
    const highTargetGPM = cfg.maxSafeGPM * 0.90;
    const highRPMRaw = rpmForGPM(highTargetGPM, cfg.referenceRPM, cfg.referenceGPM);
    const highRPM = Math.min(Math.round(highRPMRaw / 10) * 10, cfg.maxPumpRPM);
    const highGPM = Math.min(gpmForRPM(highRPM, cfg.referenceRPM, cfg.referenceGPM), cfg.maxSafeGPM);
    const highGallons = highGPM * cfg.highBlockDurationHours * 60;
    const highStart = cfg.highBlockStartHour * 60;
    const highEnd = highStart + cfg.highBlockDurationHours * 60;
    const highWatts = affinityPower(referenceWattsAtMaxRPM, cfg.maxPumpRPM, highRPM);

    // ── Medium block ──────────────────────────────────────────────────────────
    const medTargetGPM = cfg.equipmentRequirements.heaterMinGPM + 5;
    const medRPMRaw = rpmForGPM(medTargetGPM, cfg.referenceRPM, cfg.referenceGPM);
    const medRPM = Math.max(Math.min(Math.round(medRPMRaw / 10) * 10, cfg.maxPumpRPM), cfg.minPumpRPM);
    const medGPM = gpmForRPM(medRPM, cfg.referenceRPM, cfg.referenceGPM);
    const medGallons = medGPM * cfg.medBlockDurationHours * 60;
    const medStart = highEnd;
    const medEnd = medStart + cfg.medBlockDurationHours * 60;
    const medWatts = affinityPower(referenceWattsAtMaxRPM, cfg.maxPumpRPM, medRPM);

    // ── Low block ─────────────────────────────────────────────────────────────
    const remainingGallons = turnoverVolume - highGallons - medGallons;

    let lowRPM = Math.max(ALGO_MIN_RPM, cfg.minPumpRPM);
    let lowGPM = gpmForRPM(lowRPM, cfg.referenceRPM, cfg.referenceGPM);
    let lowHoursNeeded = remainingGallons / (lowGPM * 60);

    while (lowHoursNeeded > cfg.lowBlockMaxHours && lowRPM < LOW_TIER_MAX_RPM) {
        lowRPM += 10;
        lowGPM = gpmForRPM(lowRPM, cfg.referenceRPM, cfg.referenceGPM);
        lowHoursNeeded = remainingGallons / (lowGPM * 60);
    }

    const lowDurationHours = Math.max(cfg.lowBlockMinHours, Math.min(lowHoursNeeded, cfg.lowBlockMaxHours));
    const lowGallons = lowGPM * lowDurationHours * 60;
    const lowStart = medEnd;
    const lowEnd = lowStart + Math.round(lowDurationHours * 60);
    const lowWatts = affinityPower(referenceWattsAtMaxRPM, cfg.maxPumpRPM, lowRPM);

    const blocks = [
        {
            phase: 'High',
            rpm: highRPM,
            gpm: highGPM,
            durationHours: cfg.highBlockDurationHours,
            startMinutes: highStart,
            endMinutes: highEnd,
            gallons: highGallons,
            estimatedWatts: highWatts,
            saltCellWarning: highGPM < cfg.equipmentRequirements.saltCellMinGPM,
        },
        {
            phase: 'Medium',
            rpm: medRPM,
            gpm: medGPM,
            durationHours: cfg.medBlockDurationHours,
            startMinutes: medStart,
            endMinutes: medEnd,
            gallons: medGallons,
            estimatedWatts: medWatts,
            saltCellWarning: medGPM < cfg.equipmentRequirements.saltCellMinGPM,
        },
        {
            phase: 'Low',
            rpm: lowRPM,
            gpm: lowGPM,
            durationHours: lowDurationHours,
            startMinutes: lowStart,
            endMinutes: lowEnd,
            gallons: lowGallons,
            estimatedWatts: lowWatts,
            saltCellWarning: lowGPM < cfg.equipmentRequirements.saltCellMinGPM,
        },
    ];

    return {
        blocks,
        totalGallons: highGallons + medGallons + lowGallons,
        totalRunHours: cfg.highBlockDurationHours + cfg.medBlockDurationHours + lowDurationHours,
        turnovers: (highGallons + medGallons + lowGallons) / cfg.poolVolumeGallons,
    };
}

// ─── Pool configuration ───────────────────────────────────────────────────────
// Edit this block to match your pool.

const DEFAULT_CONFIG = {
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

// ─── CLI argument overrides ───────────────────────────────────────────────────
// Supports: --volume <n>  --turnovers <n>  --refRPM <n>  --refGPM <n>

const args = process.argv.slice(2);
const cfg = Object.assign({}, DEFAULT_CONFIG);

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--volume':    cfg.poolVolumeGallons = parseFloat(args[++i]); break;
        case '--turnovers': cfg.targetTurnovers   = parseFloat(args[++i]); break;
        case '--refRPM':    cfg.referenceRPM       = parseFloat(args[++i]); break;
        case '--refGPM':    cfg.referenceGPM        = parseFloat(args[++i]); break;
        default: console.warn(`Unknown arg: ${args[i]}`);
    }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const plan = calcScheduleBlocks(cfg, 1100);

const PHASE_W  = 8;
const TIME_W   = 7;
const RPM_W    = 6;
const GPM_W    = 6;
const WATTS_W  = 7;
const GAL_W    = 9;
const HOURS_W  = 8;

const sep = '+' + '-'.repeat(PHASE_W + 2) + '+' + '-'.repeat(TIME_W + 2) + '+' +
            '-'.repeat(TIME_W + 2) + '+' + '-'.repeat(RPM_W + 2) + '+' +
            '-'.repeat(GPM_W + 2) + '+' + '-'.repeat(WATTS_W + 2) + '+' +
            '-'.repeat(GAL_W + 2) + '+' + '-'.repeat(HOURS_W + 2) + '+';

function pad(val, width) {
    const s = String(typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : val);
    return s.padStart(width);
}

console.log('\n24-Hour Pump Schedule Simulation');
console.log(`Pool: ${cfg.poolVolumeGallons.toLocaleString()} gal   ` +
            `Target: ${cfg.targetTurnovers}× turnovers   ` +
            `Ref: ${cfg.referenceRPM} RPM → ${cfg.referenceGPM} GPM\n`);

console.log(sep);
console.log(
    `| ${'Phase'.padEnd(PHASE_W)} | ${'Start'.padEnd(TIME_W - 1)} | ${'End'.padEnd(TIME_W - 1)} | ` +
    `${'RPM'.padStart(RPM_W)} | ${'GPM'.padStart(GPM_W)} | ${'Watts'.padStart(WATTS_W)} | ` +
    `${'Gallons'.padStart(GAL_W)} | ${'Hours'.padStart(HOURS_W)} |`
);
console.log(sep);

let totalKWh = 0;
for (const b of plan.blocks) {
    const kWh = (b.estimatedWatts / 1000) * b.durationHours;
    totalKWh += kWh;
    const flag = b.saltCellWarning ? ' ⚠' : '';
    console.log(
        `| ${(b.phase + flag).padEnd(PHASE_W)} | ${minutesToTime(b.startMinutes).padEnd(TIME_W - 1)} | ` +
        `${minutesToTime(b.endMinutes).padEnd(TIME_W - 1)} | ${pad(b.rpm, RPM_W)} | ` +
        `${pad(b.gpm, GPM_W)} | ${pad(Math.round(b.estimatedWatts), WATTS_W)} | ` +
        `${pad(Math.round(b.gallons), GAL_W)} | ${pad(b.durationHours, HOURS_W)} |`
    );
}
console.log(sep);

const targetGal = Math.round(cfg.poolVolumeGallons * cfg.targetTurnovers);
const pctOfTarget = ((plan.totalGallons / targetGal) * 100).toFixed(1);
console.log(`\nTotal gallons:   ${Math.round(plan.totalGallons).toLocaleString()}`);
console.log(`Target gallons:  ${targetGal.toLocaleString()}  (${cfg.targetTurnovers}× turnovers)`);
console.log(`Actual turnovers: ${plan.turnovers.toFixed(3)}  (${pctOfTarget}% of target)`);
console.log(`Total runtime:   ${plan.totalRunHours.toFixed(2)} hours`);
console.log(`Est. daily energy: ${totalKWh.toFixed(2)} kWh`);

if (plan.turnovers < 1.0) {
    console.warn('\n⚠  WARNING: Total turnovers < 1.0 — increase run time or target RPM.');
}
if (plan.turnovers > 2.0) {
    console.warn('\n⚠  NOTE: Total turnovers > 2.0 — consider lowering targetTurnovers to save energy.');
}

console.log('');
