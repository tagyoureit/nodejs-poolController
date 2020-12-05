import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { ChemController, Chemical, ChemicalPh, ChemicalORP, ChemicalPhProbe, ChemicalORPProbe, ChemicalTank, ChemicalPump, sys, ChemicalProbe, ChemControllerCollection } from "../../../controller/Equipment";
import { ChemControllerState, ChemicalState, ChemicalORPState, ChemicalPhState, state, ChemicalProbeState, ChemicalProbePHState, ChemicalProbeORPState, ChemicalTankState, ChemicalPumpState } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { warn } from 'winston';
import { webApp } from "../../../web/Server";

export class NixieChemControllerCollection extends NixieEquipmentCollection<NixieChemController> {
    public async setControllerAsync(chem: ChemController, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        let c: NixieChemController = this.find(elem => elem.id === chem.id) as NixieChemController;
        if (typeof c === 'undefined') {
            chem.master = 1;
            c = new NixieChemController(this.controlPanel, chem);
            this.push(c);
            await c.setControllerAsync(data);
            setTimeout(() => c.pollEquipment(), 5000);
        }
        else {
            await c.setControllerAsync(data);
        }
    }
    public async initAsync(controllers: ChemControllerCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < controllers.length; i++) {
                let cc = controllers.getItemByIndex(i);
                if (cc.master === 1) {
                    logger.info(`Initializing chemController ${cc.name}`);
                    let ncc = new NixieChemController(this.controlPanel, cc);
                    this.push(ncc);
                    setTimeout(() => ncc.pollEquipment(), 5000);
                }
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public async searchIntelliChem() {
        try {
            for (let i = 0; i < sys.equipment.maxChemControllers; i++) {
                let found = await sys.board.chemControllers.pollIntelliChem(144 + i);
                if (found) {
                    let chem = sys.chemControllers.getItemByAddress(144 + 1, true);
                    chem.isActive = true;
                    chem.master = 'ncp';
                    chem.type = 1;
                }
            }
            //// TODO: If we are searching for multiple chem controllers this should be a promise.all array
            //// except even one resolve() could be a success for all.  Or we could just return a generic "searching"
            //let promises = [];
            //for (let i = 1; i <= sys.equipment.maxChemControllers; i++) {
            //    let address = 144 + i - 1; // first address;
            //    let chem = sys.chemControllers.getItemByAddress(address, true);
            //    if (chem.isActive) continue;
            //    chem.isActive = true;
            //    chem.isVirtual = true;
            //    chem.type = 1;
            //    sys.board.chemControllers.initChem(chem);
            //}
            return Promise.resolve('Searching for chem controllers...')
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemController extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout;
    public chem: ChemController;
    public orp: NixieChemicalORP;
    public ph: NixieChemicalPh;
    public bodyOnTime: number;
    constructor(ncp: INixieControlPanel, chem: ChemController) {
        super(ncp);
        this.chem = chem;
        this.orp = new NixieChemicalORP(this, chem.orp);
        this.ph = new NixieChemicalPh(this, chem.ph);
        this.pollEquipment();
    }
    public get id(): number { return typeof this.chem !== 'undefined' ? this.chem.id : -1; }
    public get calciumHardnessFactor(): number {
        const CH = this.chem.calciumHardness;
        if (CH <= 25) return 1.0;
        else if (CH <= 50) return 1.3;
        else if (CH <= 75) return 1.5;
        else if (CH <= 100) return 1.6;
        else if (CH <= 125) return 1.7;
        else if (CH <= 150) return 1.8;
        else if (CH <= 200) return 1.9;
        else if (CH <= 250) return 2.0;
        else if (CH <= 300) return 2.1;
        else if (CH <= 400) return 2.2;
        return 2.5;
    }
    public get carbonateAlkalinity(): number {
        const ppm = this.correctedAlkalinity;
        if (ppm <= 25) return 1.4;
        else if (ppm <= 50) return 1.7;
        else if (ppm <= 75) return 1.9;
        else if (ppm <= 100) return 2.0;
        else if (ppm <= 125) return 2.1;
        else if (ppm <= 150) return 2.2;
        else if (ppm <= 200) return 2.3;
        else if (ppm <= 250) return 2.4;
        else if (ppm <= 300) return 2.5;
        else if (ppm <= 400) return 2.6;
        return 2.9;
    }
    public get correctedAlkalinity(): number { return this.chem.alkalinity - (this.chem.cyanuricAcid / 3); }
    public async setControllerAsync(data: any) {
        try {
            let chem = this.chem;
            if (chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem')) {
                // If we are an IntelliChem and Nixie is doing the work we need to validate the address and set up
                // our polling.  The message processor will handle all the rest.  Remember, if this is part of an OCP
                // it will not make it here.

            }
            // So now we are down to the nitty gritty setting the data for the REM or Homegrown Chem controller.
            let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
            let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
            let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            let schem = state.chemControllers.getItemById(chem.id, true);
            chem.calciumHardness = calciumHardness;
            chem.cyanuricAcid = cyanuricAcid;
            chem.alkalinity = alkalinity;
            chem.body = body;
            schem.name = chem.name = data.name || chem.name || `Chem Controller ${chem.id}`;
            schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.encode('rem');
            schem.isActive = chem.isActive = true;
            // Alright we are down to the equipment items all validation should have been completed by now.
            // ORP Settings
            await this.orp.setORPAsync(schem.orp, data.orp);
            // Ph Settings
            await this.ph.setPhAsync(schem.ph, data.ph);
            await this.processAlarms(schem);
        }
        catch (err) { return Promise.reject(err); }
    }
    public calculateSaturationIndex(): void {
        // Saturation Index = SI = pH + CHF + AF + TF - TDSF   
        let schem = state.chemControllers.getItemById(this.chem.id, true);
        let SI = Math.round((
            schem.ph.level +
            this.calciumHardnessFactor +
            this.carbonateAlkalinity +
            this.calculateTemperatureFactor(schem) -
            this.dissolvedSolidsFactor) * 1000) / 1000;
        schem.saturationIndex = isNaN(SI) ? undefined : SI;
    }
    private get dissolvedSolidsFactor() { return this.chem.orp.useChlorinator ? 12.2 : 12.1; }
    private calculateTemperatureFactor(schem: ChemControllerState): number {
        const tempC = utils.convert.temperature.convertUnits(
            schem.ph.probe.temperature,
            typeof schem.ph.probe.tempUnits !== 'undefined' ? sys.board.valueMaps.tempUnits.getName(schem.ph.probe.tempUnits) : sys.board.valueMaps.tempUnits.getName(state.temps.units),
            'C');
        if (tempC <= 0) return 0.0;
        else if (tempC <= 2.8) return 0.1;
        else if (tempC <= 7.8) return 0.2;
        else if (tempC <= 11.7) return 0.3;
        else if (tempC <= 15.6) return 0.4;
        else if (tempC <= 18.9) return 0.5;
        else if (tempC <= 24.4) return 0.6;
        else if (tempC <= 28.9) return 0.7;
        else if (tempC <= 34.4) return 0.8;
        return 0.9;
    }
    public async pollEquipment() {
        try {
            if (typeof this._pollTimer !== 'undefined') {
                clearTimeout(this._pollTimer);
                this._pollTimer = null;
            }
            let success = false;
            let schem = state.chemControllers.getItemById(this.chem.id, true);
            // We need to check on the equipment to make sure it is solid.
            if (sys.board.valueMaps.chemControllerTypes.getName(this.chem.type) === 'intellichem') {
                success = await sys.board.chemControllers.pollIntelliChem(this.chem.address);
                schem.alarms.comms = sys.board.valueMaps.chemControllerStatus.encode(success ? 'ok' : 'nocomms');
            }
            else if (sys.board.valueMaps.chemControllerTypes.getName(this.chem.type) === 'rem') {
                schem.alarms.comms = 0;
                schem.status = 0;
                schem.lastComm = new Date().getTime();
                let val = await this.validateSetup(this.chem);
                schem.warnings.invalidSetup = val.isValid ? 0 : 8;
                // We are not processing Homegrown at this point.
                // Check each piece of equipment to make sure it is doing its thing.
                //await this.orp.checkDosing();
                this.calculateSaturationIndex();
                await this.processAlarms(schem);
                await this.ph.checkDosing(this.chem, schem.ph);
            }
        }
        catch (err) { logger.error(`Error polling Chem Controller`); }
        finally {
            if (typeof this._pollTimer !== 'undefined' && this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = setTimeout(() => this.pollEquipment(), this.pollingInterval || 10000);
        }
    }
    public async processAlarms(schem: ChemControllerState) {
        // Calculate all the alarms.  These are only informational at this point.
        schem.flowDetected = this.isBodyOn();
        schem.alarms.flow = schem.flowDetected ? 0 : 1;
        let chem = this.chem;
        schem.orp.enabled = this.chem.orp.enabled;
        schem.ph.enabled = this.chem.ph.enabled;
        if (this.chem.orp.enabled) {
            let useChlorinator = chem.orp.useChlorinator;
            let pumpType = chem.orp.pump.type;
            let probeType = chem.orp.probe.type;
            schem.alarms.orpTank = !useChlorinator && pumpType !== 0 && schem.orp.tank.level <= 0 ? 64 : 0;
            schem.warnings.orpDailyLimitReached = 0;
            if (schem.flowDetected) {
                schem.alarms.orp = schem.orp.level < 650 && probeType !== 0 ? 16 : schem.orp.level > 800 && probeType !== 0 ? 8 : 0;
                schem.warnings.chlorinatorCommError = useChlorinator && state.chlorinators.getItemById(1).status & 0xF0 ? 16 : 0;
                schem.warnings.pHLockout = useChlorinator === false && probeType !== 0 && pumpType !== 0 && schem.ph.level > 7.8 ? 1 : 0;
            }
            else {
                schem.alarms.orp = 0;
                schem.warnings.chlorinatorCommError = 0;
                schem.warnings.pHLockout = 0;
            }
        }
        else {
            schem.warnings.chlorinatorCommError = 0;
            schem.alarms.orpTank = 0;
            schem.warnings.orpDailyLimitReached = 0;
            schem.alarms.orp;
        }
        if (this.chem.ph.enabled) {
            let pumpType = chem.ph.pump.type;
            let probeType = chem.ph.probe.type;
            schem.alarms.pHTank = pumpType !== 0  && schem.ph.tank.level <= 0 ? 32 : 0;
            schem.warnings.pHDailyLimitReached = 0;
            if (schem.flowDetected) {
                schem.alarms.pH = probeType !== 0 && schem.ph.level < 7.2 ? 4 : schem.ph.level && probeType !== 0 > 7.6 ? 2 : 0;
            }
            else {
                schem.alarms.pH = 0;
            }
        }
        schem.warnings.waterChemistry = schem.saturationIndex < -0.3 ? 1 : schem.saturationIndex > 0.3 ? 2 : 0;
        // RKS: TODO: Need to calculate what a valid daily limit would be for this controller.  This should be
        // based upon 2ppm of chemical for the type of chemical.  Honestly it is pretty dumb.
        schem.warnings.pHDailyLimitReached = 0;
    }
    public async validateSetup(chem: ChemController) {
        // The validation will be different if the body is on or not.  So lets get that information.
        let eq = {
            isValid: true,
            orp: {
                probe: [],
                pump: [],
                tank: [],
                errors: []
            },
            ph: {
                probe: [],
                pump: [],
                tank: [],
                errors: []
            },
            errors: []
        }
        try {
            if (chem.orp.enabled) {
                if (chem.orp.probe.type !== 0) {
                    let type = sys.board.valueMaps.chemORPProbeTypes.transform(chem.orp.probe.type);
                    if (type.remAddress) {
                        try {
                            let dev = await NixieEquipment.getDeviceService(chem.orp.probe.connectionId, `/config/device/${chem.orp.probe.deviceBinding}`);
                        } catch (err) { eq.orp.probe.push(err); eq.isValid = false; }
                    }
                }
                if (chem.orp.useChlorinator) {
                    let chlor = sys.chlorinators.getItemById(1);
                    if (chlor.body !== chem.body) {
                        eq.isValid = false;
                        eq.orp.errors.push(new Error(`Chlorinator body mismatch.`));
                    }
                }
                else if (chem.orp.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.orp.probe.type);
                    if (type.remAddress) {
                        try {
                            let dev = await NixieEquipment.getDeviceService(chem.orp.pump.connectionId, `/config/device/${chem.orp.pump.deviceBinding}`);
                        } catch (err) { eq.orp.pump.push(err); eq.isValid = false; }
                    }
                }
            }
            if (chem.ph.enabled) {
                if (chem.ph.probe.type !== 0) {
                    let type = sys.board.valueMaps.chemPhProbeTypes.transform(chem.ph.probe.type);
                    if (type.remAddress) {
                        try {
                            let dev = await NixieEquipment.getDeviceService(chem.ph.probe.connectionId, `/config/device/${chem.ph.probe.deviceBinding}`);
                        } catch (err) { eq.ph.probe.push(err); eq.isValid = false; }
                    }
                }
                if (chem.ph.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.ph.probe.type);
                    if (type.remAddress) {
                        try {
                            let dev = await NixieEquipment.getDeviceService(chem.ph.pump.connectionId, `/config/device/${chem.ph.pump.deviceBinding}`);
                        } catch (err) { eq.ph.pump.push(err); eq.isValid = false; }
                    }
                }
            }
            if (!chem.isActive) {
                eq.isValid = false;
                eq.errors.push(new Error(`Chem controller is not active`));
            }
            else {
                let totalGallons = 0;
                if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                if (chem.body === 2 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                if (chem.body === 3) totalGallons += sys.bodies.getItemById(3).capacity;
                if (chem.body === 4) totalGallons += sys.bodies.getItemById(4).capacity;
                if (isNaN(totalGallons) || totalGallons === 0) {
                    eq.isValid = false;
                    eq.errors.push(`The total gallons for the associated body are ${totalGallons}`);
                }
            }
            return eq;
        } catch (err) { logger.error(`Error validating setup ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined') clearTimeout(this._pollTimer);
            this._pollTimer = null;
            await this.ph.closeAsync();
            await this.orp.closeAsync();

        }
        catch (err) { logger.error(err); return Promise.reject(err); }
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.chem.body);
        if (isOn && typeof this.bodyOnTime === 'undefined') {
            this.bodyOnTime = new Date().getTime();
        }
        else if (!isOn) this.bodyOnTime = undefined;
        return isOn;
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
class NixieChemical extends NixieChildEquipment {
    public chemical: Chemical;
    public pump: NixieChemPump;
    public tank: NixieChemTank;
    public _lastOnStatus: number;
    public currentDose: NixieChemDose;
    public currentMix: NixieChemMix;
    protected _mixTimer: NodeJS.Timeout;
    public get chemController(): NixieChemController { return this.getParent() as NixieChemController; }
    constructor(controller: NixieChemController, chemical: Chemical) {
        super(controller);
        chemical.master = 1;
        this.chemical = chemical;
        this.pump = new NixieChemPump(this, chemical.pump);
        this.tank = new NixieChemTank(this, chemical.tank);
    }
    protected async setHardware(chemical: Chemical, data: any) {
        try {

        }
        catch (err) { return Promise.reject(err); }
    }
    protected async setDosing(chemical: Chemical, data: any) {
        try {
            if (typeof data !== 'undefined') {
                chemical.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : chemical.enabled;
                chemical.dosingMethod = typeof data.dosingMethod !== 'undefined' ? data.dosingMethod : chemical.dosingMethod;
                if (typeof data.maxDosingTimeHours !== 'undefined' || typeof data.maxDosingTimeMinutes !== 'undefined') {
                    data.maxDosingTime = (typeof data.maxDosingTimeHours !== 'undefined' ? parseInt(data.maxDosingTimeHours, 10) * 3600 : 0) +
                        (typeof data.maxDosingTimeMinutes !== 'undefined' ? parseInt(data.maxDosingTimeMinutes, 10) * 60 : 0) +
                        (typeof data.maxDosingTimeSeconds !== 'undefined' ? parseInt(data.maxDosingTimeSeconds, 10) : 0);
                }
                chemical.maxDosingTime = typeof data.maxDosingTime !== 'undefined' ? parseInt(data.maxDosingTime, 10) : chemical.maxDosingTime;
                chemical.maxDosingVolume = typeof data.maxDosingVolume !== 'undefined' ? parseInt(data.maxDosingVolume, 10) : chemical.maxDosingVolume;
                chemical.startDelay = typeof data.startDelay !== 'undefined' ? parseFloat(data.startDelay) : chemical.startDelay;
            }
        } catch (err) { return Promise.reject(err); }
    }
    protected async setMixing(chemical: Chemical, data: any) {
        try {
            if (typeof data !== 'undefined') {
                if (typeof data.mixingTimeHours !== 'undefined' || typeof data.mixingTimeMinutes !== 'undefined') {
                    data.mixingTime = (typeof data.mixingTimeHours !== 'undefined' ? parseInt(data.mixingTimeHours, 10) * 3600 : 0) +
                        (typeof data.mixingTimeMinutes !== 'undefined' ? parseInt(data.mixingTimeMinutes, 10) * 60 : 0) +
                        (typeof data.mixingTimeSeconds !== 'undefined' ? parseInt(data.mixingTimeSeconds, 10) : 0);
                }
                chemical.mixingTime = typeof data.mixingTime !== 'undefined' ? parseInt(data.mixingTime, 10) : chemical.mixingTime;
            }
        } catch (err) { return Promise.reject(err); }
    }
    public async mixChemicals(schem: ChemicalState) {
        try {
            let chem = this.chemController.chem;
            let isBodyOn = this.chemController.isBodyOn();
            schem.pump.isDosing = false;
            if (typeof this._mixTimer !== 'undefined') {
                clearTimeout(this._mixTimer);
                this._mixTimer = undefined;
            }
            if (typeof this.currentMix === 'undefined') {
                this.currentMix = new NixieChemMix();
                this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: this.chemical.mixingTime - (this.chemical.mixingTime - schem.mixTimeRemaining) });
                logger.info(`Chem Controller begin mixing for ${utils.formatDuration(this.currentMix.timeRemaining)}`)
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('mixing');
            }
            let dt = new Date().getTime();
            if (isBodyOn) {
                this.currentMix.timeMixed += Math.round((dt - this.currentMix.lastChecked) / 1000);
                // Reflect any changes to the configuration.
                this.currentMix.time = this.chemical.mixingTime;
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
            }
            this.currentMix.lastChecked = dt;
            if (schem.mixTimeRemaining === 0) {
                logger.info(`Chem Controller mixing Complete after ${utils.formatDuration(this.currentMix.timeMixed)}`)
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('monitoring');
                this.currentMix = undefined;
            }
            else {
                this._mixTimer = setTimeout(async () => {
                    try {
                        await this.mixChemicals(schem);
                    } catch (err) { logger.error(err); }
                }, 1000);
            }
            schem.chemController.emitEquipmentChange();
        } catch (err) { logger.error(`Error mixing chemicals.`) }

    }
    public async closeAsync() {
        try {
            if (typeof this._mixTimer !== 'undefined') clearTimeout(this._mixTimer);
            this._mixTimer = undefined;
            await this.pump.stopDosing();
            await super.closeAsync();
        }
        catch (err) { logger.error(err); }
    }
}
export class NixieChemTank extends NixieChildEquipment {
    public tank: ChemicalTank;
    constructor(chemical: NixieChemical, tank: ChemicalTank) {
        super(chemical);
        this.tank = tank;
        tank.master = 1;
    }
    public async setTankAsync(stank: ChemicalTankState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                stank.level = typeof data.level !== 'undefined' ? parseFloat(data.level) : stank.level;
                stank.capacity = this.tank.capacity = typeof data.capacity !== 'undefined' ? parseFloat(data.capacity) : stank.capacity;
                stank.units = this.tank.units = typeof data.units !== 'undefined' ? sys.board.valueMaps.volumeUnits.encode(data.units) : this.tank.units;
            }
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemDose {
    public method: string;
    public startDate: number;
    public setpoint: number;
    public level: number;
    public demand: number;
    public volume: number;
    public time: number;
    public maxVolume: number;
    public maxTime: number;
    public volumeDosed: number = 0;
    public timeDosed: number = 0;
    public lastLatchTime: number;
    public schem: ChemicalState;
    public get timeRemaining(): number { return Math.floor(Math.max(0, this.time - (this.timeDosed / 1000))); }
    public get volumeRemaining(): number { return Math.max(0, this.volume - this.volumeDosed); }
    public log(chem: NixieChemical) {
        if (typeof chem !== 'undefined' && typeof chem.chemController !== 'undefined' && typeof this.schem !== 'undefined')
            chem.chemController.logData(`chemDosage_${this.schem.chemType}.log`,
                `{"id":${chem.chemController.chem.id},"chem":"${this.schem.chemType}",start":${Timestamp.toISOLocal(this.startDate)},"end":"${Timestamp.toISOLocal(new Date())}","demand":${this.demand}, "level": ${ this.level }, "volume": ${ this.volume }, "volumeDosed": ${ this.volumeDosed }, "timeDosed": "${utils.formatDuration(this.timeDosed/1000)}"}`);
    }
    public set(obj: any) {
        if (typeof obj.method === 'string') this.method = obj.method;
        if (typeof obj.setpoint === 'number') this.setpoint = obj.setpoint;
        if (typeof obj.level === 'number') this.level = obj.level;
        if (typeof obj.volume === 'number') this.volume = obj.volume;
        if (typeof obj.time === 'number') this.time = obj.time;
        if (typeof obj.maxVolume === 'number') this.maxVolume = obj.maxVolume;
        if (typeof obj.volumeDosed === 'number') this.volumeDosed = obj.volumeDosed;
        if (typeof obj.timeDosed === 'number') this.timeDosed = obj.timeDosed;
        if (typeof obj.schem !== 'undefined') this.schem = obj.schem;
        if (typeof obj.demand !== 'undefined') this.demand = obj.demand;
        this.startDate = typeof obj.startDate === 'undefined' ? new Date() : obj.startDate;
    }
}
export class NixieChemMix {
    public time: number;
    public timeMixed: number = 0;
    public schem: ChemicalState;
    public lastChecked: number = new Date().getTime();
    public get timeRemaining(): number { return Math.max(0, this.time - this.timeMixed); }
    public set(obj: any) {
        if (typeof obj.time === 'number') this.time = obj.time;
        if (typeof obj.timeMixed === 'number') this.timeMixed = obj.timeMixed;
        if (typeof obj.schem !== 'undefined') this.schem = obj.schem;
    }
}
export class NixieChemPump extends NixieChildEquipment {
    public pump: ChemicalPump;
    public isOn: boolean;
    public _lastOnStatus: number;
    protected _dosingTimer: NodeJS.Timeout;
    constructor(chemical: NixieChemical, pump: ChemicalPump) { super(chemical); this.pump = pump; }
    public get chemical(): NixieChemical { return this.getParent() as NixieChemical; }
    public async setPumpAsync(spump: ChemicalPumpState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                this.pump.enabled = typeof data.enabled !== 'undefined' ? data.enabled : this.pump.enabled;
                this.pump.type = typeof data.type !== 'undefined' ? data.type : this.pump.type;
                this.pump.ratedFlow = typeof data.ratedFlow !== 'undefined' ? data.ratedFlow : this.pump.ratedFlow;
                this.pump.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : this.pump.connectionId;
                this.pump.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : this.pump.deviceBinding;
            }
        } catch (err) { return Promise.reject(err); }

    }
    public async stopDosing() {
        try {
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
                if (typeof this.chemical.currentDose !== 'undefined') this.chemical.currentDose.log(this.chemical);
                this.chemical.currentDose = undefined;
                
                await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
            }
        } catch (err) { return Promise.reject(err); }
    }
    public async dose(dosage: NixieChemDose) {
        try {
            let scontroller = dosage.schem.chemController;
            if (this._dosingTimer) clearTimeout(this._dosingTimer);
            let type = sys.board.valueMaps.chemPumpTypes.getName(this.pump.type);
            if (type === 'none') {
                // We aren't going to do anything.
            }
            else if (type === 'relay') {
                // We are a relay pump so we need to turn on the pump for a timed interval
                // then check it on each iteration.  If the pump does not receive a request
                // from us then the relay will turn off.
                this.chemical.chemController.processAlarms(dosage.schem.chemController);
                let isBodyOn = scontroller.flowDetected;
                let delay = 0;
                // Check to see if we are in delay.  The start delay for the configuration is in minutes.
                if (isBodyOn) {
                    // The remaining delay = delay time - (current time - on time).
                    let timeElapsed = new Date().getTime() - this.chemical.chemController.bodyOnTime;
                    delay = Math.max(0, ((this.chemical.chemical.startDelay * 60) * 1000) - timeElapsed);
                    dosage.schem.delayTimeRemaining = Math.round(delay/1000);
                    if (delay > 0) {
                        if (!dosage.schem.flowDelay) logger.info(`Chem Controller delay dosing for ${utils.formatDuration(delay/1000)}`)
                        dosage.schem.flowDelay = true;
                    }
                    else {
                        dosage.schem.flowDelay = false;
                    }
                }
                // Send a request to latch the relay for 3 seconds.  If we don't send another request within 3 seconds of the latch
                // expiring it will turn the relay back off again. This makes sure we don't leave the pump running on failure.
                //console.log({ status: dosage.schem.dosingStatus, time: dosage.time, timeDosed: dosage.timeDosed / 1000, volume: dosage.volume, volumeDosed: dosage.volumeDosed });
                if (!isBodyOn) {
                    // Make sure the pump is off.
                    await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
                    dosage.schem.pump.isDosing = this.isOn = false;
                }
                else if (dosage.schem.tank.level <= 0 || dosage.timeRemaining <= 0 || dosage.volumeRemaining <= 0) {
                    // If we ran the tank dry or we completed the dose. Start mixing.
                    await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
                    dosage.schem.dosingStatus = 2;
                }
                else if (dosage.timeRemaining > 0 && dosage.volumeRemaining > 0) {
                    if (delay <= 0) {
                        let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: true, latch: 3000 });
                        let relay = res.obj;
                        if (typeof dosage.lastLatchTime !== 'undefined') {
                            let time = new Date().getTime() - dosage.lastLatchTime;
                            // Run our math out to 7 sig figs to keep in the ballpark for very slow pumps.
                            let vol = Math.round((this.pump.ratedFlow * (time / 1000) / 60) * 1000000) / 1000000;
                            dosage.timeDosed += time;
                            dosage.volumeDosed += vol;
                            if (dosage.schem.tank.units > 0) {
                                let lvl = dosage.schem.tank.level - utils.convert.volume.convertUnits(vol, 'mL', sys.board.valueMaps.volumeUnits.getName(dosage.schem.tank.units));
                                dosage.schem.tank.level = Math.max(0, lvl);
                            }
                        }
                        logger.info(`Chem Controller dosed ${dosage.volumeDosed.toFixed(2)}mL of ${dosage.volume}mL ${utils.formatDuration(dosage.timeRemaining)} remaining`);
                        dosage.schem.pump.isDosing = this.isOn = relay.state;
                    }
                    else 
                        dosage.schem.pump.isDosing = this.isOn = false;

                    // Set the volume and time remaining to the second and 4 sig figs.
                    dosage.schem.dosingVolumeRemaining = dosage.volumeRemaining;
                    // Time dosed is in ms.  This is to accommodate the slow pumps.
                    dosage.schem.dosingTimeRemaining = dosage.timeRemaining;
                    // Clear both dosage remaining if either is zero. This can occur when the flow rate when calculated overlaps.
                    if (dosage.schem.dosingTimeRemaining === 0 || dosage.schem.dosingVolumeRemaining === 0) {
                        dosage.schem.dosingVolumeRemaining = dosage.schem.dosingTimeRemaining = 0;
                        //dosage.timeDosed = dosage.time * 1000;
                        //dosage.volumeDosed = dosage.volume;
                        dosage.schem.dosingStatus = 2; // Start mixing
                        await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
                    }
                    else
                        dosage.schem.dosingStatus = 0;
                    dosage.lastLatchTime = new Date().getTime();
                }
                else {
                    await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
                    dosage.schem.pump.isDosing = this.isOn = false;
                }
            }
            else if (type === 'ezo-pmp') {
                logger.info(`Attempting to dose ezo pump`);
                await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: true, latch: 5000 });
            }
            // Check to see if we reached our max dosing time or volume or the tank is empty mix it up.
            let status = dosage.schem.dosingStatus;
            if (status === 0) {
                if (dosage.maxTime < (dosage.timeDosed / 1000) ||
                    dosage.maxVolume < dosage.volumeDosed ||
                    dosage.schem.tank.level <= 0) {
                    status = 2;
                    await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
                }
            }
            dosage.schem.dosingStatus = status;
        } catch (err) {
            // If we have an error then we want to clear the latch time.  Theoretically we could add 3 seconds of latch time but who knows when the failure
            // occurred.
            dosage.lastLatchTime = undefined;
            return Promise.reject(err);
        }
        finally {
            dosage.schem.chemController.emitEquipmentChange();
            // Add a check to tell the chem when we are done.
            if (dosage.schem.dosingStatus === 0) {
                this._dosingTimer = setTimeout(async () => {
                    try {
                        await this.dose(dosage)
                    }
                    catch (err) { logger.error(err); }
                }, 1000);
            }
            else if (dosage.schem.dosingStatus === 2) {
                // Tell whichever chemical we are dealing with to begin mixing.
                if (typeof this.chemical.currentDose !== 'undefined') this.chemical.currentDose.log(this.chemical);
                this.chemical.currentDose = undefined;
                dosage.schem.pump.isDosing = this.isOn = false;
                await this.chemical.mixChemicals(dosage.schem);
            }
            else if (dosage.schem.dosingStatus === 1) {
                if (typeof this.chemical.currentDose !== 'undefined') this.chemical.currentDose.log(this.chemical);
                this.chemical.currentDose = undefined;
                dosage.schem.pump.isDosing = this.isOn = false;
            }
        }
    }
    public async turnOff(schem: ChemicalState) {
        try {
            // We need to be turning this pig off.  If the REM service has been interrupted
            // then we will assume that the relay is off since any request to turn it on will be based upon
            // the idea that the socket remains open.  If it fails then it will have gone off.  If we are talking
            // about an EZO pump all the values are maintained anyway through the state settings.
            let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });

        }
        catch (err) { return Promise.reject(err); }
    }
    public async keepOn(schem: ChemicalState) {
        try {

        }
        catch (err) { return Promise.reject(err); }
    }
    public async turnOn(schem: ChemicalState) {
        try {
            await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { isOn: true });
        }
        catch (err) { return Promise.reject(err); }

    }
}
export class NixieChemicalPh extends NixieChemical {
    public get ph(): ChemicalPh { return this.chemical as ChemicalPh; }
    public probe: NixieChemProbePh;
    public mixStart: Date;
    public doseStart: Date;
    constructor(controller: NixieChemController, chemical: ChemicalPh) {
        super(controller, chemical);
        this.probe = new NixieChemProbePh(this, chemical.probe);
    }
    public async setPhAsync(sph: ChemicalPhState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                await this.setDosing(this.ph, data);
                await this.setMixing(this.ph, data);
                await this.probe.setProbePhAsync(sph.probe, data.probe);
                await this.tank.setTankAsync(sph.tank, data.tank);
                await this.pump.setPumpAsync(sph.pump, data.pump);
                sph.enabled = this.ph.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : this.ph.enabled;
                this.ph.setpoint = typeof data.setpoint !== 'undefined' ? parseFloat(data.setpoint) : this.ph.setpoint;
                this.ph.phSupply = typeof data.phSupply !== 'undefined' ? data.phSupply : this.ph.phSupply;
                this.ph.acidType = typeof data.acidType !== 'undefined' ? data.acidType : this.ph.acidType;
                this.ph.flowReadingsOnly = typeof data.flowReadingsOnly !== 'undefined' ? utils.makeBool(data.flowReadingsOnly) : this.ph.flowReadingsOnly;
                sph.level = typeof data.level !== 'undefined' && !isNaN(parseFloat(data.level)) ? parseFloat(data.level) : sph.level;
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public async checkDosing(chem: ChemController, sph: ChemicalPhState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentDose = undefined;
                this.currentMix = undefined;
            }
            if (status === 'mixing')
                await this.mixChemicals(sph);
            else if (status === 'monitoring' || status === 'dosing') {
                // Figure out what mode we are in and what mode we should be in.
                //sph.level = 7.61;
                // Check the setpoint and the current level to see if we need to dose.
                let dose = 0;
                if (sph.level !== this.ph.setpoint) {
                    // Calculate how many mL are required to raise to our pH level.
                    // 1. Get the total gallons of water that the chem controller is in
                    // control of.
                    let totalGallons = 0;
                    if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                    if (chem.body === 2 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                    if (chem.body === 3) totalGallons += sys.bodies.getItemById(3).capacity;
                    if (chem.body === 4) totalGallons += sys.bodies.getItemById(4).capacity;
                    //let pv = utils.convert.volume.convertUnits(totalGallons, 'gal', 'L');
                    let chg = this.ph.setpoint - sph.level;
                    let delta = chg * totalGallons;
                    let temp = (sph.level + this.ph.setpoint) / 2;
                    let adj = (192.1626 + -60.1221 * temp + 6.0752 * temp * temp + -0.1943 * temp * temp * temp) * (chem.alkalinity + 13.91) / 114.6;
                    let extra = (-5.476259 + 2.414292 * temp + -0.355882 * temp * temp + 0.01755 * temp * temp * temp) * sph['borateLevel'] || 0;
                    extra *= delta;
                    delta *= adj;
                    if (sys.board.valueMaps.phSupplyTypes.getName(this.ph.phSupply) === 'base') {
                        if (chg > 0) {

                        }
                    }
                    else {
                        if (chg < 0) {
                            let at = sys.board.valueMaps.acidTypes.transform(this.ph.acidType);
                            let pump = this.pump.pump;
                            let demand = dose = Math.round(utils.convert.volume.convertUnits((delta / -240.15 * at.dosingFactor) + (extra / -240.15 * at.dosingFactor), 'oz', 'mL'));
                            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0: Math.round(dose / (pump.ratedFlow / 60));
                            let meth = sys.board.valueMaps.chemDosingMethods.getName(this.ph.dosingMethod);
                            // Now that we know our acid demand we need to adjust this dose based upon the limits provided in the setup.
                            switch (meth) {
                                case 'time':
                                    if (time > this.ph.maxDosingTime) {
                                        time = this.ph.maxDosingTime;
                                        dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                                    }
                                    break;
                                case 'volume':
                                    if (dose > this.ph.maxDosingVolume) {
                                        dose = this.ph.maxDosingVolume;
                                        time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                                    }
                                    break;
                                case 'volumeTime':
                                default:
                                    // This is maybe a bit dumb as the volume and time should equal out for the rated flow.  In other words
                                    // you will never get to the volume limit if the rated flow can't keep up to the time.
                                    if (dose > this.ph.maxDosingVolume) {
                                        dose = this.ph.maxDosingVolume;
                                        time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                                    }
                                    if (time > this.ph.maxDosingTime) {
                                        time = this.ph.maxDosingTime;
                                        dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                                    }
                                    break;
                            }
                            let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose() : this.currentDose;
                            dosage.set({startDate:new Date(), schem: sph, method: meth, setpoint: this.ph.setpoint, level: sph.level, volume: dose, time: time, maxVolume: Math.max(meth.indexOf('vol') !== -1 ? this.ph.maxDosingVolume : dose), maxTime: Math.max(meth.indexOf('time') !== -1 ? this.ph.maxDosingTime : time) });
                            sph.doseTime = dosage.time;
                            sph.doseVolume = dosage.volume;
                            if (typeof this.currentDose === 'undefined') {
                                // We will include this with the dose demand because our limits may reduce it.
                                dosage.demand = demand;
                                if (sph.dosingStatus === 0) { // 0 is dosing.
                                    // We need to finish off a dose that was interrupted by regular programming.  This occurs
                                    // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                                    // mixing before we will never get here.
                                    dosage.timeDosed = (dosage.time - (dosage.time - sph.dosingTimeRemaining)) * 1000;
                                    dosage.volumeDosed = dosage.volume - (dosage.volume - sph.dosingVolumeRemaining);
                                } 
                            }
                            // Now let's determine what we need to do with our pump to satisfy our acid demand.
                            if (sph.tank.level > 0) {
                                await this.pump.dose(dosage);
                                this.currentDose = dosage;
                            }
                            else if (sph.dosingStatus === 0) { // We were dosing.  Start mixing this is likely unattended
                                await this.pump.stopDosing();
                                await this.mixChemicals(sph);
                            }
                        }
                        else {
                            await this.pump.stopDosing();
                            if (sph.dosingStatus === 0) await this.mixChemicals(sph);
                        }
                    }
                }
            }
        }
        catch (err) { logger.error(err); }
    }
}
export class NixieChemicalORP extends NixieChemical {
    public orp: ChemicalORP;
    public probe: NixieChemProbeORP;
    constructor(controller: NixieChemController, chemical: ChemicalORP) {
        super(controller, chemical);
        this.orp = chemical;
        this.probe = new NixieChemProbeORP(this, chemical.probe);
    }
    public async setORPAsync(sorp: ChemicalORPState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                this.orp.useChlorinator = typeof data.useChlorinator !== 'undefined' ? utils.makeBool(data.useChlorinator) : this.orp.useChlorinator;
                sorp.enabled = this.orp.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : this.orp.enabled;
                sorp.level = typeof data.level !== 'undefined' && !isNaN(parseFloat(data.level)) ? parseFloat(data.level) : sorp.level;
                this.orp.flowReadingsOnly = typeof data.flowReadingsOnly !== 'undefined' ? utils.makeBool(data.flowReadingsOnly) : this.orp.flowReadingsOnly;
                await this.setDosing(this.orp, data);
                await this.setMixing(this.orp, data);
                await this.probe.setProbeORPAsync(sorp.probe, data.probe);
                await this.tank.setTankAsync(sorp.tank, data.tank);
                await this.pump.setPumpAsync(sorp.pump, data.pump);
                this.orp.setpoint = typeof data.setpoint !== 'undefined' ? parseInt(data.setpoint, 10) : this.orp.setpoint;
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public async checkDosing(chem: ChemController, sorp: ChemicalORPState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentDose = undefined;
                this.currentMix = undefined;
                if (typeof this._mixTimer !== 'undefined') {
                    clearTimeout(this._mixTimer)
                    this._mixTimer = undefined;
                }
            }
            if (status === 'mixing')
                await this.mixChemicals(sorp);
            else if (status === 'monitoring' || status === 'dosing' && !this.orp.useChlorinator) {
                let dose = 0;
                if (this.orp.setpoint < sorp.level && !sorp.lockout) {
                    // Calculate how many mL are required to raise to our pH level.
                    // 1. Get the total gallons of water that the chem controller is in
                    // control of.
                    let totalGallons = 0;
                    if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                    if (chem.body === 2 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                    if (chem.body === 3) totalGallons += sys.bodies.getItemById(3).capacity;
                    if (chem.body === 4) totalGallons += sys.bodies.getItemById(4).capacity;
                    let pump = this.pump.pump;
                    let demand = dose = Math.round(utils.convert.volume.convertUnits(0, 'oz', 'mL'));
                    let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                    let meth = sys.board.valueMaps.chemDosingMethods.getName(this.orp.dosingMethod);
                    // Now that we know our acid demand we need to adjust this dose based upon the limits provided in the setup.
                    switch (meth) {
                        case 'time':
                            if (time > this.orp.maxDosingTime) {
                                time = this.orp.maxDosingTime;
                                dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                            }
                            break;
                        case 'volume':
                            if (dose > this.orp.maxDosingVolume) {
                                dose = this.orp.maxDosingVolume;
                                time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                            }
                            break;
                        case 'volumeTime':
                        default:
                            // This is maybe a bit dumb as the volume and time should equal out for the rated flow.  In other words
                            // you will never get to the volume limit if the rated flow can't keep up to the time.
                            if (dose > this.orp.maxDosingVolume) {
                                dose = this.orp.maxDosingVolume;
                                time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                            }
                            if (time > this.orp.maxDosingTime) {
                                time = this.orp.maxDosingTime;
                                dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                            }
                            break;
                    }
                    let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose() : this.currentDose;
                    dosage.set({ startDate: new Date(), schem: sorp, method: meth, setpoint: this.orp.setpoint, level: sorp.level, volume: dose, time: time, maxVolume: Math.max(meth.indexOf('vol') !== -1 ? this.orp.maxDosingVolume : dose), maxTime: Math.max(meth.indexOf('time') !== -1 ? this.orp.maxDosingTime : time) });
                    sorp.doseTime = dosage.time;
                    sorp.doseVolume = dosage.volume;
                    if (typeof this.currentDose === 'undefined') {
                        // We will include this with the dose demand because our limits may reduce it.
                        dosage.demand = demand;
                        if (sorp.dosingStatus === 0) { // 0 is dosing.
                            // We need to finish off a dose that was interrupted by regular programming.  This occurs
                            // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                            // mixing before we will never get here.
                            dosage.timeDosed = (dosage.time - (dosage.time - sorp.dosingTimeRemaining)) * 1000;
                            dosage.volumeDosed = dosage.volume - (dosage.volume - sorp.dosingVolumeRemaining);
                        }
                    }
                    // Now let's determine what we need to do with our pump to satisfy our acid demand.
                    if (sorp.tank.level > 0) {
                        await this.pump.dose(dosage);
                        this.currentDose = dosage;
                    }
                    else if (sorp.dosingStatus === 0) { // We were dosing.  Start mixing this is likely unattended
                        await this.pump.stopDosing();
                        await this.mixChemicals(sorp);
                    }
                }
                else {
                    await this.pump.stopDosing();
                }
            }
        }
        catch (err) { logger.error(err); }
    }

}
class NixieChemProbe extends NixieChildEquipment {
    constructor(parent: NixieChemical) { super(parent); }
    public async setProbeAsync(probe: ChemicalProbe, sprobe: ChemicalProbeState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                sprobe.level = typeof data.level !== 'undefined' ? parseFloat(data.level) : sprobe.level;
                // Alright first we must remove any references to the old connection if it exists.
                //if (typeof data.connectionId !== 'undefined' && typeof data.deviceBinding !== 'undefined' && data.connectionId !== '' && data.deviceBinding !== 'undefined') {
                //    let res = await NixieEquipment.deleteDeviceService(probe.connectionId, `/state/device/feed/${probe.deviceBinding}`, { id: <controllerId> });
                //}
                probe.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : probe.connectionId;
                probe.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : probe.deviceBinding;
            }
        } catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemProbePh extends NixieChemProbe {
    public probe: ChemicalPhProbe;
    constructor(parent: NixieChemicalPh, probe: ChemicalPhProbe) {
        super(parent);
        this.probe = probe;
        probe.master = 1;
    }
    public async setProbePhAsync(sprobe: ChemicalProbePHState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                await this.setProbeAsync(this.probe, sprobe, data);
                this.probe.type = typeof data.type !== 'undefined' ? data.type : this.probe.type;
                sprobe.temperature = typeof data.temperature !== 'undefined' ? parseFloat(data.temperature) : sprobe.temperature;
                sprobe.tempUnits = typeof data.tempUnits !== 'undefined' ? data.tempUnits : sprobe.tempUnits;
            }
        } catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemProbeORP extends NixieChemProbe {
    public probe: ChemicalORPProbe;
    constructor(parent: NixieChemicalORP, probe: ChemicalORPProbe) {
        super(parent);
        this.probe = probe;
        probe.master = 1;
    }
    public async setProbeORPAsync(sprobe: ChemicalProbeORPState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                await this.setProbeAsync(this.probe, sprobe, data);
                this.probe.type = typeof data.type !== 'undefined' ? data.type : this.probe.type;
                sprobe.saltLevel = typeof data.saltLevel !== 'undefined' ? parseFloat(data.saltLevel) : sprobe.saltLevel;
            }
        } catch (err) { return Promise.reject(err); }
    }
}
