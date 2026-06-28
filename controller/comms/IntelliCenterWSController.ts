/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { logger } from '../../logger/Logger';
import { sys } from '../Equipment';
import { state } from '../State';
import { utils } from '../Constants';
import { icws } from './IntelliCenterWS';

type ParamMap = Record<string, string>;

const OBJTYP_DISPATCH: Record<string, (objnam: string, params: ParamMap) => void> = {
    'CIRCUIT': decodeCircuit,
    'FEATR': decodeFeature,
    'BODY': decodeBody,
    'SCHED': decodeSchedule,
    'PUMP': decodePump,
    'PMPCIRC': decodePumpCircuit,
    'HEATER': decodeHeater,
    'VALVE': decodeValve,
    'CHEM': decodeChemistry,
    'CHLOR': decodeChlorinator,
    'EXTINSTR': decodeCover,
    'REMOTE': decodeRemote,
    'REMBTN': decodeRemoteButton,
    'SENSE': decodeSensor,
    'CIRCGRP': decodeGroupMember,
    'MODULE': decodeModule,
    'PANEL': decodePanel,
    'PERMIT': decodeSecurity,
    'CLOCK': decodeClock,
};

function parseBool(val: string): boolean {
    if (typeof val !== 'string') return false;
    const v = val.toUpperCase();
    return v === 'ON' || v === '1' || v === 'TRUE' || v === 'YES';
}

function parseIntSafe(val: string, fallback: number = 0): number {
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

function hasDefinedParams(params: ParamMap): boolean {
    for (const key in params) {
        if (key === 'OBJTYP' || key === 'OBJNAM') continue;
        if (typeof params[key] !== 'undefined') return true;
    }
    return false;
}

function inferObjtyp(objnam: string): string {
    const upper = objnam.toUpperCase();
    if (upper.startsWith('PMP') && /^PMP\d+C\d/i.test(upper)) return 'PMPCIRC';
    if (upper.startsWith('PMP')) return 'PUMP';
    if (/^P\d{4,}$/.test(upper)) return 'PMPCIRC';
    if (upper.startsWith('FTR')) return 'FEATR';
    if (upper.startsWith('SCH')) return 'SCHED';
    if (upper.startsWith('HTR')) return 'HEATER';
    if (upper.startsWith('VLV')) return 'VALVE';
    if (upper.startsWith('CHR')) return 'CHLOR';
    if (upper.startsWith('CHM')) return 'CHEM';
    if (upper.startsWith('GRP')) return 'CIRCGRP';
    if (upper.startsWith('RMT')) return 'REMOTE';
    if (upper.startsWith('CVR')) return 'EXTINSTR';
    if (upper.startsWith('SNS')) return 'SENSE';
    if (upper.startsWith('B1')) return 'BODY';
    if (upper.startsWith('C') && /^C\d/.test(upper)) return 'CIRCUIT';
    if (upper.startsWith('M') && /^M\d/.test(upper)) return 'MODULE';
    return '';
}

function parseFloatSafe(val: string, fallback: number = 0): number {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
}

// Resolve a light theme value from OCP tokens. OCP individual-circuit NOTIFY
// includes both USE (token like SSET / MAGNTAR / CARIB) and LIMIT (numeric
// theme code 0..11). LIMIT is the authoritative source when present.
// USE-only NOTIFY (e.g. light groups whose LIMIT is the placeholder string
// "LIMIT") falls back to a token lookup against valueMaps.lightThemes wsToken,
// then name, then a numeric-string parse.
//
// IMPORTANT: only values 0..11 are themes. Values 12 (HOLD) and 13 (RECALL)
// are *command echoes* that OCP transiently broadcasts on USE/LIMIT after a
// Hold/Recall write — the underlying light theme has not actually changed.
// Returning `undefined` for those preserves whatever `lightingTheme` was
// already set, so dashPanel keeps showing the prior color instead of
// falling back to white via the valueMap default.
function lightThemeFromParams(params: ParamMap): number | undefined {
    if (typeof params['LIMIT'] !== 'undefined') {
        const n = parseInt(params['LIMIT'], 10);
        if (!isNaN(n) && n >= 0 && n <= 11) return n;
    }
    if (typeof params['USE'] !== 'undefined') {
        return lightThemeFromToken(params['USE']);
    }
    return undefined;
}

function lightThemeFromToken(token: string): number | undefined {
    if (!token || token === 'USE' || token === 'NONE') return undefined;
    const t = token.toUpperCase();
    // Reject HOLD/RECALL tokens and their numeric 12/13 echoes — see comment
    // on lightThemeFromParams. These are commands, not themes.
    if (t === 'HOLD' || t === 'RECALL' || t === '12' || t === '13') return undefined;
    const arr = sys.board.valueMaps.lightThemes.toArray() as any[];
    for (const entry of arr) {
        if (entry.wsToken && String(entry.wsToken).toUpperCase() === t) return entry.val;
        if (entry.name && String(entry.name).toUpperCase() === t) return entry.val;
    }
    const n = parseInt(t, 10);
    if (!isNaN(n) && n >= 0 && n <= 11) return n;
    return undefined;
}

function objnamToId(objnam: string): number {
    const m = objnam.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
}

function parentObjnamToId(objnam: string): number {
    const m = objnam.match(/(\d+)/);
    return m ? parseInt(m[0], 10) : 0;
}

function circuitObjnamToId(objnam: string): number {
    if (!objnam || objnam === 'NONE' || objnam === '' || objnam === '0') return 0;
    const n = objnamToId(objnam);
    if (objnam.startsWith('C') || objnam.startsWith('c')) return n;
    if (objnam.startsWith('FTR') || objnam.startsWith('ftr')) return n + 128;
    if (objnam.startsWith('GRP') || objnam.startsWith('grp')) return n + 192;
    if (objnam.startsWith('B1') || objnam.startsWith('b1')) {
        const bodyNum = parseInt(objnam.slice(1, 3), 10);
        if (bodyNum === 11) return 6;
        if (bodyNum === 12) return 1;
    }
    return n;
}

function parseTimeString(val: string): number {
    if (!val) return 0;
    const parts = val.split(',');
    if (parts.length >= 2) {
        return parseIntSafe(parts[0]) * 60 + parseIntSafe(parts[1]);
    }
    return parseIntSafe(val);
}

function parseBodyRef(val: string): number {
    if (!val || val === '00000' || val === 'NONE') return 0;
    const refs = val.trim().split(/\s+/);
    if (refs.length >= 2) return 32;
    const r = refs[0].toUpperCase();
    if (r.startsWith('B11')) return 1;
    if (r.startsWith('B12')) return 2;
    return 0;
}

function parseDayMask(val: string): number {
    if (!val) return 0;
    let mask = 0;
    const upper = val.toUpperCase();
    if (upper.includes('U')) mask |= 0x01;
    if (upper.includes('M')) mask |= 0x02;
    if (upper.includes('T') && !upper.includes('TH') || (upper.indexOf('T') !== upper.lastIndexOf('T'))) mask |= 0x04;
    if (upper.includes('W')) mask |= 0x08;
    if (upper.includes('R')) mask |= 0x10;
    if (upper.includes('F')) mask |= 0x20;
    if (upper.includes('A')) mask |= 0x40;
    if (mask === 0) {
        const n = parseIntSafe(val);
        if (n > 0) return n;
    }
    return mask;
}

function decodeCircuit(objnam: string, params: ParamMap): void {
    const upper = objnam.toUpperCase();
    if (upper.startsWith('X') || upper.startsWith('_')) return;
    if (upper.startsWith('FTR')) {
        decodeFeature(objnam, params);
        return;
    }
    if (upper.startsWith('GRP')) {
        // Incremental NotifyList for GRP## omits OBJTYP and SUBTYP (verified
        // in ws5.json capture). Without SUBTYP we cannot pick LITSHO vs
        // CIRCGRP from the params alone. Look up the existing group by id
        // and use its known type so STATUS-only updates aren't misrouted to
        // the circuit-group branch (which early-returns for ids already in
        // sys.lightGroups, silently dropping the STATUS).
        const subRaw = (params['SUBTYP'] || '').toUpperCase();
        const gId = objnamToId(objnam) + 192;
        let sub: 'LITSHO' | 'CIRCGRP';
        if (subRaw === 'LITSHO' || subRaw === 'CIRCGRP') {
            sub = subRaw;
        } else if (sys.lightGroups.find(g => g.id === gId)) {
            sub = 'LITSHO';
            logger.debug(`IntelliCenterWS: decodeCircuit GRP fallback resolved ${objnam} as LITSHO via sys.lightGroups lookup`);
        } else if (sys.circuitGroups.find(g => g.id === gId)) {
            sub = 'CIRCGRP';
            logger.debug(`IntelliCenterWS: decodeCircuit GRP fallback resolved ${objnam} as CIRCGRP via sys.circuitGroups lookup`);
        } else {
            sub = 'CIRCGRP';
        }
        decodeGroupFromCircuit(objnam, params, objnamToId(objnam), sub);
        return;
    }
    const id = objnamToId(objnam);
    if (id <= 0) return;
    const sub = (params['SUBTYP'] || '').toUpperCase();
    if (sub === 'LITSHO' || sub === 'CIRCGRP') {
        decodeGroupFromCircuit(objnam, params, id, sub);
        return;
    }
    const existing = sys.circuits.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const circ = sys.circuits.getItemById(id, true);
    circ.objnam = objnam;
    const scirc = state.circuits.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { circ.name = params['SNAME']; scirc.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeCircuitType(params['SUBTYP']);
        circ.type = t; scirc.type = t;
    }
    if (typeof params['STATUS'] !== 'undefined') {
        const newState = parseBool(params['STATUS']);
        logger.debug(`IntelliCenterWS: decodeCircuit ${objnam} id=${id} STATUS=${params['STATUS']} -> isOn=${newState} (was ${scirc.isOn})`);
        scirc.isOn = newState;
        syncValveStatesWS();
        sys.board.circuits.syncVirtualCircuitStates();
    }
    if (typeof params['FREEZE'] !== 'undefined') { circ.freeze = parseBool(params['FREEZE']); scirc.freezeProtect = parseBool(params['FREEZE']); }
    if (typeof params['FEATR'] !== 'undefined') { circ.showInFeatures = parseBool(params['FEATR']); scirc.showInFeatures = parseBool(params['FEATR']); }
    if (typeof params['TIME'] !== 'undefined') circ.eggTimer = parseIntSafe(params['TIME']);
    if (typeof params['DNTSTP'] !== 'undefined') circ.dontStop = parseBool(params['DNTSTP']);
    if (typeof params['LIMIT'] !== 'undefined' || typeof params['USE'] !== 'undefined') {
        const resolved = lightThemeFromParams(params);
        if (typeof resolved !== 'undefined') {
            circ.lightingTheme = resolved;
            scirc.lightingTheme = resolved;
        }
    }
    if (typeof params['ACT'] !== 'undefined') {
        const act = parseIntSafe(params['ACT']);
        if (act < 65535) scirc.action = act;
    }
    circ.master = 0; // OCP owns any circuit it reports over WS; clears stale master=1 from prior Nixie sessions
    circ.isActive = true;
    scirc.isActive = true;
}

function encodeCircuitType(subtyp: string): number {
    const s = (subtyp || '').toUpperCase();
    switch (s) {
        case 'SPA': return 13;
        case 'POOL': return 12;
        case 'SPILL': case 'SPILLWAY': return 1;
        case 'MASTER': case 'MASTERCLEANER': return 2;
        case 'CHEM': case 'CHEMRELAY': return 3;
        case 'LIGHT': return 4;
        case 'INTELLI': case 'INTELLIBRITE': return 5;
        case 'GLOW': case 'GLOBRITE': return 6;
        case 'GLOWT': case 'GLOBRITEWHITE': return 7;
        case 'MAGIC2': case 'MAGICSTREAM': return 8;
        case 'DIMMER': return 9;
        case 'CLRCASC': case 'COLORCASCADE': return 10;
        case 'MASTER2': case 'MASTERCLEANER2': return 11;
        default: return 0;
    }
}

function decodeFeatureFromCircuit(objnam: string, params: ParamMap, rawId: number): void {
    const fId = rawId + 128;
    const existing = sys.features.find(elem => elem.id === fId);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const feat = sys.features.getItemById(fId, true);
    feat.objnam = objnam;
    const sfeat = state.features.getItemById(fId, true);
    if (typeof params['SNAME'] !== 'undefined') { feat.name = params['SNAME']; sfeat.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeFeatureType(params['SUBTYP']);
        feat.type = t; sfeat.type = t;
    }
    if (typeof params['STATUS'] !== 'undefined') {
        sfeat.isOn = parseBool(params['STATUS']);
        syncValveStatesWS();
    }
    if (typeof params['FREEZE'] !== 'undefined') { feat.freeze = parseBool(params['FREEZE']); sfeat.freezeProtect = parseBool(params['FREEZE']); }
    if (typeof params['FEATR'] !== 'undefined') { feat.showInFeatures = parseBool(params['FEATR']); sfeat.showInFeatures = parseBool(params['FEATR']); }
    if (typeof params['TIME'] !== 'undefined') feat.eggTimer = parseIntSafe(params['TIME']);
    if (typeof params['DNTSTP'] !== 'undefined') feat.dontStop = parseBool(params['DNTSTP']);
    feat.isActive = true;
    sfeat.isActive = true;
}

function encodeFeatureType(subtyp: string): number {
    return 0;
}

function decodeGroupFromCircuit(objnam: string, params: ParamMap, rawId: number, sub: string): void {
    const gId = rawId + 192;
    if (sub === 'LITSHO') {
        sys.circuitGroups.removeItemById(gId);
        state.circuitGroups.removeItemById(gId);
        const existing = sys.lightGroups.find(elem => elem.id === gId);
        if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
        const grp = sys.lightGroups.getItemById(gId, true);
        grp.objnam = objnam;
        grp.type = 1;
        grp.isActive = true;
        const sgrp = state.lightGroups.getItemById(gId, true);
        sgrp.type = 1;
        sgrp.isActive = true;
        if (typeof params['SNAME'] !== 'undefined') { grp.name = params['SNAME']; sgrp.name = params['SNAME']; }
        if (typeof params['STATUS'] !== 'undefined') sgrp.isOn = parseBool(params['STATUS']);
        if (typeof params['ACT'] !== 'undefined' || typeof params['USE'] !== 'undefined' || typeof params['LIMIT'] !== 'undefined') {
            // For groups, prefer USE/LIMIT first (the authoritative theme on the
            // group object). ACT echoes the last-written command and frequently
            // arrives as the no-action sentinel 65535 on inbound NOTIFY — do not
            // let that overwrite the actual theme.
            const resolved = lightThemeFromParams(params)
                ?? (typeof params['ACT'] !== 'undefined' ? lightThemeFromToken(params['ACT']) : undefined);
            if (typeof resolved !== 'undefined') {
                grp.lightingTheme = resolved;
                sgrp.lightingTheme = resolved;
            }
        }
        if (typeof params['TIME'] !== 'undefined') grp.eggTimer = parseIntSafe(params['TIME']);
    } else {
        if (sys.lightGroups.find(elem => elem.id === gId)) return;
        const existing = sys.circuitGroups.find(elem => elem.id === gId);
        if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
        const grp = sys.circuitGroups.getItemById(gId, true);
        grp.objnam = objnam;
        grp.type = 2;
        grp.showInFeatures = true;
        const sgrp = state.circuitGroups.getItemById(gId, true);
        sgrp.type = 2;
        sgrp.showInFeatures = true;
        if (typeof params['SNAME'] !== 'undefined') { grp.name = params['SNAME']; sgrp.name = params['SNAME']; }
        if (typeof params['STATUS'] !== 'undefined') sgrp.isOn = parseBool(params['STATUS']);
        if (typeof params['TIME'] !== 'undefined') grp.eggTimer = parseIntSafe(params['TIME']);
        const hasName = typeof grp.name === 'string' && grp.name.length > 0 && grp.name !== 'None';
        grp.isActive = hasName;
        sgrp.isActive = hasName;
    }
}

function decodeFeature(objnam: string, params: ParamMap): void {
    if (objnam.startsWith('_')) return;
    const rawId = objnamToId(objnam);
    if (rawId <= 0) return;
    const fId = rawId + 128;
    const existing = sys.features.find(elem => elem.id === fId);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const feat = sys.features.getItemById(fId, true);
    feat.objnam = objnam;
    const sfeat = state.features.getItemById(fId, true);
    if (typeof params['SNAME'] !== 'undefined') { feat.name = params['SNAME']; sfeat.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeFeatureType(params['SUBTYP']);
        feat.type = t; sfeat.type = t;
    }
    if (typeof params['STATUS'] !== 'undefined') {
        sfeat.isOn = parseBool(params['STATUS']);
        syncValveStatesWS();
    }
    if (typeof params['FREEZE'] !== 'undefined') { feat.freeze = parseBool(params['FREEZE']); sfeat.freezeProtect = parseBool(params['FREEZE']); }
    if (typeof params['FEATR'] !== 'undefined') { feat.showInFeatures = parseBool(params['FEATR']); sfeat.showInFeatures = parseBool(params['FEATR']); }
    if (typeof params['TIME'] !== 'undefined') feat.eggTimer = parseIntSafe(params['TIME']);
    if (typeof params['DNTSTP'] !== 'undefined') feat.dontStop = parseBool(params['DNTSTP']);
    feat.isActive = true;
    sfeat.isActive = true;
}

function decodeBody(objnam: string, params: ParamMap): void {
    const rawId = objnamToId(objnam);
    if (rawId <= 0) return;
    let bodyId = rawId;
    if (objnam.startsWith('B11')) bodyId = 1;
    else if (objnam.startsWith('B12')) bodyId = 2;
    else if (objnam.startsWith('B13')) bodyId = 3;
    else if (objnam.startsWith('B14')) bodyId = 4;
    const body = sys.bodies.getItemById(bodyId, true);
    body.objnam = objnam;
    const sbody = state.temps.bodies.getItemById(bodyId, true);
    if (typeof params['SNAME'] !== 'undefined') { body.name = params['SNAME']; sbody.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeBodyType(params['SUBTYP']);
        body.type = t; sbody.type = t;
        if (t === 0) { body.circuit = 6; sbody.circuit = 6; }
        else if (t === 1) { body.circuit = 1; sbody.circuit = 1; }
    }
    if (!sbody.circuit) {
        if (sbody.type === 0) { body.circuit = 6; sbody.circuit = 6; }
        else if (sbody.type === 1) { body.circuit = 1; sbody.circuit = 1; }
    }
    if (typeof params['STATUS'] !== 'undefined') {
        sbody.isOn = parseBool(params['STATUS']);
        syncValveStatesWS();
        sys.board.circuits.syncVirtualCircuitStates();
    }
    if (typeof params['TEMP'] !== 'undefined') {
        const t = parseIntSafe(params['TEMP']);
        // Match RS-485 v1.x behavior (EquipmentStateMessage.ts:635, 643): only
        // overwrite a body's water temp when that body is currently on. OCP
        // broadcasts TEMP on every BODY object regardless of which is running,
        // so writing unconditionally would overwrite both bodies with the
        // active sensor reading.
        if (sbody.isOn) sbody.temp = t;
        else logger.debug(`decodeBody ${objnam}: suppressed TEMP=${t} write because sbody.isOn=false`);
    }
    if (typeof params['LOTMP'] !== 'undefined') { body.heatSetpoint = parseIntSafe(params['LOTMP']); sbody.heatSetpoint = parseIntSafe(params['LOTMP']); }
    if (typeof params['HITMP'] !== 'undefined') { body.coolSetpoint = parseIntSafe(params['HITMP']); sbody.coolSetpoint = parseIntSafe(params['HITMP']); }
    if (typeof params['MODE'] !== 'undefined') {
        const m = parseIntSafe(params['MODE']);
        logger.debug(`decodeBody ${objnam}: MODE=${params['MODE']} parsed=${m} snapshotComplete=${icws.snapshotComplete}`);
        body.heatMode = m;
        if (icws.snapshotComplete) sbody.heatMode = m;
    }
    if (typeof params['HTMODE'] !== 'undefined') {
        const m = parseIntSafe(params['HTMODE']);
        logger.debug(`decodeBody ${objnam}: HTMODE=${params['HTMODE']} parsed=${m} (heatStatus)`);
        sbody.heatStatus = m;
        sys.board.circuits.syncVirtualCircuitStates();
    }
    if (typeof params['HEATER'] !== 'undefined') {
        logger.debug(`decodeBody ${objnam}: HEATER=${params['HEATER']} (ignored for now)`);
    }
    if (typeof params['HTSRC'] !== 'undefined') {
        logger.debug(`decodeBody ${objnam}: HTSRC=${params['HTSRC']} (ignored for now)`);
    }
    if (typeof params['VOL'] !== 'undefined') body.capacity = parseIntSafe(params['VOL']);
    body.isActive = true;
}

function encodeBodyType(subtyp: string): number {
    const s = (subtyp || '').toUpperCase();
    switch (s) {
        case 'POOL': return 0;
        case 'SPA': return 1;
        default: return 0;
    }
}

function decodeSchedule(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam) + 1;
    logger.info(`decodeSchedule: ${objnam} id=${id} MODE=${params['MODE']} ACT=${params['ACT']} VACFLO=${params['VACFLO']} CIRCUIT=${params['CIRCUIT']} STATUS=${params['STATUS']} DAY=${params['DAY']}`);
    if (typeof params['CIRCUIT'] !== 'undefined') {
        const circVal = (params['CIRCUIT'] || '').toUpperCase();
        if (circVal.startsWith('X') || circVal === 'NONE' || circVal === '' || circVal === '0') {
            const existing = sys.schedules.find(elem => elem.id === id);
            if (typeof existing !== 'undefined') {
                logger.info(`IntelliCenterWS: schedule ${objnam} id=${id} deleted (CIRCUIT=${params['CIRCUIT']})`);
                const ssched = state.schedules.getItemById(id);
                ssched.isActive = false;
                existing.isActive = false;
                ssched.emitEquipmentChange();
                state.schedules.removeItemById(id);
                sys.schedules.removeItemById(id);
            }
            return;
        }
    }
    const existing = sys.schedules.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const sched = sys.schedules.getItemById(id, true);
    sched.objnam = objnam;
    const ssched = state.schedules.getItemById(id, true);
    if (typeof params['CIRCUIT'] !== 'undefined') {
        const cid = circuitObjnamToId(params['CIRCUIT']);
        sched.circuit = cid; ssched.circuit = cid;
    }
    if (typeof params['DAY'] !== 'undefined') {
        const d = parseDayMask(params['DAY']);
        sched.scheduleDays = d; ssched.scheduleDays = d;
    }
    if (typeof params['TIME'] !== 'undefined') {
        const t = parseTimeString(params['TIME']);
        sched.startTime = t; ssched.startTime = t;
    }
    if (typeof params['TIMOUT'] !== 'undefined') {
        const t = parseTimeString(params['TIMOUT']);
        sched.endTime = t; ssched.endTime = t;
    }
    if (typeof params['START'] !== 'undefined') {
        const st = encodeTimeType(params['START']);
        sched.startTimeType = st; ssched.startTimeType = st;
    }
    if (typeof params['STOP'] !== 'undefined') {
        const st = encodeTimeType(params['STOP']);
        sched.endTimeType = st; ssched.endTimeType = st;
    }
    sched.isActive = true;
    ssched.isActive = true;
    if (typeof params['VACFLO'] !== 'undefined') {
        const vac = parseBool(params['VACFLO']);
        sched.schedGroup = vac ? 1 : 0;
        ssched.schedGroup = vac ? 1 : 0;
    }
    if (typeof params['ACT'] !== 'undefined') {
        ssched.isOn = parseBool(params['ACT']);
    } else if (typeof params['STATUS'] !== 'undefined') {
        ssched.isOn = parseBool(params['STATUS']);
    }
    if (typeof params['SINGLE'] !== 'undefined') {
        const st = parseBool(params['SINGLE']) ? 0 : 128;
        sched.scheduleType = st; ssched.scheduleType = st;
    }
    if (typeof params['HEATER'] !== 'undefined') {
        const hs = parseIntSafe(params['HEATER']);
        sched.heatSource = hs; ssched.heatSource = hs;
    }
    if (typeof params['LOTMP'] !== 'undefined') {
        const ht = parseIntSafe(params['LOTMP']);
        sched.heatSetpoint = ht; ssched.heatSetpoint = ht;
    }
    if (typeof params['COOLING'] !== 'undefined') {
        const ct = parseIntSafe(params['COOLING']);
        sched.coolSetpoint = ct; ssched.coolSetpoint = ct;
    }
    if (typeof params['UPDATE'] !== 'undefined') {
        const parts = params['UPDATE'].split('/').map(s => parseInt(s, 10));
        if (parts.length === 3 && parts[2] > 0) {
            sched.startMonth = parts[0];
            sched.startDay = parts[1];
            sched.startYear = parts[2];
            ssched.startDate = new Date(2000 + parts[2], parts[0] - 1, parts[1]);
        }
    }
}

function encodeTimeType(val: string): number {
    const s = (val || '').toUpperCase();
    switch (s) {
        case 'SRIS': return 1;
        case 'SSET': return 2;
        default: return 0;
    }
}

function decodePump(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam);
    if (id <= 0) return;
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodePumpType(params['SUBTYP']);
        if (t === 0) {
            const existing = sys.pumps.find(elem => elem.id === id);
            if (typeof existing !== 'undefined') {
                logger.info(`IntelliCenterWS: pump ${objnam} id=${id} deleted (SUBTYP=${params['SUBTYP']})`);
                const spump = state.pumps.getItemById(id);
                spump.isActive = false;
                existing.isActive = false;
                spump.emitEquipmentChange();
                state.pumps.removeItemById(id);
                sys.pumps.removeItemById(id);
                return;
            }
        }
    }
    const existing = sys.pumps.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const pump = sys.pumps.getItemById(id, true);
    pump.objnam = objnam;
    const spump = state.pumps.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { pump.name = params['SNAME']; spump.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodePumpType(params['SUBTYP']);
        pump.type = t; spump.type = t;
    }
    if (typeof params['STATUS'] !== 'undefined') spump.status = parseIntSafe(params['STATUS']);
    if (typeof params['RPM'] !== 'undefined') spump.rpm = parseIntSafe(params['RPM']);
    if (typeof params['GPM'] !== 'undefined') spump.flow = parseIntSafe(params['GPM']);
    if (typeof params['PWR'] !== 'undefined') spump.watts = parseIntSafe(params['PWR']);
    if (typeof params['MIN'] !== 'undefined') {
        const val = parseIntSafe(params['MIN']);
        pump.minSpeed = val;
        if (pump.type === 5) pump.minFlow = val;
    }
    if (typeof params['MAX'] !== 'undefined') {
        const val = parseIntSafe(params['MAX']);
        pump.maxSpeed = val;
        if (pump.type === 5) pump.maxFlow = val;
    }
    if (typeof params['MINF'] !== 'undefined') pump.minFlow = parseIntSafe(params['MINF']);
    if (typeof params['MAXF'] !== 'undefined') pump.maxFlow = parseIntSafe(params['MAXF']);
    if (typeof params['SETTMP'] !== 'undefined') {
        const val = parseIntSafe(params['SETTMP']);
        if (pump.type === 5) pump.flowStepSize = val;
        else pump.speedStepSize = val;
    }
    if (typeof params['SETTMPNC'] !== 'undefined') pump.flowStepSize = parseIntSafe(params['SETTMPNC']);
    if (typeof params['PRIMFLO'] !== 'undefined') pump.primingSpeed = parseIntSafe(params['PRIMFLO']);
    if (typeof params['PRIMTIM'] !== 'undefined') pump.primingTime = parseIntSafe(params['PRIMTIM']);
    if (typeof params['COMUART'] !== 'undefined') pump.address = parseIntSafe(params['COMUART']) + 95;
    if (typeof params['BODY'] !== 'undefined') pump.body = parseIntSafe(params['BODY']);
    pump.isActive = true;
    spump.isActive = true;
}

function encodePumpType(subtyp: string): number {
    const s = (subtyp || '').toUpperCase();
    switch (s) {
        case 'SPEED': case 'VS': return 3;
        case 'FLOW': case 'VF': return 5;
        case 'VSF': return 4;
        case 'SS': return 1;
        case 'DS': return 2;
        case 'VSSVRS': return 3;
        default: return 0;
    }
}

function decodePumpCircuit(objnam: string, params: ParamMap): void {
    let parentObjnam = params['PARENT'];
    if (!parentObjnam) {
        const m = objnam.match(/^(PMP\d+)C\d/i);
        if (m) parentObjnam = m[1];
        else {
            const m2 = objnam.match(/^p(\d{2})\d{2}$/i);
            if (m2) parentObjnam = 'PMP' + m2[1];
        }
    }
    if (!parentObjnam) return;
    const pumpId = objnamToId(parentObjnam);
    if (pumpId <= 0) return;
    const pump = sys.pumps.getItemById(pumpId, false);
    if (!pump || !pump.isActive) return;
    let idx = -1;
    const cm2 = objnam.match(/\d{2}(\d{2})$/);
    if (cm2) idx = parseInt(cm2[1], 10) - 1;
    if (idx < 0) {
        const cm = objnam.match(/C(\d+)$/i);
        if (cm) idx = parseInt(cm[1], 10) - 1;
    }
    if (idx < 0) idx = parseIntSafe(params['LISTORD'], -1) - 1;
    if (idx < 0) {
        let rawIdx = parseIntSafe(params['INDEX'], -1);
        if (rawIdx >= 0) idx = rawIdx % 8;
    }
    if (idx < 0) idx = 0;
    const pcId = idx + 1;
    logger.debug(`IntelliCenterWS: decodePumpCircuit objnam=${objnam} pumpId=${pumpId} idx=${idx} pcId=${pcId} circuits.length=${pump.circuits.length} params=${JSON.stringify(params)}`);
    const pc = pump.circuits.getItemById(pcId, true);
    pc.objnam = objnam;
    if (typeof params['SELECT'] !== 'undefined') {
        const u = params['SELECT'].toUpperCase();
        pc.units = u === 'GPM' ? 1 : 0;
    }
    if (typeof params['CIRCUIT'] !== 'undefined') pc.circuit = circuitObjnamToId(params['CIRCUIT']);
    if (typeof params['SPEED'] !== 'undefined') {
        const val = parseIntSafe(params['SPEED']);
        if (pc.units === 1 || pump.type === 5) pc.flow = val;
        else pc.speed = val;
    }
}

function decodeHeater(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam);
    if (id <= 0) return;
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeHeaterType(params['SUBTYP']);
        if (t === 0) {
            const existing = sys.heaters.find(elem => elem.id === id);
            if (typeof existing !== 'undefined') {
                logger.info(`IntelliCenterWS: heater ${objnam} id=${id} deleted (SUBTYP=${params['SUBTYP']})`);
                const sheater = state.heaters.getItemById(id);
                sheater.isActive = false;
                existing.isActive = false;
                sheater.emitEquipmentChange();
                state.heaters.removeItemById(id);
                sys.heaters.removeItemById(id);
                sys.board.heaters.updateHeaterServices();
                sys.board.circuits.syncVirtualCircuitStates();
                return;
            }
        }
    }
    const existing = sys.heaters.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const heater = sys.heaters.getItemById(id, true);
    heater.objnam = objnam;
    const sheater = state.heaters.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { heater.name = params['SNAME']; sheater.name = params['SNAME']; }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeHeaterType(params['SUBTYP']);
        heater.type = t; sheater.type = t;
    }
    if (typeof params['BODY'] !== 'undefined') heater.body = parseBodyRef(params['BODY']);
    if (typeof params['STATUS'] !== 'undefined') sheater.isOn = parseBool(params['STATUS']);
    if (typeof params['COOL'] !== 'undefined') heater.coolingEnabled = parseBool(params['COOL']);
    if (typeof params['DLY'] !== 'undefined') heater.cooldownDelay = parseIntSafe(params['DLY']);
    if (typeof params['BOOST'] !== 'undefined') heater.maxBoostTemp = parseIntSafe(params['BOOST']);
    if (typeof params['COMUART'] !== 'undefined') heater.address = parseIntSafe(params['COMUART']);
    heater.isActive = true;
    sheater.isActive = true;
    sys.board.heaters.updateHeaterServices();
    sys.board.circuits.syncVirtualCircuitStates();
}

function encodeHeaterType(subtyp: string): number {
    const s = (subtyp || '').toUpperCase();
    switch (s) {
        case 'GAS': case 'GASHTR': case 'GENERIC': return 1;
        case 'SOLAR': return 2;
        case 'HEATPUMP': case 'HTPMP': return 3;
        case 'ULTRA': case 'ULTRATEMP': return 4;
        case 'HYBRID': case 'HCOMBO': return 5;
        case 'MASTER': case 'MSTR': return 6;
        case 'MAXE': return 7;
        case 'ETI250': case 'ETI': return 8;
        default:
            if (s && s !== 'NONE' && s !== '') logger.info(`encodeHeaterType: unknown SUBTYP='${subtyp}'`);
            return 0;
    }
}

function syncValveStatesWS(): void {
    const spaBody = state.temps.bodies.getItemById(2);
    const spa = spaBody ? spaBody.isOn : false;
    const spillway = typeof state.circuits.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined' ||
        typeof state.features.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined';
    const drain = typeof state.circuits.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spadrain' && elem.isOn === true) !== 'undefined' ||
        typeof state.features.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spadrain' && elem.isOn === true) !== 'undefined';
    for (let i = 0; i < sys.valves.length; i++) {
        const valve = sys.valves.getItemByIndex(i);
        if (!valve.isActive) continue;
        const vstate = state.valves.getItemById(valve.id);
        let isDiverted = false;
        if (valve.isIntake) {
            isDiverted = spa || drain;
        } else if (valve.isReturn) {
            isDiverted = (spa || spillway) && !drain;
        } else if (valve.circuit > 0) {
            const circ = state.circuits.getInterfaceById(valve.circuit);
            isDiverted = circ ? circ.isOn : false;
        }
        vstate.isDiverted = isDiverted;
    }
}

function decodeValve(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam);
    if (id <= 0) return;
    const existing = sys.valves.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const valve = sys.valves.getItemById(id, true);
    valve.objnam = objnam;
    const svalve = state.valves.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { valve.name = params['SNAME']; svalve.name = params['SNAME']; }
    if (typeof params['CIRCUIT'] !== 'undefined') valve.circuit = circuitObjnamToId(params['CIRCUIT']);
    if (typeof params['ASSIGN'] !== 'undefined') {
        const assign = params['ASSIGN'].toUpperCase();
        valve.isIntake = assign === 'INTAKE';
        valve.isReturn = assign === 'RETURN';
    }
    if (typeof params['POSIT'] !== 'undefined' && params['POSIT'] !== 'POSIT') {
        svalve.isDiverted = parseBool(params['POSIT']);
    }
    valve.isActive = true;
}

function decodeChemistry(objnam: string, params: ParamMap): void {
    const sub = (params['SUBTYP'] || '').toUpperCase();
    if (sub === 'ICHLOR' || objnam.startsWith('CHR')) {
        decodeChlorinator(objnam, params);
        return;
    }
    const id = objnamToId(objnam);
    if (id <= 0) return;
    const existing = sys.chemControllers.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const chem = sys.chemControllers.getItemById(id, true);
    chem.objnam = objnam;
    const schem = state.chemControllers.getItemById(id, true);
    if (typeof chem.type === 'undefined' || chem.type === 0) chem.type = 2;
    if (typeof chem.address === 'undefined' || chem.address === 0) chem.address = 144;
    if (typeof params['SNAME'] !== 'undefined') { chem.name = params['SNAME']; schem.name = params['SNAME']; }
    if (typeof params['BODY'] !== 'undefined') { chem.body = parseIntSafe(params['BODY']); schem.body = parseIntSafe(params['BODY']); }
    if (typeof params['PHSET'] !== 'undefined') { chem.ph.setpoint = parseFloatSafe(params['PHSET']); schem.ph.setpoint = parseFloatSafe(params['PHSET']); }
    if (typeof params['PHVAL'] !== 'undefined') schem.ph.level = parseFloatSafe(params['PHVAL']);
    if (typeof params['ORPSET'] !== 'undefined') { chem.orp.setpoint = parseIntSafe(params['ORPSET']); schem.orp.setpoint = parseIntSafe(params['ORPSET']); }
    if (typeof params['ORPVAL'] !== 'undefined') schem.orp.level = parseIntSafe(params['ORPVAL']);
    if (typeof params['TEMP'] !== 'undefined') schem.ph.probe.temperature = parseIntSafe(params['TEMP']);
    if (typeof params['ALK'] !== 'undefined') chem.alkalinity = parseIntSafe(params['ALK']);
    if (typeof params['CALC'] !== 'undefined') chem.calciumHardness = parseIntSafe(params['CALC']);
    if (typeof params['CYACID'] !== 'undefined') chem.cyanuricAcid = parseIntSafe(params['CYACID']);
    if (typeof params['SINDEX'] !== 'undefined') schem.saturationIndex = parseFloatSafe(params['SINDEX']);
    chem.isActive = true;
}

function decodeChlorinator(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam) || 1;
    const existing = sys.chlorinators.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const chlor = sys.chlorinators.getItemById(id, true);
    chlor.objnam = objnam;
    const schlor = state.chlorinators.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { chlor.name = params['SNAME']; schlor.name = params['SNAME']; }
    if (typeof params['PRIM'] !== 'undefined') { chlor.poolSetpoint = parseIntSafe(params['PRIM']); schlor.poolSetpoint = parseIntSafe(params['PRIM']); }
    if (typeof params['SEC'] !== 'undefined') { chlor.spaSetpoint = parseIntSafe(params['SEC']); schlor.spaSetpoint = parseIntSafe(params['SEC']); }
    if (typeof params['SUPER'] !== 'undefined') { chlor.superChlor = parseBool(params['SUPER']); schlor.superChlor = parseBool(params['SUPER']); }
    if (typeof params['TIMOUT'] !== 'undefined') {
        const secs = parseIntSafe(params['TIMOUT']);
        const hrs = Math.round(secs / 3600);
        chlor.superChlorHours = hrs;
        schlor.superChlorHours = hrs;
    }
    if (typeof params['SALT'] !== 'undefined') schlor.saltLevel = parseIntSafe(params['SALT']);
    if (typeof params['BODY'] !== 'undefined') { chlor.body = parseIntSafe(params['BODY']); schlor.body = parseIntSafe(params['BODY']); }
    if (typeof params['SUBTYP'] !== 'undefined') { chlor.type = parseIntSafe(params['SUBTYP']); schlor.type = parseIntSafe(params['SUBTYP']); }
    chlor.isActive = true;
}

function decodeCover(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam);
    if (id <= 0) return;
    const existing = sys.covers.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const cover = sys.covers.getItemById(id, true);
    cover.objnam = objnam;
    const scover = state.covers.getItemById(id, true);
    if (typeof params['SNAME'] !== 'undefined') { cover.name = params['SNAME']; scover.name = params['SNAME']; }
    if (typeof params['BODY'] !== 'undefined') { cover.body = parseIntSafe(params['BODY']); scover.body = parseIntSafe(params['BODY']); }
    cover.isActive = true;
    scover.isActive = true;
}

function decodeRemote(objnam: string, params: ParamMap): void {
    const id = objnamToId(objnam);
    if (id <= 0) return;
    const existing = sys.remotes.find(elem => elem.id === id);
    if (typeof existing === 'undefined' && !hasDefinedParams(params)) return;
    const remote = sys.remotes.getItemById(id, true);
    remote.objnam = objnam;
    if (typeof params['SNAME'] !== 'undefined') remote.name = params['SNAME'];
    if (typeof params['SUBTYP'] !== 'undefined') {
        const t = encodeRemoteType(params['SUBTYP']);
        remote.type = t;
    }
    remote.isActive = true;
}

function encodeRemoteType(subtyp: string): number {
    const s = (subtyp || '').toUpperCase();
    switch (s) {
        case 'IS4': return 1;
        case 'IS10': return 2;
        case 'QT': case 'QUICKTOUCH': return 3;
        case 'SPACMD': return 4;
        default: return 0;
    }
}

function decodeRemoteButton(objnam: string, params: ParamMap): void {
    const parentObjnam = params['PARENT'];
    if (!parentObjnam) return;
    const remoteId = objnamToId(parentObjnam);
    if (remoteId <= 0) return;
    const remote = sys.remotes.getItemById(remoteId, false);
    if (!remote) return;
    const idx = parseIntSafe(params['INDEX'], 0);
    const btnKey = `button${idx + 1}`;
    if (typeof params['CIRCUIT'] !== 'undefined') {
        const cid = circuitObjnamToId(params['CIRCUIT']);
        if (typeof remote[btnKey] !== 'undefined') remote[btnKey] = cid;
    }
}

// Cache SENSE objnam → routing target. Real ICv3 sensor objnams are SNS-prefixed
// (e.g. SNS01) — they don't carry routing info in the objnam itself. SUBTYP
// arrives during the initial snapshot enumerate, but the per-key subscription
// for SENSE only delivers SOURCE/PROBE/CALIB on live notifications, so we must
// remember the target from the snapshot to route subsequent PROBE updates.
function _resolveSensorTargetFromSubtyp(sub: string): 'water1' | 'solar1' | 'air' | undefined {
    if (sub === 'POOL' || sub === 'WATER') return 'water1';
    if (sub === 'SOLAR') return 'solar1';
    if (sub === 'AIR') return 'air';
    return undefined;
}
const _sensorTargetByObjnam = new Map<string, 'water1' | 'solar1' | 'air'>();

function decodeSensor(objnam: string, params: ParamMap): void {
    const sub = (params['SUBTYP'] || '').toUpperCase();
    let target = _sensorTargetByObjnam.get(objnam);
    if (sub) {
        const next = _resolveSensorTargetFromSubtyp(sub);
        if (next && next !== target) {
            _sensorTargetByObjnam.set(objnam, next);
            target = next;
        }
    }
    if (!target) {
        logger.debug(`IntelliCenterWSController: unknown sensor ${objnam} subtype="${sub}" params=${Object.keys(params).join(',')}`);
        return;
    }
    if (typeof params['CALIB'] !== 'undefined') {
        const cal = parseIntSafe(params['CALIB']);
        sys.equipment.tempSensors[target] = cal;
    }
    // OCP NotifyList delivers the live sensor reading on either PROBE or
    // SOURCE depending on the sensor (verified via Wireshark June 2026):
    //   SSS11 (solar1) -> {"SOURCE":"76"}
    //   _A135 (air)    -> {"PROBE":"72"}
    //   SSW11 (water1) -> PROBE
    // Accept both keys and treat them as the same temperature value.
    const probeVal = typeof params['PROBE'] !== 'undefined'
        ? params['PROBE']
        : (typeof params['SOURCE'] !== 'undefined' ? params['SOURCE'] : undefined);
    if (typeof probeVal !== 'undefined') {
        const temp = parseIntSafe(probeVal);
        const which = typeof params['PROBE'] !== 'undefined' ? 'PROBE' : 'SOURCE';
        logger.debug(`decodeSensor ${objnam}: target=${target} ${which}=${temp}`);
        if (target === 'air') state.temps.air = temp;
        else if (target === 'solar1') state.temps.solar = temp;
        else if (target === 'water1') {
            // Cache raw probe in waterSensor1 for parity with v1.x. Body water
            // temps are written in decodeBody, gated by sbody.isOn.
            state.temps.waterSensor1 = temp;
        }
    }
}

// Deferred CIRCGRP messages whose parent group did not yet exist (or was not yet
// active) when the member arrived. Replayed by finalizeGroupMembersWS() after
// the initial WS snapshot completes so we don't end up with half-populated
// light/circuit groups (e.g. a member with no `circuit` reference, which makes
// LightGroup.getLightThemes() return [] and leaves the dashPanel "Light Shows"
// and "Colors" tabs blank).
const _deferredGroupMembers: Array<{ objnam: string; params: ParamMap }> = [];

function applyLightGroupMember(grp: any, objnam: string, params: ParamMap, memberId: number, parentObjnam: string): boolean {
    const mc = grp.circuits.getItemById(memberId, true);
    mc.objnam = objnam;
    if (typeof params['CIRCUIT'] !== 'undefined') {
        mc.circuit = circuitObjnamToId(params['CIRCUIT']);
    } else if (typeof mc.circuit === 'undefined') {
        logger.warn(`IntelliCenterWS: light group member ${objnam} (parent=${parentObjnam}) has no CIRCUIT param; member will be incomplete until OCP re-broadcasts.`);
    }
    if (typeof params['DLY'] !== 'undefined') mc.swimDelay = parseIntSafe(params['DLY']);
    return typeof mc.circuit === 'number' && mc.circuit > 0;
}

function applyCircuitGroupMember(cgrp: any, objnam: string, params: ParamMap, memberId: number, parentObjnam: string): boolean {
    const mc = (cgrp as any).circuits.getItemById(memberId, true);
    mc.objnam = objnam;
    if (typeof params['CIRCUIT'] !== 'undefined') {
        mc.circuit = circuitObjnamToId(params['CIRCUIT']);
    } else if (typeof mc.circuit === 'undefined') {
        logger.warn(`IntelliCenterWS: circuit group member ${objnam} (parent=${parentObjnam}) has no CIRCUIT param; member will be incomplete until OCP re-broadcasts.`);
    }
    if (typeof params['STATUS'] !== 'undefined') mc.desiredState = parseIntSafe(params['STATUS']);
    return typeof mc.circuit === 'number' && mc.circuit > 0;
}

function decodeGroupMember(objnam: string, params: ParamMap): void {
    const parentObjnam = params['PARENT'];
    if (!parentObjnam) return;
    const parentId = objnamToId(parentObjnam) + 192;
    const idx = parseIntSafe(params['INDEX'], 0);
    const memberId = idx + 1;
    logger.debug(`IntelliCenterWS: decodeGroupMember ${objnam} parent=${parentObjnam} parentId=${parentId} idx=${idx} CIRCUIT=${params['CIRCUIT']}`);
    let grp = sys.lightGroups.getItemById(parentId, false);
    if (grp && grp.isActive) {
        applyLightGroupMember(grp, objnam, params, memberId, parentObjnam);
        return;
    }
    let cgrp = sys.circuitGroups.getItemById(parentId, false);
    if (cgrp && cgrp.isActive) {
        applyCircuitGroupMember(cgrp, objnam, params, memberId, parentObjnam);
        return;
    }
    // Parent group not yet active — defer until snapshot completes so the
    // member isn't silently dropped (root cause of empty Light Shows on v3 WS
    // when CIRCGRP arrives before its parent CIRCUIT/SUBTYP=LITSHO).
    if (!icws.snapshotComplete) {
        _deferredGroupMembers.push({ objnam, params: { ...params } });
        logger.debug(`IntelliCenterWS: deferring group member ${objnam} (parent=${parentObjnam}); parent not yet active.`);
    } else {
        logger.warn(`IntelliCenterWS: group member ${objnam} arrived for unknown parent ${parentObjnam} (parentId=${parentId}); ignoring.`);
    }
}

// Replay any group-member messages that arrived before their parent group was
// active, then drop empty member entries that never received a circuit
// reference. Called from IntelliCenterWS.runPostSnapshotFinalizers().
export function finalizeGroupMembersWS(): void {
    if (_deferredGroupMembers.length > 0) {
        logger.info(`IntelliCenterWS: replaying ${_deferredGroupMembers.length} deferred group member message(s).`);
        const queue = _deferredGroupMembers.splice(0, _deferredGroupMembers.length);
        for (const m of queue) {
            const parentObjnam = m.params['PARENT'];
            if (!parentObjnam) continue;
            const parentId = objnamToId(parentObjnam) + 192;
            const idx = parseIntSafe(m.params['INDEX'], 0);
            const memberId = idx + 1;
            const lgrp = sys.lightGroups.getItemById(parentId, false);
            if (lgrp && lgrp.isActive) {
                applyLightGroupMember(lgrp, m.objnam, m.params, memberId, parentObjnam);
                continue;
            }
            const cgrp = sys.circuitGroups.getItemById(parentId, false);
            if (cgrp && cgrp.isActive) {
                applyCircuitGroupMember(cgrp, m.objnam, m.params, memberId, parentObjnam);
                continue;
            }
            logger.warn(`IntelliCenterWS: deferred group member ${m.objnam} parent ${parentObjnam} still not active after snapshot; dropping.`);
        }
    }
    // Prune light/circuit group members that never received a circuit
    // reference. A phantom member with no `circuit` poisons
    // LightGroup.getLightThemes()/getLightCommands() and is preferable to
    // expose as "no members" so the UI can recover after OCP re-broadcasts.
    for (let i = 0; i < sys.lightGroups.length; i++) {
        const lg = sys.lightGroups.getItemByIndex(i);
        if (!lg || !lg.isActive) continue;
        const circs = lg.circuits;
        for (let j = circs.length - 1; j >= 0; j--) {
            const mc = circs.getItemByIndex(j);
            const cid = (mc as any).circuit;
            if (typeof cid !== 'number' || cid <= 0) {
                logger.warn(`IntelliCenterWS: pruning light group ${lg.id} member ${(mc as any).objnam} with no circuit reference.`);
                circs.removeItemByIndex(j);
            }
        }
    }
    for (let i = 0; i < sys.circuitGroups.length; i++) {
        const cg = sys.circuitGroups.getItemByIndex(i);
        if (!cg || !cg.isActive) continue;
        const circs = (cg as any).circuits;
        if (!circs) continue;
        for (let j = circs.length - 1; j >= 0; j--) {
            const mc = circs.getItemByIndex(j);
            const cid = (mc as any).circuit;
            if (typeof cid !== 'number' || cid <= 0) {
                logger.warn(`IntelliCenterWS: pruning circuit group ${cg.id} member ${(mc as any).objnam} with no circuit reference.`);
                circs.removeItemByIndex(j);
            }
        }
    }
    state.emitEquipmentChanges();
}

function decodeModule(objnam: string, params: ParamMap): void {
    if (typeof params['VER'] !== 'undefined') {
        sys.equipment.controllerFirmware = params['VER'];
    }
    if (typeof params['SUBTYP'] !== 'undefined') {
        const subtyp = params['SUBTYP'].toUpperCase();
        const boardName = subtyp.startsWith('I') ? subtyp.slice(0, 1).toLowerCase() + subtyp.slice(1) : subtyp;
        sys.equipment.model = `IntelliCenter ${boardName}`;
        // Sync modules[0] so the Settings→System panel table matches the top-bar model name
        const mt = sys.board.valueMaps.expansionBoards.transformByName(boardName);
        const mod = sys.equipment.modules.getItemById(0, true);
        mod.name = mt.name || boardName;
        mod.desc = mt.desc || `${boardName} Personality Card`;
        mod.type = typeof mt.val !== 'undefined' ? mt.val : 0;
        if (mt.part) mod.part = mt.part;
        // Clear stale RS-485 expansion slots; WS transport does not discover slots 1-3
        sys.equipment.modules.removeItemById(1);
        sys.equipment.modules.removeItemById(2);
        sys.equipment.modules.removeItemById(3);
    }
}

function decodePanel(objnam: string, params: ParamMap): void {
    logger.debug(`IntelliCenterWSController: decodePanel ${objnam} — panel topology not yet mapped`);
}

function decodeSecurity(objnam: string, params: ParamMap): void {
    logger.debug(`IntelliCenterWSController: decodeSecurity ${objnam} — security/permit not yet mapped`);
}

function decodeClock(objnam: string, params: ParamMap): void {
    if (typeof params['CLK24A'] !== 'undefined') {
        sys.general.options.clockMode = params['CLK24A'].toUpperCase() === '24HR' ? 24 : 12;
    }
    if (typeof params['DLSTIM'] !== 'undefined') {
        sys.general.options.adjustDST = parseBool(params['DLSTIM']);
    }
    if (typeof params['SOURCE'] !== 'undefined') {
        sys.general.options.clockSource = params['SOURCE'].toUpperCase() === 'INTERNET' ? 'internet' : 'manual';
    }
}

function decodeFeatureOptions(objnam: string, params: ParamMap): void {
    if (typeof params['MANOVR'] !== 'undefined') sys.general.options.manualPriority = parseBool(params['MANOVR']);
}

function decodeSystemObject(objnam: string, params: ParamMap): void {
    if (typeof params['PROPNAME'] !== 'undefined') sys.general.alias = params['PROPNAME'];
    if (typeof params['NAME'] !== 'undefined') sys.general.owner.name = params['NAME'];
    if (typeof params['EMAIL'] !== 'undefined') sys.general.owner.email = params['EMAIL'];
    if (typeof params['EMAIL2'] !== 'undefined') sys.general.owner.email2 = params['EMAIL2'];
    if (typeof params['PHONE'] !== 'undefined') sys.general.owner.phone = params['PHONE'];
    if (typeof params['PHONE2'] !== 'undefined') sys.general.owner.phone2 = params['PHONE2'];
    if (typeof params['ADDRESS'] !== 'undefined') sys.general.location.address = params['ADDRESS'];
    if (typeof params['CITY'] !== 'undefined') sys.general.location.city = params['CITY'];
    if (typeof params['STATE'] !== 'undefined') sys.general.location.state = params['STATE'];
    if (typeof params['ZIP'] !== 'undefined') sys.general.location.zip = params['ZIP'];
    if (typeof params['COUNTRY'] !== 'undefined') sys.general.location.country = params['COUNTRY'];
    if (typeof params['LOCX'] !== 'undefined') sys.general.location.longitude = parseFloatSafe(params['LOCX']);
    if (typeof params['LOCY'] !== 'undefined') sys.general.location.latitude = parseFloatSafe(params['LOCY']);
    if (typeof params['TIMZON'] !== 'undefined') sys.general.location.timeZone = parseIntSafe(params['TIMZON']);
    if (typeof params['MODE'] !== 'undefined') {
        sys.general.options.units = params['MODE'].toUpperCase() === 'METRIC' ? 1 : 0;
        state.temps.units = sys.general.options.units;
    }
    if (typeof params['MANHT'] !== 'undefined') sys.general.options.manualHeat = parseBool(params['MANHT']);
    if (typeof params['HEATING'] !== 'undefined') sys.general.options.cooldownDelay = parseBool(params['HEATING']);
    if (typeof params['VER'] !== 'undefined') sys.equipment.controllerFirmware = params['VER'];
    if (typeof params['HNAME'] !== 'undefined') sys.equipment.name = params['HNAME'];
    if (typeof params['SASHP'] !== 'undefined') sys.general.options.solarAsHeatPump = parseBool(params['SASHP']);
    if (typeof params['FREEZEDLY'] !== 'undefined') sys.general.options.freezeCycleTime = parseIntSafe(params['FREEZEDLY']);
    if (typeof params['VACFLO'] !== 'undefined') {
        const vacEnabled = parseBool(params['VACFLO']);
        sys.general.options.vacation.enabled = vacEnabled;
        state.vacation = vacEnabled;
    }
    if (typeof params['VACTIM'] !== 'undefined') {
        sys.general.options.vacation.useTimeframe = parseBool(params['VACTIM']);
    }
    if (typeof params['START'] !== 'undefined') {
        const parts = params['START'].trim().split(',').map(s => parseInt(s, 10));
        if (parts.length === 3) {
            sys.general.options.vacation.startDate = new Date(2000 + parts[2], parts[0] - 1, parts[1]);
        }
    }
    if (typeof params['STOP'] !== 'undefined') {
        const parts = params['STOP'].trim().split(',').map(s => parseInt(s, 10));
        if (parts.length === 3) {
            sys.general.options.vacation.endDate = new Date(2000 + parts[2], parts[0] - 1, parts[1]);
        }
    }
    if (typeof params['VALVE'] !== 'undefined') {
        sys.general.options.valveDelay = parseBool(params['VALVE']);
        syncValveStatesWS();
    }
    if (typeof params['SERVICE'] !== 'undefined') {
        state.mode = parseBool(params['SERVICE']) ? 1 : 0;
    }
}

const _objnamTypeRegistry: Map<string, string> = new Map();

export class IntelliCenterWSController {
    public static registerObjnamType(objnam: string, objtyp: string): void {
        if (objnam && objtyp) _objnamTypeRegistry.set(objnam, objtyp.toUpperCase());
    }

    public static clearRegistry(): void {
        _objnamTypeRegistry.clear();
    }

    public static syncValveStatesWS(): void {
        syncValveStatesWS();
    }

    public static apply(objnam: string, params: ParamMap, objtyp?: string): void {
        if (!objnam || !params) return;
        let typ = (objtyp || params['OBJTYP'] || '').toUpperCase();
        if (!typ) typ = _objnamTypeRegistry.get(objnam) || '';
        if (!typ) typ = inferObjtyp(objnam);
        if (typ && !_objnamTypeRegistry.has(objnam)) _objnamTypeRegistry.set(objnam, typ);
        if (objnam === '_5451' || objnam.startsWith('_54')) {
            decodeSystemObject(objnam, params);
            return;
        }
        if (objnam.startsWith('_C1')) {
            decodeClock(objnam, params);
            return;
        }
        if (objnam === '_CFEA') {
            decodeFeatureOptions(objnam, params);
            return;
        }
        const handler = OBJTYP_DISPATCH[typ];
        if (handler) {
            handler(objnam, params);
        } else {
            logger.debug(`IntelliCenterWSController: no handler for objnam=${objnam} OBJTYP=${typ}`);
        }
    }

    public static applySnapshot(objectList: Array<{ objnam: string; params?: ParamMap; [k: string]: any }>): void {
        for (const obj of objectList) {
            if (!obj.objnam || !obj.params) continue;
            IntelliCenterWSController.apply(obj.objnam, obj.params, obj.params['OBJTYP']);
        }
    }

    public static handleDeletion(objnam: string): void {
        const typ = _objnamTypeRegistry.get(objnam) || inferObjtyp(objnam);
        const id = objnamToId(objnam);
        if (id <= 0) return;
        switch (typ) {
            case 'PUMP': {
                const existing = sys.pumps.find(elem => elem.id === id);
                if (typeof existing !== 'undefined') {
                    const spump = state.pumps.getItemById(id);
                    spump.isActive = false;
                    existing.isActive = false;
                    spump.emitEquipmentChange();
                    state.pumps.removeItemById(id);
                    sys.pumps.removeItemById(id);
                }
                break;
            }
            case 'HEATER': {
                const existing = sys.heaters.find(elem => elem.id === id);
                if (typeof existing !== 'undefined') {
                    const sheater = state.heaters.getItemById(id);
                    sheater.isActive = false;
                    existing.isActive = false;
                    sheater.emitEquipmentChange();
                    state.heaters.removeItemById(id);
                    sys.heaters.removeItemById(id);
                    sys.board.heaters.updateHeaterServices();
                    sys.board.circuits.syncVirtualCircuitStates();
                }
                break;
            }
            case 'SCHED': {
                const existing = sys.schedules.find(elem => elem.id === id);
                if (typeof existing !== 'undefined') {
                    const ssched = state.schedules.getItemById(id);
                    ssched.isActive = false;
                    existing.isActive = false;
                    ssched.emitEquipmentChange();
                    state.schedules.removeItemById(id);
                    sys.schedules.removeItemById(id);
                }
                break;
            }
            case 'PMPCIRC': {
                const parentObjnam = objnam.match(/^p(\d{2})\d{2}$/i);
                if (parentObjnam) {
                    const pumpId = parseInt(parentObjnam[1], 10);
                    const pump = sys.pumps.getItemById(pumpId, false);
                    if (pump && pump.isActive) {
                        const circIdx = parseInt(objnam.slice(-2), 10);
                        pump.circuits.removeItemById(circIdx);
                    }
                }
                break;
            }
            default:
                break;
        }
        _objnamTypeRegistry.delete(objnam);
    }
}
