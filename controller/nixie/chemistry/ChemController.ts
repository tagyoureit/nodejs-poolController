import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { ChemController, Chemical, ChemicalPh, ChemicalORP, ChemicalPhProbe, ChemicalORPProbe, ChemicalTank, ChemicalPump, sys, ChemicalProbe, ChemControllerCollection, ChemFlowSensor } from "../../../controller/Equipment";
import { ChemControllerState, ChemicalState, ChemicalORPState, ChemicalPhState, state, ChemicalProbeState, ChemicalProbePHState, ChemicalProbeORPState, ChemicalTankState, ChemicalPumpState } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieChemControllerCollection extends NixieEquipmentCollection<NixieChemController> {
    public async manualDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.manualDoseAsync(data);
        } catch (err) { return Promise.reject(err); }
    }
    public async cancelDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.cancelDosingAsync(data);
        } catch (err) { return Promise.reject(err); }
    }

    public async setControllerAsync(chem: ChemController, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        let c: NixieChemController = this.find(elem => elem.id === chem.id) as NixieChemController;
        if (typeof c === 'undefined') {
            chem.master = 1;
            c = new NixieChemController(this.controlPanel, chem);
            this.push(c);
            await c.setControllerAsync(data);
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
    private _pollTimer: NodeJS.Timeout = null;
    public chem: ChemController;
    public orp: NixieChemicalORP;
    public ph: NixieChemicalPh;
    public flowSensor: NixieChemFlowSensor;
    public bodyOnTime: number;
    public flowDetected: boolean = false;
    constructor(ncp: INixieControlPanel, chem: ChemController) {
        super(ncp);
        this.chem = chem;
        this.orp = new NixieChemicalORP(this, chem.orp);
        this.ph = new NixieChemicalPh(this, chem.ph);
        this.flowSensor = new NixieChemFlowSensor(this, chem.flowSensor);
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
    public async manualDoseAsync(data: any) {
        try {
            // Check to see that we are a rem chem.
            let vol = parseInt(data.volume, 10);
            if (isNaN(vol)) return Promise.reject(new InvalidEquipmentDataError(`Volume was not supplied for the manual chem dose`, 'chemController', data.volume));
            // Determine which chemical we are dosing.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            if (typeof this[chemType] === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for the manual chem dose ${data.chemType}`, 'chemController', data.chemType));
            let chem = this.chem[chemType];
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual dose config not found.`, 'chemController', data.chemType));
            let schem = state.chemControllers.getItemById(this.chem.id, true)[chemType];
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual dose state not found.`, 'chemController', data.chemType));
            // Now we can tell the chemical to dose.
            if (chemType === 'ph') await this.ph.manualDoseAsync(schem, vol);
            else if (chemType === 'orp') await this.orp.manualDoseAsync(schem, vol);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async cancelDosingAsync(data: any) {
        try {
            // Determine which chemical we are cancelling.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            if (typeof this[chemType] === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for the manual chem dose ${data.chemType}`, 'chemController', data.chemType));
            let chem = this.chem[chemType];
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not cancel ${data.chemType} dose config not found.`, 'chemController', data.chemType));
            let schem = state.chemControllers.getItemById(this.chem.id, true)[chemType];
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not cancel ${data.chemType} dose state not found.`, 'chemController', data.chemType));
            // Now we can tell the chemical to dose.
            if (chemType === 'ph') await this.ph.cancelDosing(schem);
            else if (chemType === 'orp') await this.orp.cancelDosing(schem);
        }
        catch (err) { return Promise.reject(err); }
    }
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
            let borates = typeof data.borates !== 'undefined' ? parseInt(data.borates, 10) : chem.borates || 0;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            if (isNaN(borates)) return Promise.reject(new InvalidEquipmentDataError(`Invalid borates`, 'chemController', borates));
            let schem = state.chemControllers.getItemById(chem.id, true);
            chem.calciumHardness = calciumHardness;
            chem.cyanuricAcid = cyanuricAcid;
            chem.alkalinity = alkalinity;
            chem.borates = borates;
            chem.body = body;
            schem.name = chem.name = data.name || chem.name || `Chem Controller ${chem.id}`;
            schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.encode('rem');
            schem.isActive = chem.isActive = true;
            if (typeof data.lsiRange !== 'undefined') {
                if (typeof data.lsiRange.enabled !== 'undefined') chem.lsiRange.enabled = utils.makeBool(data.lsiRange.enabled);
                if (typeof data.lsiRange.low === 'number') chem.lsiRange.low = data.lsiRange.low;
                if (typeof data.lsiRange.high === 'number') chem.lsiRange.high = data.lsiRange.high;
            }
            await this.flowSensor.setSensorAsync(data.flowSensor);
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
    public async checkFlow(schem: ChemControllerState): Promise<boolean> {
        try {
            schem.isBodyOn = this.isBodyOn();
            if (!schem.isBodyOn) this.flowDetected = schem.flowDetected = false;
            else if (this.flowSensor.sensor.type === 0) this.flowDetected = schem.flowDetected = true;
            else {
                // Call out to REM to see if we have flow.
                let ret = await this.flowSensor.getState();

                // We should have state from the sensor but we want to keep this somewhat generic.
                //[1, { name: 'switch', desc: 'Flow Switch', remAddress: true }],
                //[2, { name: 'rate', desc: 'Rate Sensor', remAddress: true }],
                //[4, { name: 'pressure', desc: 'Pressure Sensor', remAddress: true }],
                if (this.flowSensor.sensor.type === 1) {
                    // This is a flow switch.  The expectation is that it should be 0 or 1.
                    this.flowDetected = schem.flowDetected = utils.makeBool(ret.obj.state);
                }
                else if (this.flowSensor.sensor.type == 2) {
                    this.flowDetected = schem.flowDetected = ret.obj.state > this.flowSensor.sensor.minimumFlow;
                    schem.flowSensor.state = ret.obj.state;
                }
                else if (this.flowSensor.sensor.type == 4) {
                    this.flowDetected = schem.flowDetected = ret.obj.state > this.flowSensor.sensor.minimumPressure;
                    schem.flowSensor.state = ret.obj.state;
                }
                else 
                    this.flowDetected = schem.flowDetected = false;
                schem.alarms.flowSensorFault = 0;
            }
            if (!schem.flowDetected) this.bodyOnTime = undefined;
            else if (typeof this.bodyOnTime === 'undefined') this.bodyOnTime = new Date().getTime();
            return schem.flowDetected;
        }
        catch (err) { schem.alarms.flowSensorFault = 7; return this.flowDetected = schem.flowDetected = false; }
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
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
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
                await this.checkFlow(schem);
                await this.validateSetup(this.chem, schem);
                if (this.chem.ph.enabled) await this.ph.probe.setTempCompensation(schem.ph.probe);
                // We are not processing Homegrown at this point.
                // Check each piece of equipment to make sure it is doing its thing.
                this.calculateSaturationIndex();
                await this.processAlarms(schem);
                if (this.chem.ph.enabled) await this.ph.checkDosing(this.chem, schem.ph);
                if (this.chem.orp.enabled) await this.orp.checkDosing(this.chem, schem.orp);
            }
        }
        catch (err) { logger.error(`Error polling Chem Controller`); }
        finally { this._pollTimer = setTimeout(() => this.pollEquipment(), this.pollingInterval || 10000); }
    }
    public async processAlarms(schem: ChemControllerState) {
        try {
            // Calculate all the alarms.  These are only informational at this point.
            if (!schem.isBodyOn) schem.alarms.flow = 0;
            else schem.alarms.flow = schem.flowDetected ? 0 : 1;
            schem.ph.dailyVolumeDosed = this.ph.calcTotalDosed(24, true);
            schem.orp.dailyVolumeDosed = this.orp.calcTotalDosed(24, true);
            let chem = this.chem;
            schem.orp.enabled = this.chem.orp.enabled;
            schem.ph.enabled = this.chem.ph.enabled;
            if (this.chem.orp.enabled) {
                let useChlorinator = chem.orp.useChlorinator;
                let pumpType = chem.orp.pump.type;
                let probeType = chem.orp.probe.type;
                let currLevelPercent = schem.orp.tank.level / schem.orp.tank.capacity * 100;
                schem.alarms.orpTank = !useChlorinator && pumpType !== 0 && schem.orp.tank.alarmEmptyEnabled && currLevelPercent <= schem.orp.tank.alarmEmptyLevel ? 64 : 0;
                if (this.chem.orp.maxDailyVolume < schem.orp.dailyVolumeDosed) {
                    schem.warnings.orpDailyLimitReached = 4;
                    schem.orp.dailyLimitReached = true;
                }
                else {
                    schem.warnings.orpDailyLimitReached = 0;
                    schem.orp.dailyLimitReached = false;
                }
                if (schem.flowDetected) {
                    if (probeType !== 0 && chem.orp.tolerance.enabled)
                        schem.alarms.orp = schem.orp.level < chem.orp.tolerance.low ? 16 : schem.orp.level > chem.orp.tolerance.high ? 8 : 0;
                    else schem.alarms.orp = 0;
                    schem.warnings.chlorinatorCommError = useChlorinator && state.chlorinators.getItemById(1).status & 0xF0 ? 16 : 0;
                    schem.warnings.pHLockout = useChlorinator === false && probeType !== 0 && pumpType !== 0 && schem.ph.level >= chem.orp.phLockout ? 1 : 0;
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
                schem.alarms.orp = 0;
            }
            if (this.chem.ph.enabled) {
                let pumpType = chem.ph.pump.type;
                let probeType = chem.ph.probe.type;
                let currLevelPercent = schem.ph.tank.level / schem.ph.tank.capacity * 100;
                schem.alarms.pHTank = pumpType !== 0 && schem.ph.tank.alarmEmptyEnabled && currLevelPercent <= schem.ph.tank.alarmEmptyLevel ? 32 : 0;
                schem.warnings.pHDailyLimitReached = 0;
                if (this.chem.ph.maxDailyVolume < schem.ph.dailyVolumeDosed) {
                    schem.warnings.pHDailyLimitReached = 2;
                    schem.ph.dailyLimitReached = true;
                }
                else {
                    schem.warnings.pHDailyLimitReached = 0;
                    schem.ph.dailyLimitReached = false;
                }
                if (schem.flowDetected) {
                    if (probeType !== 0 && chem.ph.tolerance.enabled) {
                        schem.alarms.pH = schem.ph.level < chem.ph.tolerance.low ? 4 : schem.ph.level > chem.ph.tolerance.high ? 2 : 0;
                    }
                    else schem.alarms.pH = 0;
                }
                else schem.alarms.pH = 0;
            }
            if (chem.lsiRange.enabled) {
                schem.warnings.waterChemistry = schem.saturationIndex < chem.lsiRange.low ? 1 : schem.saturationIndex > chem.lsiRange.high ? 2 : 0;
            }
        } catch (err) { logger.error(`Error processing chem controller ${this.chem.name} alarms: ${err.message}`); return Promise.reject(err); }
    }
    private async checkHardwareStatus(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { return { hasFault: true } }
    }
    public async validateSetup(chem: ChemController, schem: ChemControllerState) {
        try {
            // The validation will be different if the body is on or not.  So lets get that information.
            if (chem.orp.enabled) {
                if (chem.orp.probe.type !== 0) {
                    let type = sys.board.valueMaps.chemORPProbeTypes.transform(chem.orp.probe.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatus(chem.orp.probe.connectionId, chem.orp.probe.deviceBinding);
                        schem.alarms.orpProbeFault = dev.hasFault ? 3 : 0;
                    }
                    else schem.alarms.orpProbeFault = 0;
                }
                else schem.alarms.orpPumpFault = 0;
                if (chem.orp.useChlorinator) {
                    let chlors = sys.chlorinators.getByBody(chem.body);
                    schem.alarms.chlorFault = chlors.length === 0 ? 5 : 0;
                    schem.alarms.orpPumpFault = 0;
                }
                else if (chem.orp.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.orp.pump.type);
                    schem.alarms.chlorFault = 0;
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatus(chem.orp.pump.connectionId, chem.orp.pump.deviceBinding);
                        schem.alarms.orpPumpFault = dev.hasFault ? 4 : 0;
                    }
                    else schem.alarms.orpPumpFault = 0;
                }
                else
                    schem.alarms.orpPumpFault = schem.alarms.chlorFault = 0;
            }
            else schem.alarms.orpPumpFault = schem.alarms.chlorFault = schem.alarms.orpProbeFault = 0;
            if (chem.ph.enabled) {
                if (chem.ph.probe.type !== 0) {
                    let type = sys.board.valueMaps.chemPhProbeTypes.transform(chem.ph.probe.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatus(chem.ph.probe.connectionId, chem.ph.probe.deviceBinding);
                        schem.alarms.pHProbeFault = dev.hasFault ? 1 : 0;
                    }
                    else schem.alarms.pHProbeFault = 0;
                }
                else schem.alarms.pHProbeFault = 0;
                if (chem.ph.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.ph.probe.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatus(chem.ph.pump.connectionId, chem.ph.pump.deviceBinding);
                        schem.alarms.pHPumpFault = dev.hasFault ? 2 : 0;
                    }
                    else schem.alarms.pHPumpFault = 0;
                }
                else schem.alarms.pHPumpFault = 0;
            }
            else schem.alarms.pHPumpFault = schem.alarms.pHProbeFault = 0;
            if (!chem.isActive) {
                // We need to shut down the pumps.
            }
            else {
                let totalGallons = 0;
                if (chem.body === 0 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
                if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;
                schem.alarms.bodyFault = (isNaN(totalGallons) || totalGallons === 0) ? 6 : 0;
            }
            schem.alarms.comms = 0;
        } catch (err) { logger.error(`Error checking Chem Controller Hardware ${this.chem.name}: ${err.message}`); schem.alarms.comms = 2; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let schem = state.chemControllers.getItemById(this.chem.id);
            await this.ph.cancelDosing(schem.ph);
            await this.orp.cancelDosing(schem.orp);
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
        // Check the flow sensor
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
    public chemType: string;
    public currentMix: NixieChemMix;
    public doseHistory: NixieChemDoseLog[] = [];
    protected _mixTimer: NodeJS.Timeout;
    public get logFilename() { return `chemDosage_unknown.log`; }
    public get chemController(): NixieChemController { return this.getParent() as NixieChemController; }
    constructor(controller: NixieChemController, chemical: Chemical) {
        super(controller);
        chemical.master = 1;
        this.chemical = chemical;
        this.pump = new NixieChemPump(this, chemical.pump);
        this.tank = new NixieChemTank(this, chemical.tank);
        // Load up the dose history so we can do our 24 hour thingy.
        (async () => {
            let lines = await this.chemController.controlPanel.readLogFile(this.logFilename);
            let dt = new Date().getTime();
            let total = 0;
            for (let i = 0; i < lines.length; i++) {
                try {
                    //console.log(lines[i]);
                    let log = NixieChemDoseLog.fromLog(lines[i]);
                    if (dt - 86400000 < log.end.getTime()) {
                        this.doseHistory.push(log);
                    }
                    else break;
                } catch (err) { }
            }
        })();

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
                chemical.maxDailyVolume = typeof data.maxDailyVolume !== 'undefined' ? parseInt(data.maxDailyVolume, 10) : chemical.maxDailyVolume;
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
                chemical.flowOnlyMixing = typeof data.flowOnlyMixing !== 'undefined' ? utils.makeBool(data.flowOnlyMixing) : chemical.flowOnlyMixing;
            }
        } catch (err) { return Promise.reject(err); }
    }
    protected async stopMixing(schem: ChemicalState) {
        try {
            let chem = this.chemController.chem;
            schem.pump.isDosing = false;
            if (typeof this._mixTimer !== 'undefined') {
                clearTimeout(this._mixTimer);
                this._mixTimer = undefined;
            }
            schem.mixTimeRemaining = 0;
            this.currentMix = undefined;
        } catch (err) { logger.error(`Error stopping chemical mix`); }
    }
    public async mixChemicals(schem: ChemicalState) {
        try {
            let chem = this.chemController.chem;
            let flowDetected = this.chemController.flowDetected;
            schem.pump.isDosing = false;
            if (typeof this._mixTimer !== 'undefined') {
                clearTimeout(this._mixTimer);
                this._mixTimer = undefined;
            }
            let dt = new Date().getTime();
            if (typeof this.currentMix === 'undefined') {
                this.currentMix = new NixieChemMix();
                if (schem.mixTimeRemaining > 0)
                    this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: Math.max(0, this.chemical.mixingTime - schem.mixTimeRemaining) });
                else
                    this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: 0 });
                logger.info(`Chem Controller begin mixing ${schem.chemType} for ${utils.formatDuration(this.currentMix.timeRemaining)} of ${utils.formatDuration(this.chemical.mixingTime)}`)
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('mixing');
                this.currentMix.lastChecked = dt;
            }
            if (flowDetected || !this.chemical.flowOnlyMixing) {
                this.currentMix.timeMixed += Math.round((dt - this.currentMix.lastChecked) / 1000);
                // Reflect any changes to the configuration.
                this.currentMix.time = this.chemical.mixingTime;
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
                logger.verbose(`Chem mixing ${schem.chemType} remaining: ${utils.formatDuration(schem.mixTimeRemaining)}`);
            }
            else {
                logger.verbose(`Chem mixing paused because body is not on.`);
            }
            this.currentMix.lastChecked = dt;
            if (schem.mixTimeRemaining === 0) {
                logger.info(`Chem Controller ${schem.chemType} mixing Complete after ${utils.formatDuration(this.currentMix.timeMixed)}`)
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('monitoring');
                this.currentMix = undefined;
            }
            else { schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('mixing'); }
            schem.chemController.emitEquipmentChange();
        } catch (err) { logger.error(`Error mixing chemicals.`) }
        finally { if (schem.mixTimeRemaining > 0) this._mixTimer = setTimeout(() => { this.mixChemicals(schem); }, 1000); }
    }
    public async initDose(dosage: NixieChemDose) { }
    public async closeAsync() {
        try {
            if (typeof this._mixTimer !== 'undefined') clearTimeout(this._mixTimer);
            this._mixTimer = undefined;
            await super.closeAsync();
        }
        catch (err) { logger.error(err); }
    }
    public async cancelDosing(schem: ChemicalState) {
        try {
            // Just stop the pump for now but we will do some logging later.
            await this.pump.stopDosing(schem);
            if (schem.dosingStatus === 0)
                await this.mixChemicals(schem);
        } catch (err) { return Promise.reject(err); }
    }
    public calcTotalDosed(hours: number, trim: boolean = false): number {
        let total = 0;
        let dt = new Date().getTime() - (hours * 3600000);
        for (let i = this.doseHistory.length - 1; i > 0; i--) {
            let log = this.doseHistory[i];
            if (log.end.getTime() > dt) {
                // TODO: calculate out a partial timeslot.
                total += log.volumeDosed;
            }
            else if (trim) {
                this.doseHistory.splice(i, 1);
            }
        }
        if (typeof this.currentDose !== 'undefined' && this.currentDose.volumeRemaining !== 0) {
            total += this.currentDose.volumeDosed;
        }
        return total;
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
                stank.alarmEmptyEnabled = this.tank.alarmEmptyEnabled = typeof data.alarmEmptyEnabled !== 'undefined' ? data.alarmEmptyEnabled : stank.alarmEmptyEnabled;
                stank.alarmEmptyLevel = this.tank.alarmEmptyLevel = typeof data.alarmEmptyLevel !== 'undefined' ? data.alarmEmptyLevel : stank.alarmEmptyLevel;
            }
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemDoseLog {
    public id: number;
    public method: string;
    public chem: string;
    public start: Date;
    public end: Date;
    public demand: number;
    public level: number;
    public volume: number;
    public volumeDosed: number;
    public timeDosed: number;
    public parse(line: string) {
        let obj = JSON.parse(line);
        this.id = parseInt(obj.id, 10);
        this.method = obj.method;
        this.chem = obj.chem;
        this.start = new Date(obj.start);
        this.end = new Date(obj.end);
        this.demand = parseInt(obj.demand, 10);
        this.level = parseFloat(obj.level);
        this.volume = parseInt(obj.volume, 10);
        this.volumeDosed = parseFloat(obj.volumeDosed);
        this.timeDosed = utils.parseDuration(obj.timeDosed) * 1000; // Time dosed is in ms.
    }
    public toLog() {
        return `{"id":${this.id},"method":"${this.method}","chem":"${this.chem}","start":"${Timestamp.toISOLocal(this.start)}","end":"${Timestamp.toISOLocal(this.end)}","demand":${this.demand},"level": ${this.level},"volume": ${this.volume},"volumeDosed":${this.volumeDosed},"timeDosed":"${utils.formatDuration(this.timeDosed/1000)}"}`;
    }
    public static fromDose(dose: NixieChemDose): NixieChemDoseLog {
        let log = new NixieChemDoseLog();
        log.id = dose.schem.chemController.id;
        log.method = dose.isManual ? 'manual' : 'auto';
        log.chem = dose.schem.chemType;
        log.start = new Date(dose.startDate);
        log.end = new Date();
        log.level = dose.level;
        log.demand = dose.demand;
        log.volume = dose.volume;
        log.volumeDosed = dose.volumeDosed;
        log.timeDosed = dose.timeDosed;
        return log;
    }
    public static fromLog(line: string) {
        let log = new NixieChemDoseLog();
        log.parse(line);
        return log;
    }
}
export class NixieChemDose {
    constructor(dt: Date) { this.startDate = new Date(); }
    public method: string;
    public startDate: Date;
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
    public isManual: boolean = false;
    public get timeRemaining(): number { return Math.floor(Math.max(0, this.time - (this.timeDosed / 1000))); }
    public get volumeRemaining(): number { return Math.max(0, this.volume - this.volumeDosed); }
    public log(chem: NixieChemical) {
        if (typeof chem !== 'undefined' && typeof chem.chemController !== 'undefined' && typeof this.schem !== 'undefined') {
            let log = NixieChemDoseLog.fromDose(this);
            chem.chemController.logData(`chemDosage_${this.schem.chemType}.log`, log.toLog());
                //`{"id":${chem.chemController.chem.id},"method":"${this.isManual ? 'manual' : 'auto'}","chem":"${this.schem.chemType}",start":${Timestamp.toISOLocal(this.startDate)},"end":"${Timestamp.toISOLocal(new Date())}","demand":${this.demand},"level": ${this.level},"volume": ${this.volume},"volumeDosed": ${this.volumeDosed},"timeDosed": "${utils.formatDuration(this.timeDosed / 1000)}"}`);
            chem.doseHistory.unshift(log);
        }
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
        if (typeof obj.isManual !== 'undefined') this.isManual = utils.makeBool(obj.isManual);
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
    public async stopDosing(schem: ChemicalState) {
        try {
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
                if (typeof this.chemical.currentDose !== 'undefined') {
                    this.chemical.currentDose.log(this.chemical);
                    this.chemical.currentDose.schem.manualDosing = false;
                    this.chemical.currentDose.schem.dosingTimeRemaining = 0;
                    this.chemical.currentDose.schem.dosingVolumeRemaining = 0;
                    this.chemical.currentDose.schem.volumeDosed = 0;
                }
                this.chemical.currentDose = undefined;
            }
            if (this.pump.type !== 0) await this.turnOff(schem);
        } catch (err) { return Promise.reject(err); }
    }
    public async dose(dosage: NixieChemDose) {
        try {
            let scontroller = dosage.schem.chemController;
            if (this._dosingTimer) clearTimeout(this._dosingTimer);
            let type = sys.board.valueMaps.chemPumpTypes.getName(this.pump.type);
            if (type === 'none') {
                // We aren't going to do anything.
                logger.verbose(`Chem pump dose ignore pump ${type}`);
            }
            else if (type === 'relay') {
                // We are a relay pump so we need to turn on the pump for a timed interval
                // then check it on each iteration.  If the pump does not receive a request
                // from us then the relay will turn off.
                this.chemical.chemController.processAlarms(dosage.schem.chemController);
                let isBodyOn = scontroller.flowDetected;
                await this.chemical.initDose(dosage);
                let delay = 0;
                // Check to see if we are in delay.  The start delay for the configuration is in minutes.
                if (isBodyOn) {
                    // The remaining delay = delay time - (current time - on time).
                    let timeElapsed = new Date().getTime() - this.chemical.chemController.bodyOnTime;
                    delay = Math.max(0, ((this.chemical.chemical.startDelay * 60) * 1000) - timeElapsed);
                    dosage.schem.delayTimeRemaining = Math.max(0, Math.round(delay/1000));
                    if (delay > 0) {
                        if (!dosage.schem.flowDelay) logger.info(`Chem Controller delay dosing for ${utils.formatDuration(delay / 1000)}`)
                        else logger.verbose(`Chem pump delay dosing for ${utils.formatDuration(delay / 1000)}`);
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
                    logger.verbose(`Chem pump flow not detected. Body is not running.`);
                    // We originally thought that we could wait to turn the dosing on but instead we will cancel the dose.  This will allow
                    // the chlorinator to work more smoothly.
                    await this.chemical.cancelDosing(dosage.schem);
                }
                else if (dosage.schem.tank.level <= 0) {
                    logger.verbose(`Chem tank ran dry with ${dosage.volumeRemaining}mL remaining`);
                    await this.chemical.cancelDosing(dosage.schem);
                }
                else if (dosage.timeRemaining <= 0 || dosage.volumeRemaining <= 0) {
                    logger.verbose(`Dose completed ${dosage.volumeDosed}mL`);
                    await this.chemical.cancelDosing(dosage.schem);
                }
                else if (dosage.timeRemaining > 0 && dosage.volumeRemaining > 0) { // We are actually dosing here
                    if (delay <= 0) {
                        logger.verbose(`Sending command to activate chem pump...`);
                        let res = await this.turnOn(dosage.schem, 3000);
                        if (typeof res.status === 'undefined' || res.status.code !== 200) {
                            let status = res.status || { code: res.status.code, message: res.status.message };
                            logger.error(`Chem pump could not activate relay ${status.code}: ${status.message}`);
                        }
                        let relay = res.obj;
                        try {
                            logger.verbose(`Chem pump response ${JSON.stringify(relay)}`);
                        } catch (err) { logger.error(`Invalid chem pump response`); }
                        if (typeof dosage.lastLatchTime !== 'undefined') {
                            let time = new Date().getTime() - dosage.lastLatchTime;
                            // Run our math out to 7 sig figs to keep in the ballpark for very slow pumps.
                            let vol = Math.round((this.pump.ratedFlow * (time / 1000) / 60) * 1000000) / 1000000;
                            dosage.timeDosed += time;
                            dosage.volumeDosed += vol;
                            dosage.schem.volumeDosed = dosage.volumeDosed;
                            if (dosage.schem.tank.units > 0) {
                                let lvl = dosage.schem.tank.level - utils.convert.volume.convertUnits(vol, 'mL', sys.board.valueMaps.volumeUnits.getName(dosage.schem.tank.units));
                                dosage.schem.tank.level = Math.max(0, lvl);
                            }
                        }
                        logger.info(`Chem Controller dosed ${dosage.volumeDosed.toFixed(2)}mL of ${dosage.volume}mL ${utils.formatDuration(dosage.timeRemaining)} remaining`);
                        dosage.lastLatchTime = new Date().getTime();
                        dosage.schem.pump.isDosing = this.isOn = relay.state;
                    }
                    else { await this.turnOff(dosage.schem); }
                    // Set the volume and time remaining to the second and 4 sig figs.
                    dosage.schem.dosingVolumeRemaining = dosage.volumeRemaining;
                    // Time dosed is in ms.  This is to accommodate the slow pumps.
                    dosage.schem.dosingTimeRemaining = dosage.timeRemaining;
                    dosage.schem.dosingStatus = 0;
                }
                else 
                    await this.chemical.cancelDosing(dosage.schem);
            }
            else if (type === 'ezo-pmp') {
                logger.info(`Attempting to dose ezo pump`);
                await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: true, latch: 5000 });
            }
            // Check to see if we reached our max dosing time or volume or the tank is empty mix it up.
            let status = dosage.schem.dosingStatus;
            if (status === 0) {
                if (dosage.maxTime < (dosage.timeDosed / 1000) || dosage.maxVolume < dosage.volumeDosed || dosage.schem.tank.level <= 0) {
                    await this.chemical.cancelDosing(dosage.schem);
                }
            }
            //dosage.schem.dosingStatus = status;
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
                    try { await this.dose(dosage);  }
                    catch (err) { logger.error(err); }
                }, 1000);
            }
            else if (dosage.schem.dosingStatus === 2) {
                // Tell whichever chemical we are dealing with to begin mixing.
                if (typeof this.chemical.currentDose !== 'undefined') this.chemical.currentDose.log(this.chemical);
                this.chemical.currentDose = undefined;
                dosage.schem.pump.isDosing = this.isOn = false;
                dosage.schem.manualDosing = false;
                //await this.chemical.mixChemicals(dosage.schem);
            }
            else if (dosage.schem.dosingStatus === 1) {
                if (typeof this.chemical.currentDose !== 'undefined') this.chemical.currentDose.log(this.chemical);
                this.chemical.currentDose = undefined;
                dosage.schem.pump.isDosing = this.isOn = false;
                dosage.schem.manualDosing = false;
            }
        }
    }
    public async turnOff(schem: ChemicalState): Promise<InterfaceServerResponse> {
        try {
            // We need to be turning this pig off.  If the REM service has been interrupted
            // then we will assume that the relay is off since any request to turn it on will be based upon
            // the idea that the socket remains open.  If it fails then it will have gone off.  If we are talking
            // about an EZO pump all the values are maintained anyway through the state settings.
            let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
            this.isOn = schem.pump.isDosing = false;
            return res;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async turnOn(schem: ChemicalState, latchTimeout?: number): Promise<InterfaceServerResponse> {
        try {
            let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, typeof latchTimeout !== 'undefined' ? { isOn: true, latch: latchTimeout } : { isOn: true });
            this.isOn = schem.pump.isDosing = false;
            return res;
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemicalPh extends NixieChemical {
    public get ph(): ChemicalPh { return this.chemical as ChemicalPh; }
    public probe: NixieChemProbePh;
    public mixStart: Date;
    public doseStart: Date;
    public get logFilename() { return `chemDosage_${(this.chemical as ChemicalPh).phSupply === 1 ? 'acid' : 'base'}.log`;  }
    constructor(controller: NixieChemController, chemical: ChemicalPh) {
        super(controller, chemical);
        this.chemType = 'acid';
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
                this.ph.setpoint = sph.setpoint = typeof data.setpoint !== 'undefined' ? parseFloat(data.setpoint) : this.ph.setpoint;
                this.ph.phSupply = typeof data.phSupply !== 'undefined' ? data.phSupply : this.ph.phSupply;
                this.ph.acidType = typeof data.acidType !== 'undefined' ? data.acidType : this.ph.acidType;
                this.ph.flowReadingsOnly = typeof data.flowReadingsOnly !== 'undefined' ? utils.makeBool(data.flowReadingsOnly) : this.ph.flowReadingsOnly;
                sph.level = typeof data.level !== 'undefined' && !isNaN(parseFloat(data.level)) ? parseFloat(data.level) : sph.level;
                if (typeof data.tolerance !== 'undefined') {
                    if (typeof data.tolerance.enabled !== 'undefined') this.ph.tolerance.enabled = utils.makeBool(data.tolerance.enabled);
                    if (typeof data.tolerance.low === 'number') this.ph.tolerance.low = data.tolerance.low;
                    if (typeof data.tolerance.high === 'number') this.ph.tolerance.high = data.tolerance.high;
                }
                if (typeof data.dosePriority !== 'undefined') {
                    let b = utils.makeBool(data.dosePriority);
                    if (this.ph.dosePriority !== b) {
                        // We may need to re-enable the chlorinator.
                        let chlors = sys.chlorinators.getByBody(this.chemController.chem.body);
                        if (!b) {
                            for (let i = 0; i < chlors.length; i++) {
                                let chlor = chlors.getItemByIndex(i);
                                if (chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: false });
                            }
                        }
                        else if (sph.pump.isDosing) {
                            // The pH is currently dosing so we need to disable the chlorinator.
                            let sorp = sph.chemController.orp;
                            for (let i = 0; i < chlors.length; i++) {
                                let chlor = chlors.getItemByIndex(i);
                                if (!chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                            }
                            // If we are currently dosing ORP then we need to stop that because pH is currently dosing.
                            if (sorp.pump.isDosing) await this.chemController.orp.cancelDosing(sorp);
                        }
                        this.ph.dosePriority = b;
                    }
                    
                }
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public calcDemand(sph: ChemicalPhState): number {
        let chem = this.chemController.chem;
        // Calculate how many mL are required to raise to our pH level.
        // 1. Get the total gallons of water that the chem controller is in
        // control of.
        let totalGallons = 0;
        if (chem.body === 0 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
        if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
        if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
        if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;
        logger.verbose(`Chem begin calculating demand: ${sph.level} setpoint: ${this.ph.setpoint} body: ${totalGallons}`);
        let chg = this.ph.setpoint - sph.level;
        let delta = chg * totalGallons;
        let temp = (sph.level + this.ph.setpoint) / 2;
        let adj = (192.1626 + -60.1221 * temp + 6.0752 * temp * temp + -0.1943 * temp * temp * temp) * (chem.alkalinity + 13.91) / 114.6;
        let extra = (-5.476259 + 2.414292 * temp + -0.355882 * temp * temp + 0.01755 * temp * temp * temp) * (chem.borates || 0);
        extra *= delta;
        delta *= adj;
        let dose = 0;
        if (this.ph.phSupply === 0) {  // We are dispensing base so we need to calculate the demand here.
            if (chg > 0) {

            }
        }
        else {
            if (chg < 0) {
                let at = sys.board.valueMaps.acidTypes.transform(this.ph.acidType);
                dose = Math.round(utils.convert.volume.convertUnits((delta / -240.15 * at.dosingFactor) + (extra / -240.15 * at.dosingFactor), 'oz', 'mL'));
            }
        }
        sph.demand = dose;
        return dose;
    }
    public async checkDosing(chem: ChemController, sph: ChemicalPhState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            let demand = this.calcDemand(sph);
            if (sph.suspendDosing) {
                // Kill off the dosing and make sure the pump isn't running.  Let's force the issue here.
                await this.cancelDosing(sph);
                return;
            }
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentDose = undefined;
                this.currentMix = undefined;
                sph.manualDosing = false;
                sph.mixTimeRemaining = 0;
                sph.dosingVolumeRemaining = 0;
                sph.dosingTimeRemaining = 0;
                await this.stopMixing(sph);
                await this.cancelDosing(sph);
            }
            if (status === 'mixing') {
                await this.cancelDosing(sph);
                await this.mixChemicals(sph);
            }
            else if (sph.manualDosing) {
                // We are manually dosing.  We are not going to dynamically change the dose.
                let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose(new Date()) : this.currentDose;
                if (typeof this.currentDose === 'undefined') {
                    // This will only happen when njspc is killed in the middle of a dose.
                    let dose = sph.dosingVolumeRemaining;
                    let time = sph.dosingTimeRemaining;
                    dosage.set({
                        schem: sph, method: sys.board.valueMaps.chemDosingMethods.transformByName('volume'), setpoint: this.ph.setpoint, level: sph.level,
                        volume: dose, time: time, maxVolume: dose, maxTime: time, isManual: true
                    });
                    // For a manual dose we will pick up where we left off.
                    this.currentDose = dosage;
                    dosage.demand = demand;
                }
                if (sph.tank.level > 0) {
                    logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                    await this.stopMixing(sph);
                    await this.pump.dose(dosage);
                }
                else await this.cancelDosing(sph);
            }
            else if (sph.dailyLimitReached) {
                await this.cancelDosing(sph);
            }
            else if (status === 'monitoring' || status === 'dosing') {
                // Figure out what mode we are in and what mode we should be in.
                //sph.level = 7.61;
                // Check the setpoint and the current level to see if we need to dose.
                if (demand > 0) {
                    let pump = this.pump.pump;
                    let dose = Math.max(0, Math.min(this.chemical.maxDailyVolume - sph.dailyVolumeDosed, demand));
                    let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                    let meth = sys.board.valueMaps.chemDosingMethods.getName(this.ph.dosingMethod);
                    logger.info(`Chem acid demand calculated ${demand}mL for ${utils.formatDuration(time)} Tank Level: ${sph.tank.level}`);
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
                    logger.verbose(`Chem acid dosing maximums applied ${dose}mL for ${utils.formatDuration(time)}`);
                    let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose(new Date()) : this.currentDose;
                    dosage.set({ schem: sph, method: meth, setpoint: this.ph.setpoint, level: sph.level, volume: dose, time: time, maxVolume: Math.max(meth.indexOf('vol') !== -1 ? this.ph.maxDosingVolume : dose), maxTime: time });
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
                        logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                        await this.pump.dose(dosage);
                        this.currentDose = dosage;
                    }
                    else await this.cancelDosing(sph);
                }
                //if (sph.level !== this.ph.setpoint) {
                //    // Calculate how many mL are required to raise to our pH level.
                //    // 1. Get the total gallons of water that the chem controller is in
                //    // control of.
                //    let totalGallons = 0;
                //    if (chem.body === 0 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                //    if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                //    if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
                //    if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;
                //    logger.verbose(`Chem begin calculating dose current: ${sph.level} setpoint: ${this.ph.setpoint} body: ${totalGallons}`);
                //    //let pv = utils.convert.volume.convertUnits(totalGallons, 'gal', 'L');
                //    let chg = this.ph.setpoint - sph.level;
                //    let delta = chg * totalGallons;
                //    let temp = (sph.level + this.ph.setpoint) / 2;
                //    let adj = (192.1626 + -60.1221 * temp + 6.0752 * temp * temp + -0.1943 * temp * temp * temp) * (chem.alkalinity + 13.91) / 114.6;
                //    let extra = (-5.476259 + 2.414292 * temp + -0.355882 * temp * temp + 0.01755 * temp * temp * temp) * (chem.borates || 0);
                //    extra *= delta;
                //    delta *= adj;
                //    if (sys.board.valueMaps.phSupplyTypes.getName(this.ph.phSupply) === 'base') {
                //        if (chg > 0) {


                //        }
                //    }
                //    else {
                //        if (chg < 0) {
                //            let at = sys.board.valueMaps.acidTypes.transform(this.ph.acidType);
                //            let pump = this.pump.pump;
                //            let demand = dose = Math.round(utils.convert.volume.convertUnits((delta / -240.15 * at.dosingFactor) + (extra / -240.15 * at.dosingFactor), 'oz', 'mL'));
                //            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0: Math.round(dose / (pump.ratedFlow / 60));
                //            let meth = sys.board.valueMaps.chemDosingMethods.getName(this.ph.dosingMethod);
                //            logger.verbose(`Chem acid demand calculated ${demand}mL for ${utils.formatDuration(time)} Tank Level: ${sph.tank.level}`);
                //            // Now that we know our acid demand we need to adjust this dose based upon the limits provided in the setup.
                //            switch (meth) {
                //                case 'time':
                //                    if (time > this.ph.maxDosingTime) {
                //                        time = this.ph.maxDosingTime;
                //                        dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                //                    }
                //                    break;
                //                case 'volume':
                //                    if (dose > this.ph.maxDosingVolume) {
                //                        dose = this.ph.maxDosingVolume;
                //                        time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                //                    }
                //                    break;
                //                case 'volumeTime':
                //                default:
                //                    // This is maybe a bit dumb as the volume and time should equal out for the rated flow.  In other words
                //                    // you will never get to the volume limit if the rated flow can't keep up to the time.
                //                    if (dose > this.ph.maxDosingVolume) {
                //                        dose = this.ph.maxDosingVolume;
                //                        time = time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                //                    }
                //                    if (time > this.ph.maxDosingTime) {
                //                        time = this.ph.maxDosingTime;
                //                        dose = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                //                    }
                //                    break;
                //            }
                //            logger.verbose(`Chem acid dosing maximums applied ${dose}mL for ${utils.formatDuration(time)}`);
                //            let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose() : this.currentDose;
                //            dosage.set({ startDate: new Date(), schem: sph, method: meth, setpoint: this.ph.setpoint, level: sph.level, volume: dose, time: time, maxVolume: Math.max(meth.indexOf('vol') !== -1 ? this.ph.maxDosingVolume : dose), maxTime: time });
                //            sph.doseTime = dosage.time;
                //            sph.doseVolume = dosage.volume;
                //            if (typeof this.currentDose === 'undefined') {
                //                // We will include this with the dose demand because our limits may reduce it.
                //                dosage.demand = demand;
                //                if (sph.dosingStatus === 0) { // 0 is dosing.
                //                    // We need to finish off a dose that was interrupted by regular programming.  This occurs
                //                    // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                //                    // mixing before we will never get here.
                //                    dosage.timeDosed = (dosage.time - (dosage.time - sph.dosingTimeRemaining)) * 1000;
                //                    dosage.volumeDosed = dosage.volume - (dosage.volume - sph.dosingVolumeRemaining);
                //                } 
                //            }
                //            // Now let's determine what we need to do with our pump to satisfy our acid demand.
                //            if (sph.tank.level > 0) {
                //                logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                //                await this.pump.dose(dosage);
                //                this.currentDose = dosage;
                //            }
                //            else await this.cancelDosing(sph);
                //        }
                //        else {
                //            await this.cancelDosing(sph);
                //        }
                //    }
                //}
            }
        }
        catch (err) { logger.error(err); }
    }
    public async cancelDosing(sph: ChemicalPhState) {
        try {
            // Just stop the pump for now but we will do some logging later.
            await this.pump.stopDosing(sph);
            if (sph.dosingStatus === 0) {
                await this.mixChemicals(sph);
                // Set the setpoints back to the original.
                if (this.ph.dosePriority) {
                    let chlors = sys.chlorinators.getByBody(this.chemController.chem.body);
                    for (let i = 0; i < chlors.length; i++) {
                        let chlor = chlors.getItemByIndex(i);
                        if (chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: false });
                    }
                }
            }
            sph.dosingTimeRemaining = 0;
            sph.dosingVolumeRemaining = 0;
            sph.manualDosing = false;
        } catch (err) { return Promise.reject(err); }
    }
    public async manualDoseAsync(sph: ChemicalPhState, volume: number) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof this.currentDose !== 'undefined') await this.cancelDosing(sph);
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(sph);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sph);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sph);
            }
            let pump = this.pump.pump;
            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(volume / (pump.ratedFlow / 60));
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose current: ${sph.level} setpoint: ${this.ph.setpoint} volume:${volume}`);
            let dosage: NixieChemDose = new NixieChemDose(new Date());
            let meth = sys.board.valueMaps.chemDosingMethods.getName(this.ph.dosingMethod);
            dosage.set({ startDate: new Date(), isManual: true, schem: sph, demand: 0, method: meth, setpoint: this.ph.setpoint, level: sph.level, volume: volume, time: time, maxVolume: volume, maxTime: time });
            dosage.demand = this.calcDemand(sph);
            sph.doseTime = dosage.time;
            sph.doseVolume = dosage.volume;
            sph.manualDosing = true;
            if (sph.tank.level > 0) {
                logger.verbose(`Chem acid manual dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                this.currentDose = dosage;
                await this.pump.dose(dosage);
            }
        }
        catch (err) { logger.error(err); }
    }
    public async initDose(dosage: NixieChemDose) {
        try {
            // We need to do a couple of things here.  First we should disable the chlorinator.
            if (this.ph.dosePriority) {
                let chlors = sys.chlorinators.getByBody(this.chemController.chem.body);
                for (let i = 0; i < chlors.length; i++) {
                    let chlor = chlors.getItemByIndex(i);
                    if (!chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                }
                // Now we need to stop dosing on orp but I don't want to hold on to the state object so get it from weak references.
                let schem = state.chemControllers.getItemById(this.chemController.id, false);
                if (schem.orp.pump.isDosing) await this.chemController.orp.cancelDosing(schem.orp);
            }
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class NixieChemicalORP extends NixieChemical {
    public orp: ChemicalORP;
    public probe: NixieChemProbeORP;
    constructor(controller: NixieChemController, chemical: ChemicalORP) {
        super(controller, chemical);
        this.chemType = 'orp';
        this.orp = chemical;
        this.probe = new NixieChemProbeORP(this, chemical.probe);
    }
    public get logFilename() { return `chemDosage_orp.log`; }
    public async setORPAsync(sorp: ChemicalORPState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                this.orp.useChlorinator = typeof data.useChlorinator !== 'undefined' ? utils.makeBool(data.useChlorinator) : this.orp.useChlorinator;
                sorp.enabled = this.orp.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : this.orp.enabled;
                sorp.level = typeof data.level !== 'undefined' && !isNaN(parseFloat(data.level)) ? parseFloat(data.level) : sorp.level;
                this.orp.phLockout = typeof data.phLockout !== 'undefined' && !isNaN(parseFloat(data.phLockout)) ? parseFloat(data.phLockout) : this.orp.phLockout;
                this.orp.flowReadingsOnly = typeof data.flowReadingsOnly !== 'undefined' ? utils.makeBool(data.flowReadingsOnly) : this.orp.flowReadingsOnly;
                await this.setDosing(this.orp, data);
                await this.setMixing(this.orp, data);
                await this.probe.setProbeORPAsync(sorp.probe, data.probe);
                await this.tank.setTankAsync(sorp.tank, data.tank);
                await this.pump.setPumpAsync(sorp.pump, data.pump);
                this.orp.setpoint = sorp.setpoint = typeof data.setpoint !== 'undefined' ? parseInt(data.setpoint, 10) : this.orp.setpoint;
                if (typeof data.tolerance !== 'undefined') {
                    if (typeof data.tolerance.enabled !== 'undefined') this.orp.tolerance.enabled = utils.makeBool(data.tolerance.enabled);
                    if (typeof data.tolerance.low === 'number') this.orp.tolerance.low = data.tolerance.low;
                    if (typeof data.tolerance.high === 'number') this.orp.tolerance.high = data.tolerance.high;
                }
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public async manualDoseAsync(sorp: ChemicalORPState, volume: number) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentDose = undefined;
                this.currentMix = undefined;
                sorp.manualDosing = false;
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sorp);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sorp);
            }
            let pump = this.pump.pump;
            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(volume / (pump.ratedFlow / 60));
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose current: ${sorp.level} setpoint: ${this.orp.setpoint} volume:${volume}`);
            let dosage: NixieChemDose = new NixieChemDose(new Date());
            let meth = sys.board.valueMaps.chemDosingMethods.getName(this.orp.dosingMethod);
            dosage.set({ startDate: new Date(), isManual: true, schem: sorp, demand: 0, method: meth, setpoint: this.orp.setpoint, level: sorp.level, volume: volume, time: time, maxVolume: volume, maxTime: time });
            sorp.doseTime = dosage.time;
            sorp.doseVolume = dosage.volume;
            sorp.manualDosing = true;
            // Now let's determine what we need to do with our pump to satisfy our acid demand.
            if (sorp.tank.level > 0) {
                logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                await this.pump.dose(dosage);
                this.currentDose = dosage;
            }
        }
        catch (err) { logger.error(err); }
    }
    public async cancelDosing(sorp: ChemicalORPState) {
        try {
            // Just stop the pump for now but we will do some logging later.
            await this.pump.stopDosing(sorp);
            if (sorp.dosingStatus === 0)
                await this.mixChemicals(sorp);
        } catch (err) { return Promise.reject(err); }
    }
    public async checkDosing(chem: ChemController, sorp: ChemicalORPState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (sorp.suspendDosing) {
                // Kill off the dosing and make sure the pump isn't running.  Let's force the issue here.
                await this.cancelDosing(sorp);
                return;
            }
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentDose = undefined;
                this.currentMix = undefined;
                sorp.manualDosing = false;
                sorp.mixTimeRemaining = 0;
                sorp.dosingVolumeRemaining = 0;
                sorp.dosingTimeRemaining = 0;
                await this.stopMixing(sorp);
                await this.cancelDosing(sorp);
            }
            if (status === 'mixing') {
                await this.cancelDosing(sorp);
                await this.mixChemicals(sorp);
            }
            else if (sorp.manualDosing) {
                // We are manually dosing.  We are not going to dynamically change the dose.
                let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose(new Date()) : this.currentDose;
                if (typeof this.currentDose === 'undefined') {
                    // This will only happen when njspc is killed in the middle of a dose.
                    let dose = sorp.dosingVolumeRemaining;
                    let time = sorp.dosingTimeRemaining;
                    dosage.set({
                        startDate: new Date(), schem: sorp, method: sys.board.valueMaps.chemDosingMethods.transformByName('volume'), setpoint: this.orp.setpoint, level: sorp.level,
                        volume: dose, time: time, maxVolume: dose, maxTime: time, isManual: true
                    });
                    // For a manual dose we will pick up where we left off.
                    this.currentDose = dosage;
                }
                if (sorp.tank.level > 0) {
                    logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                    await this.stopMixing(sorp);
                    await this.pump.dose(dosage);
                }
                else await this.cancelDosing(sorp);
            }
            else if (sorp.dailyLimitReached) {
                await this.cancelDosing(sorp);
            }
            else if (status === 'monitoring' || status === 'dosing' && !this.orp.useChlorinator) {
                let dose = 0;
                if (this.orp.setpoint < sorp.level && !sorp.lockout) {
                    // Calculate how many mL are required to raise to our ORP level.
                    // 1. Get the total gallons of water that the chem controller is in control of.
                    let totalGallons = 0;
                    if (chem.body === 0 || chem.body === 32) totalGallons += sys.bodies.getItemById(1).capacity;
                    if (chem.body === 1 || chem.body === 32) totalGallons += sys.bodies.getItemById(2).capacity;
                    if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
                    if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;
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
                    let dosage: NixieChemDose = typeof this.currentDose === 'undefined' || status === 'monitoring' ? new NixieChemDose(new Date()) : this.currentDose;
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
                    else await this.cancelDosing(sorp);
                }
                else
                    await this.cancelDosing(sorp);
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
    public get chemical(): NixieChemical { return this.getParent() as NixieChemical; }
    public async setProbePhAsync(sprobe: ChemicalProbePHState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                await this.setProbeAsync(this.probe, sprobe, data);
                this.probe.type = typeof data.type !== 'undefined' ? data.type : this.probe.type;
                sprobe.temperature = typeof data.temperature !== 'undefined' ? parseFloat(data.temperature) : sprobe.temperature;
                sprobe.tempUnits = typeof data.tempUnits !== 'undefined' ? data.tempUnits : sprobe.tempUnits;
                this.probe.feedBodyTemp = typeof data.feedBodyTemp !== 'undefined' ? utils.makeBool(data.feedBodyTemp) : utils.makeBool(this.probe.feedBodyTemp);
            }
        } catch (err) { return Promise.reject(err); }
    }
    public async setTempCompensation(sprobe: ChemicalProbePHState) {
        if (this.probe.feedBodyTemp) {
            if (this.probe.type !== 0) {
                // Set the current body so that it references the temperature of the current running body.
                let body = sys.board.bodies.getBodyState(this.chemical.chemController.chem.body);
                if (typeof body !== 'undefined' && body.isOn) {
                    let units = sys.board.valueMaps.tempUnits.transform(sys.general.options.units);
                    let obj = {};
                    obj[`temp${units.name.toUpperCase()}`] = body.temp;
                    sprobe.tempUnits = units.val;
                    sprobe.temperature = body.temp; // set temp for lsi calc
                    let res = await NixieEquipment.putDeviceService(this.probe.connectionId, `/feed/device/${this.probe.deviceBinding}`, obj);
                }
            }
        }
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
export class NixieChemFlowSensor extends NixieChildEquipment {
    public sensor: ChemFlowSensor;
    constructor(parent: NixieChemController, sensor: ChemFlowSensor) {
        super(parent);
        this.sensor = sensor;
        sensor.master = 1;
    }
    public async setSensorAsync(data: any) {
        try {
            if (typeof data !== 'undefined') {
                this.sensor.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : this.sensor.connectionId;
                this.sensor.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : this.sensor.deviceBinding;
                this.sensor.minimumFlow = typeof data.minimumFlow !== 'undefined' ? data.minimumFlow : this.sensor.minimumFlow;
                this.sensor.minimumPressure = typeof data.minimumPressure !== 'undefined' ? data.minimumPressure : this.sensor.minimumPressure;
                this.sensor.type = typeof data.type !== 'undefined' ? data.type : this.sensor.type;
            }
        } catch (err) { return Promise.reject(err); }
    }
    public async getState() {
        try {
            let dev = await NixieEquipment.getDeviceService(this.sensor.connectionId, `/state/device/${this.sensor.deviceBinding}`);
            return dev;
        }
        catch (err) { return Promise.reject(err); }
    }
}
