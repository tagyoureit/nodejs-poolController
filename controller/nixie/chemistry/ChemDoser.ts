import { clearTimeout, setTimeout } from 'timers';
import { conn } from '../../../controller/comms/Comms';
import { Outbound, Protocol, Response } from '../../../controller/comms/messages/Messages';
import { ChemDoser, ChemDoserCollection, ChemFlowSensor, ChemicalPump, ChemicalTank, sys } from "../../../controller/Equipment";
import { logger } from '../../../logger/Logger';
import { InterfaceServerResponse, webApp } from "../../../web/Server";
import { Timestamp, utils } from '../../Constants';
import { EquipmentNotFoundError, EquipmentTimeoutError, InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../../Errors';
import { ChemDoserState, ChemicalChlorState, ChemicalDoseState, ChemicalPumpState, ChemicalState, ChemicalTankState, ChlorinatorState, state } from "../../State";
import { ncp } from '../Nixie';
import { INixieControlPanel, NixieChildEquipment, NixieEquipment, NixieEquipmentCollection } from "../NixieEquipment";
import { INixieChemController, NixieChemFlowSensor, NixieChemPump, NixieChemTank, NixieChemMix, INixieChemical } from "./ChemController";
export class NixieChemDoserCollection extends NixieEquipmentCollection<NixieChemDoserBase> {
    public async manualDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemDoser = this.find(elem => elem.id === id) as NixieChemDoser;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem doser at id ${id}`, id, 'chemDoser'));
            await c.manualDoseAsync(data);
        } catch (err) { logger.error(`manualDoseAysnc: ${err.message}`); return Promise.reject(err); }
    }
    public async calibrateDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemDoser = this.find(elem => elem.id === id) as NixieChemDoser;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem doser at id ${id}`, id, 'chemDoser'));
            await c.calibrateDoseAsync(data);
        } catch (err) { logger.error(`calibrateDoseAysnc: ${err.message}`); return Promise.reject(err); }
    }
    public async cancelDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemDoser = this.find(elem => elem.id === id) as NixieChemDoser;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem doser at id ${id}`, id, 'chemDoser'));
            await c.cancelDosingAsync(data);
        } catch (err) { logger.error(`cancelDoseAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async manualMixAsync(id: number, data: any) {
        try {
            let c: NixieChemDoser = this.find(elem => elem.id === id) as NixieChemDoser;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem doser at id ${id}`, id, 'chemDoser'));
            await c.manualMixAsync(data);
        } catch (err) { logger.error(`manualMixAysnc: ${err.message}`); return Promise.reject(err); }
    }
    public async cancelMixingAsync(id: number, data: any) {
        try {
            let c: NixieChemDoser = this.find(elem => elem.id === id) as NixieChemDoser;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem doser at id ${id}`, id, 'chemDoser'));
            await c.cancelMixingAsync(data);
        } catch (err) { logger.error(`cancelMixingAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async setDoserAsync(chem: ChemDoser, data: any) {
        // By the time we get here we know that we are in control and this REM Chem or IntelliChem.
        try {
            let ncc: NixieChemDoserBase = this.find(elem => elem.id === chem.id) as NixieChemDoserBase;
            if (typeof ncc === 'undefined') {
                chem.master = 1;
                ncc = NixieChemDoserBase.create(this.controlPanel, chem);
                this.push(ncc);
                logger.info(`Nixie Chem Doser was created at id #${chem.id}`);
                await ncc.setDoserAsync(data);
            }
            else {
                await ncc.setDoserAsync(data);
            }
            // Now go back through the array and undo anything that is in need of pruning.
        }
        catch (err) { logger.error(`setControllerAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async syncRemoteREMFeeds(servers) {
        for (let i = 0; i < this.length; i++) {
            let ncc = this[i] as NixieChemDoserBase;
            ncc.syncRemoteREMFeeds(servers);
        }
    }
    public async initAsync(controllers: ChemDoserCollection) {
        try {
            for (let i = 0; i < controllers.length; i++) {
                let cc = controllers.getItemByIndex(i);
                if (cc.master === 1) {
                    logger.info(`Initializing chemDoser ${cc.name}`);
                    // First check to make sure it isnt already there.
                    if (typeof this.find(elem => elem.id === cc.id) === 'undefined') {
                        let ncc = NixieChemDoserBase.create(this.controlPanel, cc);
                        this.push(ncc);
                    }
                    else {
                        logger.info(`chemDoser ${cc.name} has already been initialized`);
                    }
                }
            }
        }
        catch (err) { logger.error(`initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    logger.info(`Closing chemDoser ${this[i].id}`);
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Chem Doser ${err}`); return Promise.reject(err); }
            }

        } catch (err) { } // Don't bail if we have an error
    }
    public async setServiceModeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    let cc = this[i] as NixieChemDoserBase;
                    await cc.setServiceModeAsync();
                } catch (err) { logger.error(`Error setting Chem Doser to service mode ${err}`); return Promise.reject(err); }
            }
        } catch (err) { } // Don't bail if we have an error
    }
}
export class NixieChemDoserBase extends NixieEquipment implements INixieChemController {
    public pollingInterval: number = 10000;
    protected _suspendPolling: number = 0;
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1)); }
    public _ispolling = false;
    protected _pollTimer: NodeJS.Timeout = null;
    protected closing = false;
    public flowSensor: NixieChemFlowSensor;
    public bodyOnTime: number;
    public flowDetected: boolean = false;
    public get id() { return typeof this.chem !== 'undefined' ? this.chem.id : -1; }
    public pump: NixieChemPump;
    public tank: NixieChemTank;
    public _lastOnStatus: number;
    protected _stoppingMix = false;
    protected _processingMix = false;
    public chemType: string;
    public _currentMix: NixieChemMix;
    protected _mixTimer: NodeJS.Timeout;
    public get currentMix(): NixieChemMix { return this._currentMix; }
    public set currentMix(val: NixieChemMix) {
        if (typeof val === 'undefined' && typeof this._currentMix !== 'undefined') logger.debug(`${this.chem.chemType} mix set to undefined`);
        else logger.debug(`Set new current mix ${this.chem.chemType}`)
        this._currentMix = val;
    }
    constructor(ncp: INixieControlPanel, chem: ChemDoser) {
        super(ncp);
        this.chem = chem;
    }
    public chem: ChemDoser;
    public syncRemoteREMFeeds(servers) { }
    public async setServiceModeAsync() {}
    public static create(ncp: INixieControlPanel, chem: ChemDoser): NixieChemDoserBase {
        return new NixieChemDoser(ncp, chem);
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.chem.body);
        if (isOn && typeof this.bodyOnTime === 'undefined') {
            this.bodyOnTime = new Date().getTime();
        }
        else if (!isOn) this.bodyOnTime = undefined;
        return isOn;
    }
    public async setDoserAsync(data: any) { } // This is meant to be abstract override this value
    protected async cancelMixing(schem: ChemDoserState): Promise<void> {
        try {
            logger.verbose(`Cancelling ${this.chemType} Mix`);
            await this.stopMixing(schem);
        } catch (err) { logger.error(`cancelMixing ${this.chemType}: ${err.message}`); return Promise.reject(err); }
    }
    protected async stopMixing(schem: ChemDoserState): Promise<void> {
        try {
            this._stoppingMix = true;
            this.suspendPolling = true;
            if (typeof this.currentMix !== 'undefined') logger.debug(`Stopping ${schem.chemType} mix and clearing the current mix object.`);
            if (typeof this.currentMix !== 'undefined' || typeof this._mixTimer !== 'undefined' || this._mixTimer) {
                if (this._mixTimer || typeof this._mixTimer !== 'undefined') {
                    clearInterval(this._mixTimer);
                    this._mixTimer = undefined;
                    logger.verbose(`Cleared ${schem.chemType} mix timer`);
                }
                else
                    logger.warn(`${schem.chemType} did not have a mix timer set when cancelling.`);
                if (typeof this.currentMix !== 'undefined') {
                    this.currentMix = undefined;
                    logger.verbose(`Cleared ${schem.chemType} mix object`);
                }
                else
                    logger.warn(`${schem.chemType} did not have a currentMix object set when cancelling.`);
                schem.dosingStatus = sys.board.valueMaps.chemDoserDosingStatus.getValue('monitoring');
                schem.mixTimeRemaining = 0;
                schem.manualMixing = false;
            }
        } catch (err) { logger.error(`Error stopping chemical mix`); return Promise.reject(err); }
        finally { this._stoppingMix = false; this.suspendPolling = false; }
    }
    protected async initMixChemicals(schem: ChemDoserState, mixingTime?: number): Promise<void> {
        try {
            if (this._stoppingMix) return;
            if (typeof this.currentMix === 'undefined') {
                if (typeof mixingTime !== 'undefined') {
                    // This is a manual mix so we need to make sure the pump is not dosing.
                    logger.info(`Clearing any possible ${schem.chemType} dosing or existing mix for mixingTime: ${mixingTime}`);
                    await this.pump.stopDosing(schem, 'mix override');
                    await this.stopMixing(schem);
                }
                this.currentMix = new NixieChemMix();
                if (typeof mixingTime !== 'undefined' && !isNaN(mixingTime)) {
                    this.currentMix.set({ time: mixingTime, timeMixed: 0, isManual: true });
                    schem.manualMixing = true;
                }
                else if (schem.mixTimeRemaining > 0) {
                    if (schem.manualMixing) {
                        this.currentMix.set({ time: schem.mixTimeRemaining, timeMixed: 0, isManual: true });
                    }
                    else

                        this.currentMix.set({ time: this.chem.mixingTime, timeMixed: Math.max(0, this.chem.mixingTime - schem.mixTimeRemaining) });
                }

                else
                    this.currentMix.set({ time: this.chem.mixingTime, timeMixed: 0 });
                logger.info(`Chem Doser begin mixing ${schem.chemType} for ${utils.formatDuration(this.currentMix.timeRemaining)} of ${utils.formatDuration(this.currentMix.time)}`)
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
            }
            if (typeof this._mixTimer === 'undefined' || !this._mixTimer) {
                let self = this;
                this._mixTimer = setInterval(async () => { await self.mixChemicals(schem); }, 1000);
                logger.verbose(`Set ${schem.chemType} mix timer`);
            }
        } catch (err) { logger.error(`Error initializing ${schem.chemType} mix: ${err.message}`); }
    }
    public async mixChemicals(schem: ChemDoserState, mixingTime?: number): Promise<void> {
        try {
            if (this._stoppingMix) {
                logger.verbose(`${schem.chemType} is currently stopping mixChemicals ignored.`)
                return;
            }
            if (this._processingMix) {
                logger.verbose(`${schem.chemType} is already processing mixChemicals ignored.`);
                return;
            }
            this._processingMix = true;
            if (!this.chem.enabled) {
                // The chemical is not enabled so we need to ditch the mixing if it is currently underway.
                await this.stopMixing(schem);
                return;
            }

            let dt = new Date().getTime();
            await this.initMixChemicals(schem, mixingTime);
            if (this._stoppingMix) return;
            if (!this.chem.flowOnlyMixing || (schem.chemController.isBodyOn && this.flowDetected && !schem.freezeProtect)) {
                this.currentMix.timeMixed += Math.round((dt - this.currentMix.lastChecked) / 1000);
                logger.verbose(`Chem ${schem.chemType} mixing paused because body is not on.`);
                // Reflect any changes to the configuration.
                if (!this.currentMix.isManual) { this.currentMix.time = this.chem.mixingTime; }
                schem.mixTimeRemaining = Math.round(this.currentMix.timeRemaining);
                logger.verbose(`Chem mixing ${schem.chemType} remaining: ${utils.formatDuration(schem.mixTimeRemaining)}`);
            }
            else
                logger.verbose(`Chem ${schem.chemType} mixing paused because body is not on.`);

            this.currentMix.lastChecked = dt;
            if (schem.mixTimeRemaining <= 0) {
                logger.info(`Chem Doser ${schem.chemType} mixing Complete after ${utils.formatDuration(this.currentMix.timeMixed)}`);
                await this.stopMixing(schem);
            }
            else {
                schem.dosingStatus = sys.board.valueMaps.chemDoserDosingStatus.getValue('mixing');
            }
        } catch (err) { logger.error(`Error mixing chemicals: ${err.message}`); }
        finally {
            this._processingMix = false;
            setImmediate(() => { schem.emitEquipmentChange(); });
        }
    }
    protected async setHardware(chem: ChemDoser, data: any) {
        try {

        }
        catch (err) { return Promise.reject(err); }
    }
    public processAlarms(schem: ChemDoserState) {
        try {
            // Calculate all the alarms.  These are only informational at this point.
            let setupValid = true;
            if (this.flowSensor.sensor.type === 0) {
                // When there is no flow sensor we always use the body to determine flow.  This means that the
                // flow alarm can never be triggered.
                schem.alarms.flow = 0;
            }
            else {
                // If the body is on and there is no flow detected then we need
                // to indicate this to the user.
                schem.alarms.flow = schem.isBodyOn && !schem.flowDetected ? 1 : 0;
            }
            schem.dailyVolumeDosed = schem.calcDoseHistory();
            let chem = this.chem;
            schem.enabled = this.chem.enabled;
            if (this.chem.enabled) {
                let pumpType = chem.pump.type;
                let currLevelPercent = schem.tank.level / schem.tank.capacity * 100;
                if (pumpType !== 0) {
                    if (currLevelPercent <= 0) schem.alarms.tank = 32;
                    else schem.alarms.tank = schem.tank.alarmEmptyEnabled && currLevelPercent <= schem.tank.alarmEmptyLevel ? 129 : 0;
                }
                else schem.alarms.tank = 0;
                schem.warnings.dailyLimitReached = 0;
                // Alright we need to determine whether we need to adjust the volume any so that we get at least 3 seconds out of the pump.
                let padj = this.chem.pump.type > 0 ? (this.chem.pump.ratedFlow / 60) * 3 : 0;
                if (this.chem.maxDailyVolume <= schem.dailyVolumeDosed + padj) {
                    schem.warnings.dailyLimitReached = 2;
                    schem.dailyLimitReached = true;
                }
                else {
                    schem.warnings.dailyLimitReached = 0;
                    schem.dailyLimitReached = false;
                }
                schem.freezeProtect = (state.freeze && chem.disableOnFreeze && schem.isBodyOn);
            }
            else {
                schem.alarms.tank = 0;
                schem.warnings.dailyLimitReached = 0;
                schem.freezeProtect = false;
            }
            schem.alarms.freezeProtect = (schem.freezeProtect) ? sys.board.valueMaps.chemDoserAlarms.getValue('freezeprotect') : 0;
        } catch (err) { logger.error(`Error processing chem doser ${this.chem.name} alarms: ${err.message}`); }
    }
}
export class NixieChemDoser extends NixieChemDoserBase implements INixieChemical {
    private ver = 1.0;
    constructor(ncp: INixieControlPanel, chem: ChemDoser) {
        super(ncp, chem);
        this.flowSensor = new NixieChemFlowSensor(this, chem.flowSensor);
        this.pollEquipmentAsync();
        this.pump = new NixieChemPump(this, chem.pump);
        this.tank = new NixieChemTank(this, chem.tank);
    }
    public get chemical() { return this.chem; }
    public get chemController() { return this; }
    public async setServiceModeAsync() {
        let schem = state.chemDosers.getItemById(this.chem.id);
        this.cancelDosing(schem, 'service mode');
    }
    public async calibrateDoseAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Check to see that we are a rem chem.
            let time = parseInt(data.time, 10);
            if (isNaN(time)) return Promise.reject(new InvalidEquipmentDataError(`Time was not supplied for the calibration chem dose`, 'chemDoser', data.time));
            // Now we can tell the chemical to dose.
            let schem = state.chemDosers.getItemById(this.chem.id);
            await this.calibratePumpAsync(schem, time);
        }
        catch (err) { logger.error(`calibrateDoseAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }

    }
    public async manualDoseAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Check to see that we are a rem chem.
            let vol = parseInt(data.volume, 10);
            if (isNaN(vol)) return Promise.reject(new InvalidEquipmentDataError(`Volume was not supplied for the manual chem dose`, 'chemDoser', data.volume));
            let schem = state.chemDosers.getItemById(this.chem.id, true);
            // Determine which chemical we are dosing.  This will be ph or orp.
            await this.manualDoseVolumeAsync(schem, vol);
        }
        catch (err) { logger.error(`manualDoseAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async manualMixAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Check to see that we are a rem chem.
            let time = 0;
            if (typeof data.hours !== 'undefined') time += parseInt(data.hours, 10) * 3600;
            if (typeof data.minutes !== 'undefined') time += parseInt(data.minutes, 10) * 60;
            if (typeof data.seconds !== 'undefined') time += parseInt(data.seconds, 10);
            if (isNaN(time) || time <= 0) return Promise.reject(new InvalidEquipmentDataError(`Mix time was not supplied for the manual chem mix`, 'chemDoser', time));
            // Determine which chemical we are dosing.  This will be ph or orp.
            let schem = state.chemDosers.getItemById(this.chem.id, true);
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual mix state not found.`, 'chemDoser', data.chemType));
            // Now we can tell the chemical to dose.
            await this.mixChemicals(schem, time);
        }
        catch (err) { logger.error(`manualMixAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async cancelDosingAsync(data: any) {
        try {
            this.suspendPolling = true;
            let schem = state.chemDosers.getItemById(this.chem.id, true);
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not cancel ${data.chemType} dose state not found.`, 'chemDoser', data.chemType));
            // Now we can tell the chemical to dose.
            await this.cancelDosing(schem, 'cancelled');
        }
        catch (err) { logger.error(`cancelDosingAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async cancelMixingAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Determine which chemical we are cancelling.  This will be ph or orp.
            let schem = state.chemDosers.getItemById(this.chem.id);
            await this.cancelMixing(schem);
        }
        catch (err) { logger.error(`cancelMixingAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async setDoserAsync(data: any) {
        try {
            this.suspendPolling = true;
            let chem = this.chem;
            // So now we are down to the nitty gritty setting the data for the REM or Homegrown Chem controller.
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemDoser', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            let schem = state.chemDosers.getItemById(chem.id, true);
            chem.body = body;
            schem.name = chem.name = data.name || chem.name || `Chem Doser ${chem.id}`;
            schem.isActive = chem.isActive = true;
            schem.enabled = chem.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : chem.enabled;
            chem.dosingMethod = typeof data.dosingMethod !== 'undefined' ? data.dosingMethod : chem.dosingMethod;
            chem.dosingVolume = typeof data.dosingVolume !== 'undefined' ? parseInt(data.dosingVolume, 10) : chem.dosingVolume;
            chem.startDelay = typeof data.startDelay !== 'undefined' ? parseFloat(data.startDelay) : chem.startDelay;
            chem.maxDailyVolume = typeof data.maxDailyVolume !== 'undefined' ? typeof data.maxDailyVolume === 'number' ? data.maxDailyVolume : parseInt(data.maxDailyVolume, 10) : chem.maxDailyVolume;
            chem.flowOnlyMixing = typeof data.flowOnlyMixing !== 'undefined' ? utils.makeBool(data.flowOnlyMixing) : chem.flowOnlyMixing;
            schem.type = chem.type = typeof data.type !== 'undefined' ? sys.board.valueMaps.chemDoserTypes.encode(data.type, 0) : chem.type;
            if (typeof data.mixingTimeHours !== 'undefined' || typeof data.mixingTimeMinutes !== 'undefined') {
                data.mixingTime = (typeof data.mixingTimeHours !== 'undefined' ? parseInt(data.mixingTimeHours, 10) * 3600 : 0) +
                    (typeof data.mixingTimeMinutes !== 'undefined' ? parseInt(data.mixingTimeMinutes, 10) * 60 : 0) +
                    (typeof data.mixingTimeSeconds !== 'undefined' ? parseInt(data.mixingTimeSeconds, 10) : 0);
            }
            chem.mixingTime = typeof data.mixingTime !== 'undefined' ? parseInt(data.mixingTime, 10) : chem.mixingTime;
            await this.flowSensor.setSensorAsync(data.flowSensor);
            await this.tank.setTankAsync(schem.tank, data.tank);
            await this.pump.setPumpAsync(schem.pump, data.pump);
            await this.processAlarms(schem);
        }
        catch (err) { logger.error(`setDoserAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async checkFlowAsync(schem: ChemDoserState): Promise<boolean> {
        try {
            this.suspendPolling = true;
            schem.isBodyOn = this.isBodyOn();
            // rsg - we were not returning the flow sensor state when the body was off.  
            // first, this would not allow us to retrieve a pressure of 0 to update flowSensor.state
            // second, we can set a flow alarm if the expected flow doesn't match actual flow
            if (this.flowSensor.sensor.type === 0) {
                this.flowDetected = schem.flowDetected = true;
                schem.alarms.flowSensorFault = 0;
            }
            else {
                logger.verbose(`Begin getting flow sensor state`);
                let ret = await this.flowSensor.getState();
                schem.flowSensor.state = ret.obj.state;
                // Call out to REM to see if we have flow.

                // We should have state from the sensor but we want to keep this somewhat generic.
                //[1, { name: 'switch', desc: 'Flow Switch', remAddress: true }],
                //[2, { name: 'rate', desc: 'Rate Sensor', remAddress: true }],
                //[4, { name: 'pressure', desc: 'Pressure Sensor', remAddress: true }],
                if (this.flowSensor.sensor.type === 1) {
                    // This is a flow switch.  The expectation is that it should be 0 or 1.
                    let v;
                    if (typeof ret.obj.state.boolean !== 'undefined') v = utils.makeBool(ret.obj.state.boolean);
                    else if (typeof ret.obj.state === 'string') v = utils.makeBool(ret.obj.state);
                    else if (typeof ret.obj.state === 'boolean') v = ret.obj.state;
                    else if (typeof ret.obj.state === 'number') v = utils.makeBool(ret.obj.state);
                    else if (typeof ret.obj.state.val === 'number') v = utils.makeBool(ret.obj.state.val);
                    else if (typeof ret.obj.state.value === 'number') v = utils.makeBool(ret.obj.state.value);
                    else v = false;
                    this.flowDetected = schem.flowDetected = v;
                }
                else if (this.flowSensor.sensor.type == 2) {
                    this.flowDetected = schem.flowDetected = ret.obj.state > this.flowSensor.sensor.minimumFlow;
                }
                else if (this.flowSensor.sensor.type == 4) {
                    this.flowDetected = schem.flowDetected = ret.obj.state > this.flowSensor.sensor.minimumPressure;
                }
                else
                    this.flowDetected = schem.flowDetected = false;
                schem.alarms.flowSensorFault = 0;
            }
            if (!schem.flowDetected) this.bodyOnTime = undefined;
            else if (typeof this.bodyOnTime === 'undefined') this.bodyOnTime = new Date().getTime();
            logger.verbose(`End getting flow sensor state`);
            return schem.flowDetected;
        }
        catch (err) { logger.error(`checkFlowAsync: ${err.message}`); schem.alarms.flowSensorFault = 7; this.flowDetected = schem.flowDetected = false; return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            logger.verbose(`Begin polling Chem Doser ${this.id}`);
            if (this._suspendPolling > 0) logger.warn(`Suspend polling for ${this.chem.name} -> ${this._suspendPolling}`);
            if (this.suspendPolling) return;
            if (this._ispolling) return;
            this._ispolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let schem = state.chemDosers.getItemById(this.chem.id, !this.closing);
            // We need to check on the equipment to make sure it is solid.
            if (NixieEquipment.isConnected) {
                schem.alarms.comms = 0;
                schem.status = 0;
                schem.lastComm = new Date().getTime();
                await this.checkFlowAsync(schem);
                await this.validateSetupAsync(this.chem, schem);
                this.processAlarms(schem);
                await this.checkDosing(this.chem, schem);
                if (state.mode === 0 && this.chem.enabled) {
                }
            }
            else
                logger.warn('REM Server not Connected');
            this._ispolling = false;
        }
        catch (err) { this._ispolling = false; logger.error(`Error polling Chem Doser - ${err}`); }
        finally {
            if (!this.closing && !this._ispolling)
                this._pollTimer = setTimeout(() => { self.pollEquipmentAsync(); }, this.pollingInterval || 10000);
            logger.verbose(`End polling Chem Doser ${this.id}`);
        }
    }
    public async checkDosing(doser: ChemDoser, sd: ChemDoserState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sd.dosingStatus);
            logger.debug(`Begin check dosing status = ${status}`);
            if (!doser.enabled) {
                await this.cancelDosing(sd, 'disabled');
                return;
            }
            if (sd.suspendDosing) {
                // Kill off the dosing and make sure the pump isn't running.  Let's force the issue here.
                await this.cancelDosing(sd, 'suspended');
                return;
            }
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof sd.currentDose !== 'undefined') logger.error('Somehow we made it to monitoring and still have a current dose');
                sd.currentDose = undefined;
                sd.manualDosing = false;
                sd.dosingVolumeRemaining = 0;
                sd.dosingTimeRemaining = 0;
                if (typeof this.currentMix !== 'undefined') {
                    if (ncp.chemDosers.length > 1) {
                        let arrIds = [];
                        for (let i = 0; i < ncp.chemDosers.length; i++) {
                            arrIds.push(ncp[i].id);
                        }
                        logger.info(`More than one NixieChemDoser object was found ${JSON.stringify(arrIds)}`);
                    }
                    logger.debug(`We are now monitoring and have a mixing object`);
                    await this.stopMixing(sd);
                }
                await this.cancelDosing(sd, 'monitoring');
            }
            if (status === 'mixing') {
                await this.cancelDosing(sd, 'mixing');
                if (typeof this.currentMix === 'undefined') {
                    logger.info(`Current ${sd.chemType} mix object not defined initializing mix`);
                    await this.mixChemicals(sd);
                }
            }
            else if (sd.manualDosing) {
                // We are manually dosing.  We are not going to dynamically change the dose.
                if (typeof sd.currentDose === 'undefined') {
                    // This will only happen when njspc is killed in the middle of a dose.  Unlike IntelliChem we will pick that back up.
                    // Unfortunately we will lose the original start date but who cares as the volumes should remain the same.
                    let volume = sd.volumeDosed + sd.dosingVolumeRemaining;
                    let time = sd.timeDosed + sd.dosingTimeRemaining;
                    sd.startDose(new Timestamp().addSeconds(-sd.doseTime).toDate(), 'manual', volume, sd.dosingVolumeRemaining, time * 1000, sd.doseTime * 1000);
                }
                if (sd.tank.level > 0) {
                    logger.verbose(`Chem ${sd.chemType} dose activate pump ${ this.pump.pump.ratedFlow }mL / min`);
                    await this.stopMixing(sd);
                    await this.pump.dose(sd);
                }
                else {
                    if (typeof sd.currentDose !== 'undefined' && sd.currentDose.method === 'calibration') { }
                    else await this.cancelDosing(sd, 'empty tank');
                }
            }
            else if (sd.dailyLimitReached) {
                await this.cancelDosing(sd, 'daily limit');
            }
            else if (status === 'monitoring' || status === 'dosing') {
                // Figure out what mode we are in and what mode we should be in.
                //sph.level = 7.61;
                // Check the setpoint and the current level to see if we need to dose.
                if (!sd.chemController.isBodyOn)
                    await this.cancelDosing(sd, 'body off');
                else if (sd.freezeProtect)
                    await this.cancelDosing(sd, 'freeze');
                else if (!sd.chemController.flowDetected)
                    await this.cancelDosing(sd, 'no flow');
                else {
                    logger.info(`Starting dose calculation`);
                    let pump = this.pump.pump;
                    let dose = Math.max(0, Math.min(this.chem.maxDailyVolume - sd.dailyVolumeDosed, doser.dosingVolume));
                    let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(dose / (pump.ratedFlow / 60));
                    logger.info(`Chem ${sd.chemType} calculated ${dose}mL for ${utils.formatDuration(time)} Tank Level: ${sd.tank.level}`);
                    if (typeof sd.currentDose === 'undefined' && sd.tank.level > 0) {
                        // We will include this with the dose demand because our limits may reduce it.
                        //dosage.demand = demand;
                        if (sd.dosingStatus === 0) { // 0 is dosing.
                            // We need to finish off a dose that was interrupted by regular programming.  This occurs
                            // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                            // mixing before we will never get here.
                            logger.info(`Continuing a previous new ${sd.chemType} dose ${sd.doseVolume}mL`);
                            sd.startDose(new Timestamp().addSeconds(-sd.doseTime).toDate(), 'auto', sd.doseVolume + sd.dosingVolumeRemaining, sd.doseVolume, (sd.doseTime + sd.dosingTimeRemaining) * 1000, sd.doseTime * 1000);
                        }
                        else {
                            logger.info(`Starting a new ${sd.chemType} dose ${dose}mL`);
                            sd.startDose(new Date(), 'auto', dose, 0, time, 0);
                        }
                    }
                    // Now let's determine what we need to do with our pump to satisfy our acid demand.
                    if (sd.tank.level > 0) {
                        logger.verbose(`Chem ${sd.chemType} dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                        await this.pump.dose(sd);
                    }
                    else {
                        logger.warn(`Chem ${sd.chemType} NOT dosed because tank level is level ${sd.tank.level}.`);
                        await this.cancelDosing(sd, 'empty tank');
                    }
                }
            }
        }
        catch (err) { logger.error(err); return Promise.reject(err); }
        finally {
            logger.debug(`End check ${sd.chemType} dosing status = ${sys.board.valueMaps.chemControllerDosingStatus.getName(sd.dosingStatus)}`);
        }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(chem: ChemDoser, schem: ChemDoserState) {
        try {
            // The validation will be different if the body is on or not.  So lets get that information.
            logger.verbose(`Begin validating ${chem.id} - ${chem.name} setup`);
            if (chem.enabled) {
                if (chem.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.pump.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatusAsync(chem.pump.connectionId, chem.pump.deviceBinding);
                        schem.alarms.pumpFault = dev.hasFault ? 2 : 0;
                    }
                    else schem.alarms.pumpFault = 0;
                }
                else schem.alarms.pumpFault = 0;
            }
            else schem.alarms.pumpFault = schem.alarms.pumpFault = 0;
            schem.alarms.comms = 0;
            logger.verbose(`End validating ${chem.id} - ${chem.name} setup`);
        } catch (err) { logger.error(`Error checking Chem Doser Hardware ${this.chem.name}: ${err.message}`); schem.alarms.comms = 2; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            if (typeof this._mixTimer !== 'undefined' || this._mixTimer) clearTimeout(this._mixTimer);
            this._mixTimer = null;
            this.currentMix = null;
            this.closing = true;
            let schem = state.chemDosers.getItemById(this.chem.id);
            await this.cancelDosing(schem, 'closing');
            logger.info(`Closed chem doser ${schem.id} ${schem.name}`);
            schem.emitEquipmentChange();
        }
        catch (err) { logger.error(`ChemDoser closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
    public syncRemoteREMFeeds(servers) { }
    protected async initMixChemicals(schem: ChemDoserState, mixingTime?: number): Promise<void> {
        try {
            if (this._stoppingMix) return;
            if (typeof this.currentMix === 'undefined') {
                if (typeof mixingTime !== 'undefined') {
                    // This is a manual mix so we need to make sure the pump is not dosing.
                    logger.info(`Clearing any possible ${schem.chemType} dosing or existing mix for mixingTime: ${mixingTime}`);
                    await this.pump.stopDosing(schem, 'mix override');
                    await this.stopMixing(schem);
                }
                this.currentMix = new NixieChemMix();
                if (typeof mixingTime !== 'undefined' && !isNaN(mixingTime)) {
                    this.currentMix.set({ time: mixingTime, timeMixed: 0, isManual: true });
                    schem.manualMixing = true;
                }
                else if (schem.mixTimeRemaining > 0) {
                    if (schem.manualMixing) {
                        this.currentMix.set({ time: schem.mixTimeRemaining, timeMixed: 0, isManual: true });
                    }
                    else
                        this.currentMix.set({ time: this.chem.mixingTime, timeMixed: Math.max(0, this.chem.mixingTime - schem.mixTimeRemaining) });
                }
                else
                    this.currentMix.set({ time: this.chem.mixingTime, timeMixed: 0 });
                logger.info(`Chem Doser begin mixing ${schem.chemType} for ${utils.formatDuration(this.currentMix.timeRemaining)} of ${utils.formatDuration(this.currentMix.time)}`)
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
            }
            if (typeof this._mixTimer === 'undefined' || !this._mixTimer) {
                let self = this;
                this._mixTimer = setInterval(async () => { await self.mixChemicals(schem); }, 1000);
                logger.verbose(`Set ${schem.chemType} mix timer`);
            }
        } catch (err) { logger.error(`Error initializing ${schem.chemType} mix: ${err.message}`); }
    }
    public async cancelDosing(schem: ChemDoserState, reason: string) {
        try {
            // Just stop the pump for now but we will do some logging later.
            await this.pump.stopDosing(schem, reason);
            if (schem.dosingStatus === 0) {
                await this.mixChemicals(schem);
                // Set the setpoints back to the original.
                if (this.chem.disableChlorinator) {
                    let chlors = sys.chlorinators.getByBody(this.chem.body);
                    for (let i = 0; i < chlors.length; i++) {
                        let chlor = chlors.getItemByIndex(i);
                        if (chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: false });
                    }
                }
            }
            if (typeof schem.currentDose !== 'undefined') schem.endDose(new Date(), 'cancelled');
        } catch (err) { logger.error(`cancelDosing ${this.chem.chemType}: ${ err.message }`); return Promise.reject(err); }
    }
    public async calibratePumpAsync(schem: ChemDoserState, time: number) {
        try {
            logger.debug(`Starting manual ${schem.chemType} dose for ${time}seconds`);
            let status = sys.board.valueMaps.chemDoserDosingStatus.getName(schem.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof schem.currentDose !== 'undefined') await this.cancelDosing(schem, 'manual cancel');
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(schem);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(schem);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(schem, 'manual cancel');
            }
            //if (sph.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ${sph.chemType} tank is empty`, 'chemical', sph));
            let pump = this.pump.pump;
            let volume = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : time * (pump.ratedFlow / 60);
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating calibration dose time:${time} seconds`);
            schem.manualDosing = true;
            schem.startDose(new Date(), 'calibration', -1, 0, time);
            logger.verbose(`Chem ${this.chemType} manual calibration dose activate pump`);
            await this.pump.dose(schem);
        }
        catch (err) { logger.error(`calibrateDoseAsync: ${err.message}`); logger.error(err); return Promise.reject(err); }
    }
    public async manualDoseVolumeAsync(schem: ChemDoserState, volume: number) {
        try {
            logger.debug(`Starting manual ${schem.chemType} dose of ${volume}mL`);
            let status = sys.board.valueMaps.chemDoserDosingStatus.getName(schem.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof schem.currentDose !== 'undefined') await this.cancelDosing(schem, 'manual cancel');
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(schem);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(schem);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(schem, 'manual cancel');
            }
            if (schem.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ${schem.chemType} tank is empty`, 'chemical', schem));
            let pump = this.pump.pump;
            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(volume / (pump.ratedFlow / 60));
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose volume:${volume}`);
            schem.manualDosing = true;
            schem.startDose(new Date(), 'manual', volume, 0, time);
            if (schem.tank.level > 0) {
                logger.verbose(`Chem ${schem.chemType} manual dose activate pump ${ this.pump.pump.ratedFlow }mL / min`);
                await this.pump.dose(schem);
            }
        }
        catch (err) { logger.error(`manualDoseVolumeAsync: ${err.message}`); logger.error(err); return Promise.reject(err); }
    }
    public async initDose(schem: ChemDoserState) {
        try {
            // We need to do a couple of things here.  First we should disable the chlorinator.
            if (this.chem.disableChlorinator) {
                let chlors = sys.chlorinators.getByBody(this.chem.body);
                for (let i = 0; i < chlors.length; i++) {
                    let chlor = chlors.getItemByIndex(i);
                    if (!chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                }
            }
        }
        catch (err) { logger.error(`initDose: ${err.message}`); return Promise.reject(err); }
    }
}
