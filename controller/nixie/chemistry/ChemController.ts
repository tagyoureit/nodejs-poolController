import { clearTimeout, setTimeout } from 'timers';
import { conn } from '../../../controller/comms/Comms';
import { Outbound, Protocol, Response } from '../../../controller/comms/messages/Messages';
import { IChemical, IChemController, Chlorinator, ChemController, ChemControllerCollection, ChemFlowSensor, Chemical, ChemicalORP, ChemicalORPProbe, ChemicalPh, ChemicalPhProbe, ChemicalProbe, ChemicalPump, ChemicalTank, sys } from "../../../controller/Equipment";
import { logger } from '../../../logger/Logger';
import { InterfaceServerResponse, webApp } from "../../../web/Server";
import { Timestamp, utils } from '../../Constants';
import { EquipmentNotFoundError, EquipmentTimeoutError, InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../../Errors';
import { IChemicalState, ChemControllerState, ChemicalChlorState, ChemicalDoseState, ChemicalORPState, ChemicalPhState, ChemicalProbeORPState, ChemicalProbePHState, ChemicalProbeState, ChemicalPumpState, ChemicalState, ChemicalTankState, ChlorinatorState, state } from "../../State";
import { ncp } from '../Nixie';
import { INixieControlPanel, NixieChildEquipment, NixieEquipment, NixieEquipmentCollection } from "../NixieEquipment";
import { NixieChlorinator } from './Chlorinator';
export interface INixieChemController {
    bodyOnTime: number;
    processAlarms: (schem: any) => void;
    isBodyOn: () => boolean;
}
export interface INixieChemical extends NixieEquipment {
    cancelDosing: (schem: IChemicalState, reason: string) => Promise<void>;
    initDose: (schem: any) => Promise<void>;
    chemController: INixieChemController;
    chemical: IChemical;
}

//#region 
export class NixieChemControllerCollection extends NixieEquipmentCollection<NixieChemControllerBase> {
    public async manualDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.manualDoseAsync(data);
        } catch (err) { logger.error(`manualDoseAysnc: ${err.message}`); return Promise.reject(err); }
    }
    public async calibrateDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.calibrateDoseAsync(data);
        } catch (err) { logger.error(`calibrateDoseAysnc: ${err.message}`); return Promise.reject(err); }
    }

    public async cancelDoseAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.cancelDosingAsync(data);
        } catch (err) { logger.error(`cancelDoseAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async manualMixAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.manualMixAsync(data);
        } catch (err) { logger.error(`manualMixAysnc: ${err.message}`); return Promise.reject(err); }
    }
    public async cancelMixingAsync(id: number, data: any) {
        try {
            let c: NixieChemController = this.find(elem => elem.id === id) as NixieChemController;
            if (typeof c === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Nixie could not find a chem controller at id ${id}`, id, 'chemController'));
            await c.cancelMixingAsync(data);
        } catch (err) { logger.error(`cancelMixingAsync: ${err.message}`); return Promise.reject(err); }
    }

    public async setControllerAsync(chem: ChemController, data: any) {
        // By the time we get here we know that we are in control and this REM Chem or IntelliChem.
        try {
            let ncc: NixieChemControllerBase = this.find(elem => elem.id === chem.id) as NixieChemControllerBase;
            if (typeof ncc === 'undefined') {
                chem.master = 1;
                ncc = NixieChemControllerBase.create(this.controlPanel, chem);
                this.push(ncc);
                let ctype = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
                logger.info(`Nixie Chem Controller was created at id #${chem.id} for type ${ctype.desc}`);
                await ncc.setControllerAsync(data);
            }
            else {
                await ncc.setControllerAsync(data);
            }
            // Now go back through the array and undo anything that is in need of pruning.
        }
        catch (err) { logger.error(`setControllerAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async syncRemoteREMFeeds(servers) {
        // update the controller probes, flowsensor with REM feed status
        for (let i = 0; i < this.length; i++) {
            let ncc = this[i] as NixieChemControllerBase;
            ncc.syncRemoteREMFeeds(servers);
        }
    }
    public async initAsync(controllers: ChemControllerCollection) {
        try {
            for (let i = 0; i < controllers.length; i++) {
                let cc = controllers.getItemByIndex(i);
                if (cc.master === 1) {
                    let type = sys.board.valueMaps.chemControllerTypes.transform(cc.type);
                    logger.info(`Initializing chemController ${cc.name}`);
                    // First check to make sure it isnt already there.
                    if (typeof this.find(elem => elem.id === cc.id) === 'undefined') {
                        let ncc = NixieChemControllerBase.create(this.controlPanel, cc);
                        this.push(ncc);
                    }
                    else {
                        logger.info(`chemController ${cc.name} has already been initialized`);
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
                    logger.info(`Closing chemController ${this[i].id}`);
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Chem Controller ${err}`); return Promise.reject(err); }
            }

        } catch (err) { } // Don't bail if we have an error
    }
    public async setServiceModeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    let cc = this[i] as NixieChemControllerBase;
                    await cc.setServiceModeAsync();
                } catch (err) { logger.error(`Error setting Chem Controller to service mode ${err}`); return Promise.reject(err); }
            }
        } catch (err) { } // Don't bail if we have an error
    }

    public async deleteChlorAsync(chlor: NixieChlorinator) {
        // if we delete the chlor, make sure it is removed from all REM Chem Controllers
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    let ncc = this[i] as NixieChemControllerBase;;
                    ncc.orp.deleteChlorAsync(chlor);
                } catch (err) { logger.error(`Error deleting chlor from Nixie Chem Controller ${err}`); return Promise.reject(err); }
            }

        }
        catch (err) { logger.error(`ncp.deleteChlorAsync: ${err.message}`); return Promise.reject(err); }
    }
    // This is currently not used for anything.
    /*     public async searchIntelliChem(): Promise<number[]> {
            let arr = [];
            try {
                for (let addr = 144; addr <= 152; addr++) {
                    let success = await new Promise<void>((resolve, reject) => {
                        let out = Outbound.create({
                            protocol: Protocol.IntelliChem,
                            dest: addr,
                            action: 210,
                            payload: [210],
                            retries: 1, // We are going to try 2 times.
                            response: Response.create({ protocol: Protocol.IntelliChem, action: 18 }),
                            onAbort: () => { },
                            onComplete: (err) => {
                                if (err) resolve(false);
                                else resolve(true);
                            }
                        });
                        conn.queueSendMessage(out);
                    });
                    if (success) arr.push(addr)
                }
            } catch (err) { return arr; }
        } */
}
export class NixieChemControllerBase extends NixieEquipment implements INixieChemController {
    public pollingInterval: number = 10000;
    protected _suspendPolling: number = 0;
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1)); }
    public _ispolling = false;
    protected _pollTimer: NodeJS.Timeout = null;
    protected closing = false;
    public orp: NixieChemicalORP;
    public ph: NixieChemicalPh;
    public flowSensor: NixieChemFlowSensor;
    public bodyOnTime: number;
    public flowDetected: boolean = false;
    public get id() { return typeof this.chem !== 'undefined' ? this.chem.id : -1; }
    constructor(ncp: INixieControlPanel, chem: ChemController) {
        super(ncp);
        this.chem = chem;
    }
    public chem: ChemController;
    public syncRemoteREMFeeds(servers) { }
    public async setServiceModeAsync() {}
    public static create(ncp: INixieControlPanel, chem: ChemController): NixieChemControllerBase {
        let type = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
        switch (type.name) {
            case 'intellichem':
                return new NixieIntelliChemController(ncp, chem);
            case 'rem':
                return new NixieChemController(ncp, chem);
            default:
                logger.error(`Chem controller type ${type.name} is not supported.`);
                break;
        }
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.chem.body);
        if (isOn && typeof this.bodyOnTime === 'undefined') {
            this.bodyOnTime = new Date().getTime();
        }
        else if (!isOn) this.bodyOnTime = undefined;
        return isOn;
    }
    public get activeBodyId(): number { return sys.board.bodies.getActiveBody(this.chem.body); }
    public async setControllerAsync(data: any) { } // This is meant to be abstract override this value
    public processAlarms(schem: any) { }

}

export class NixieIntelliChemController extends NixieChemControllerBase {
    public configSent: boolean = false;
    constructor(ncp: INixieControlPanel, chem: ChemController) {
        super(ncp, chem);
        // Set the polling interval to 3 seconds.
        this.pollingInterval = 3000;
        this.pollEquipmentAsync();
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            this.suspendPolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            if (this._suspendPolling > 1) return;

            let schem = state.chemControllers.getItemById(this.chem.id, !this.closing);
            schem.calculateSaturationIndex();
            // If the body isn't on then we won't communicate with the chem controller.  There is no need
            // since most of the time these are attached to the filter relay.
            if (this.isBodyOn() && !this.closing) {
                if (!this.configSent) await this.sendConfig(schem);
                if (!this.closing) await this.requestStatus(schem);
            }
        }
        catch (err) { logger.error(`Error polling IntelliChem Controller - ${err}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; if (!this.closing) this._pollTimer = setTimeout(() => { self.pollEquipmentAsync(); }, this.pollingInterval || 10000); }
    }
    public async setServiceModeAsync() {}
    public async setControllerAsync(data: any) {
        try {
            this.suspendPolling = true;
            let chem = this.chem;
            let address = typeof data.address !== 'undefined' ? parseInt(data.address) : chem.address;
            let name = typeof data.name !== 'undefined' ? data.name : chem.name || `IntelliChem - ${address - 143}`;
            let type = sys.board.valueMaps.chemControllerTypes.transformByName('intellichem');
            // So now we are down to the nitty gritty setting the data for the REM Chem controller.
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
            schem.type = type.val;
            let pHSetpoint = typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
            let orpSetpoint = typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
            let lsiRange = typeof data.lsiRange !== 'undefined' ? data.lsiRange : chem.lsiRange || {};
            if (typeof data.lsiRange !== 'undefined') {
                if (typeof data.lsiRange.enabled !== 'undefined') lsiRange.enabled = utils.makeBool(data.lsiRange.enabled);
                if (typeof data.lsiRange.low === 'number') lsiRange.low = parseFloat(data.lsiRange.low);
                if (typeof data.lsiRange.high === 'number') lsiRange.high = parseFloat(data.lsiRange.high);
            }
            if (isNaN(pHSetpoint) || pHSetpoint > type.ph.max || pHSetpoint < type.ph.min) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH setpoint ${pHSetpoint}`, 'ph.setpoint', pHSetpoint));
            if (isNaN(orpSetpoint) || orpSetpoint > type.orp.max || orpSetpoint < type.orp.min) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp setpoint`, 'orp.setpoint', orpSetpoint));
            let phTolerance = typeof data.ph !== 'undefined' && typeof data.ph.tolerance !== 'undefined' ? data.ph.tolerance : chem.ph.tolerance;
            if (typeof data.ph !== 'undefined') {
                if (typeof data.ph.tolerance !== 'undefined') {
                    if (typeof data.ph.tolerance.enabled !== 'undefined') phTolerance.enabled = utils.makeBool(data.ph.tolerance.enabled);
                    if (typeof data.ph.tolerance.low !== 'undefined') phTolerance.low = parseFloat(data.ph.tolerance.low);
                    if (typeof data.ph.tolerance.high !== 'undefined') phTolerance.high = parseFloat(data.ph.tolerance.high);
                    if (isNaN(phTolerance.low)) phTolerance.low = type.ph.min;
                    if (isNaN(phTolerance.high)) phTolerance.high = type.ph.max;
                }
            }
            let phEnabled = typeof data.ph !== 'undefined' && typeof data.ph.enabled !== 'undefined' ? utils.makeBool(data.ph.enabled) : chem.ph.enabled;
            let orpTolerance = typeof data.orp !== 'undefined' && typeof data.orp.tolerance !== 'undefined' ? data.orp.tolerance : chem.orp.tolerance;
            if (typeof data.orp !== 'undefined') {
                if (typeof data.orp.tolerance !== 'undefined') {
                    if (typeof data.orp.tolerance.enabled !== 'undefined') orpTolerance.enabled = utils.makeBool(data.orp.tolerance.enabled);
                    if (typeof data.orp.tolerance.low !== 'undefined') orpTolerance.low = parseFloat(data.orp.tolerance.low);
                    if (typeof data.orp.tolerance.high !== 'undefined') orpTolerance.high = parseFloat(data.orp.tolerance.high);
                    if (isNaN(orpTolerance.low)) orpTolerance.low = type.orp.min;
                    if (isNaN(orpTolerance.high)) orpTolerance.high = type.orp.max;
                }
            }
            let orpEnabled = typeof data.orp !== 'undefined' && typeof data.orp.enabled !== 'undefined' ? utils.makeBool(data.orp.enabled) : chem.orp.enabled;
            let siCalcType = typeof data.siCalcType !== 'undefined' ? sys.board.valueMaps.siCalcTypes.encode(data.siCalcType, 0) : chem.siCalcType;
            schem.siCalcType = chem.siCalcType = siCalcType;
            schem.ph.tank.capacity = chem.ph.tank.capacity = 6;
            schem.orp.tank.capacity = chem.orp.tank.capacity = 6;
            // Always set the address back. This way is persists and if the user tries again without changing it it will continue to fail.
            // Unil they pick the right one.
            schem.address = chem.address = address;
            schem.name = chem.name = name;
            chem.borates = borates;
            chem.body = schem.body = body;
            chem.type = schem.type = type.val;

            let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' && typeof data.ph.tank.level !== 'undefined' ? parseInt(data.ph.tank.level, 10) : schem.ph.tank.level;
            let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' && typeof data.orp.tank.level !== 'undefined' ? parseInt(data.orp.tank.level, 10) : schem.orp.tank.level;
            // Copy the data back to the chem object.
            schem.name = chem.name = data.name || chem.name || `Chem Controller ${chem.id}`;
            schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
            chem.calciumHardness = calciumHardness;
            chem.cyanuricAcid = cyanuricAcid;
            chem.alkalinity = alkalinity;
            chem.borates = borates;
            chem.body = schem.body = body;
            schem.isActive = chem.isActive = true;
            chem.lsiRange.enabled = lsiRange.enabled;
            chem.lsiRange.low = lsiRange.low;
            chem.lsiRange.high = lsiRange.high;
            chem.ph.tolerance.enabled = phTolerance.enabled;
            chem.ph.tolerance.low = phTolerance.low;
            chem.ph.tolerance.high = phTolerance.high;
            schem.ph.tank.level = acidTankLevel;
            schem.orp.tank.level = orpTankLevel;
            chem.orp.tolerance.enabled = orpTolerance.enabled;
            chem.orp.tolerance.low = orpTolerance.low;
            chem.orp.tolerance.high = orpTolerance.high;
            chem.ph.setpoint = pHSetpoint;
            chem.orp.setpoint = orpSetpoint;
            schem.siCalcType = chem.siCalcType = siCalcType;
            chem.address = schem.address = address;
            chem.name = schem.name = name;
            chem.flowSensor.enabled = false;
            // NOTE: We save off the values despite whether IntelliChem is ready to receive them.  That way when
            // we finally do get a chance we can set them.
            await this.sendConfig(schem);
            this.pollEquipmentAsync();
        }
        catch (err) { logger.error(`setControllerAsync IntelliChem: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async sendConfig(schem: ChemControllerState): Promise<boolean> {
        try {
                this.configSent = false;
                let out = Outbound.create({
                    protocol: Protocol.IntelliChem,
                    source: 16,
                    dest: this.chem.address,
                    action: 146,
                    payload: [],
                    retries: 3, // We are going to try 4 times.
                    response: Response.create({ protocol: Protocol.IntelliChem, action: 1 }),
                    onAbort: () => { }
                });
                out.insertPayloadBytes(0, 0, 21);
                out.setPayloadByte(0, Math.floor((this.chem.ph.setpoint * 100) / 256) || 0);
                out.setPayloadByte(1, Math.round((this.chem.ph.setpoint * 100) % 256) || 0);
                out.setPayloadByte(2, Math.floor(this.chem.orp.setpoint / 256) || 0);
                out.setPayloadByte(3, Math.round(this.chem.orp.setpoint % 256) || 0);
                out.setPayloadByte(4, schem.ph.enabled ? schem.ph.tank.level + 1 : 0);
                out.setPayloadByte(5, schem.orp.enabled ? schem.orp.tank.level + 1 : 0);
                out.setPayloadByte(6, Math.floor(this.chem.calciumHardness / 256) || 0);
                out.setPayloadByte(7, Math.round(this.chem.calciumHardness % 256) || 0);
                out.setPayloadByte(9, this.chem.cyanuricAcid);
                out.setPayloadByte(10, Math.floor(this.chem.alkalinity / 256) || 0);
                out.setPayloadByte(12, Math.round(this.chem.alkalinity % 256) || 0);
                logger.verbose(`Nixie: ${this.chem.name} sending IntelliChem settings action 146`);
                out.sendAsync();
                this.configSent = true;
                return true;
        }
        catch (err) { logger.error(`Error updating IntelliChem: ${err.message}`); }
    }
    public async requestStatus(schem: ChemControllerState): Promise<boolean> {
        try {
            schem.type = 2;
                let out = Outbound.create({
                    protocol: Protocol.IntelliChem,
                    source: 16,
                    dest: this.chem.address,
                    action: 210,
                    payload: [210],
                    retries: 3, // We are going to try 4 times.
                    response: Response.create({ protocol: Protocol.IntelliChem, action: 18 }),
                    onAbort: () => { }
                });
                await out.sendAsync();
            return true;
        } catch (err) { 
            // If the IntelliChem is not responding we need to store that off.  If an 18 does
            // come across this will be cleared by the processing of that message.
            schem.alarms.comms = sys.board.valueMaps.chemControllerStatus.encode('nocomms');
            logger.error(`Communication error with IntelliChem : ${err.message}`); 
            return false;
        }
    }
    public async closeAsync() {
        try {
            this.suspendPolling = true;
            this.closing = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let schem = state.chemControllers.getItemById(this.chem.id);
            if (typeof this.ph !== 'undefined') await this.ph.closeAsync();
            if (typeof this.orp !== 'undefined') await this.orp.closeAsync();
            logger.info(`Closing Chem Controller ${this.chem.name}`);

        }
        catch (err) { logger.error(`ChemController closeAsync: ${err.message}`); return Promise.reject(err); }
    }

}
export class NixieChemController extends NixieChemControllerBase {
    private ver = 2.0;
    constructor(ncp: INixieControlPanel, chem: ChemController) {
        super(ncp, chem);
        this.orp = new NixieChemicalORP(this, chem.orp);
        this.ph = new NixieChemicalPh(this, chem.ph);
        this.flowSensor = new NixieChemFlowSensor(this, chem.flowSensor);
        this.pollEquipmentAsync();
        // Ok so lets check the firmware version here.
        let ver = parseFloat(chem.firmware);
        if (isNaN(ver) || ver < 2.0) {
            chem.firmware = this.ver.toFixed(3);
            // Convert our messed up mixing an dosing data.  This will only happen if the firmware has
            // not been set and we have a state obect defined.
            let cstate = state.chemControllers.find(x => x.id === chem.id);
            if (cstate && typeof cstate !== 'undefined') {
                console.log(`Converting to v2.x data structure`);
                if (cstate.ph.dosingStatus === 1) cstate.ph.dosingStatus = 2;
                else if (cstate.ph.dosingStatus === 2) cstate.ph.dosingStatus = 1;
                if (cstate.orp.dosingStatus === 1) cstate.orp.dosingStatus = 2;
                else if (cstate.orp.dosingStatus === 1) cstate.orp.dosingStatus = 1;
            }
        }
    }
    public async setServiceModeAsync() {
        let schem = state.chemControllers.getItemById(this.chem.id);
        if(this.chem.ph.enabled) await this.ph.cancelDosing(schem.ph, 'service mode');
        if(this.chem.orp.enabled) await this.orp.cancelDosing(schem.orp, 'service mode');
    }
    public async calibrateDoseAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Check to see that we are a rem chem.
            let time = parseInt(data.time, 10);
            if (isNaN(time)) return Promise.reject(new InvalidEquipmentDataError(`Time was not supplied for the calibration chem dose`, 'chemController', data.time));
            // Determine which chemical we are dosing.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            if (typeof this[chemType] === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for the calibration chem dose ${data.chemType}`, 'chemController', data.chemType));
            let chem = this.chem[chemType];
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual dose config not found.`, 'chemController', data.chemType));
            let schem = state.chemControllers.getItemById(this.chem.id, true)[chemType];
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual dose state not found.`, 'chemController', data.chemType));
            // Now we can tell the chemical to dose.
            if (chemType === 'ph') {
                await this.ph.calibrateDoseAsync(schem, time);
            }
            else if (chemType === 'orp') {
                await this.orp.calibrateDoseAsync(schem, time);
            }
        }
        catch (err) { logger.error(`calibrateDoseAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }

    }
    public async manualDoseAsync(data: any) {
        try {
            this.suspendPolling = true;
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
            if (chemType === 'ph') {
                await this.ph.manualDoseVolumeAsync(schem, vol);
            }
            else if (chemType === 'orp') {
                await this.orp.manualDoseVolumeAsync(schem, vol);
            }
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
            if (isNaN(time) || time <= 0) return Promise.reject(new InvalidEquipmentDataError(`Mix time was not supplied for the manual chem mix`, 'chemController', time));
            // Determine which chemical we are dosing.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            if (typeof this[chemType] === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for the manual chem mix ${data.chemType}`, 'chemController', data.chemType));
            let chem = this.chem[chemType];
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual mix config not found.`, 'chemController', data.chemType));
            let schem = state.chemControllers.getItemById(this.chem.id, true)[chemType];
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not initiate ${data.chemType} manual mix state not found.`, 'chemController', data.chemType));
            // Now we can tell the chemical to dose.
            if (chemType === 'ph') await this.ph.mixChemicals(schem, time);
            else if (chemType === 'orp') await this.orp.mixChemicals(schem, time);
        }
        catch (err) { logger.error(`manualMixAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async cancelDosingAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Determine which chemical we are cancelling.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            if (typeof this[chemType] === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for the manual chem dose ${data.chemType}`, 'chemController', data.chemType));
            let chem = this.chem[chemType];
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not cancel ${data.chemType} dose config not found.`, 'chemController', data.chemType));
            let schem = state.chemControllers.getItemById(this.chem.id, true)[chemType];
            if (typeof schem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Could not cancel ${data.chemType} dose state not found.`, 'chemController', data.chemType));
            // Now we can tell the chemical to dose.
            if (chemType === 'ph') await this.ph.cancelDosing(schem, 'cancelled');
            else if (chemType === 'orp') await this.orp.cancelDosing(schem, 'cancelled');
        }
        catch (err) { logger.error(`cancelDosingAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async cancelMixingAsync(data: any) {
        try {
            this.suspendPolling = true;
            // Determine which chemical we are cancelling.  This will be ph or orp.
            let chemType = typeof data.chemType === 'string' ? data.chemType.toLowerCase() : '';
            let schem = state.chemControllers.getItemById(this.chem.id);
            if (chemType === 'ph') await this.ph.cancelMixing(schem.ph);
            else if (chemType === 'orp') await this.orp.cancelMixing(schem.orp);
            else return Promise.reject(new InvalidEquipmentDataError(`A valid Chem type was not supplied for chemical ${data.chemType}`, 'chemController', data.chemType));
        }
        catch (err) { logger.error(`cancelMixingAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async setControllerAsync(data: any) {
        try {
            this.suspendPolling = true;
            let chem = this.chem;
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
            if (typeof data.siCalcType !== 'undefined') schem.siCalcType = chem.siCalcType = data.siCalcType;
            await this.flowSensor.setSensorAsync(data.flowSensor);
            // Alright we are down to the equipment items all validation should have been completed by now.
            // ORP Settings
            await this.orp.setORPAsync(schem.orp, data.orp);
            // Ph Settings
            await this.ph.setPhAsync(schem.ph, data.ph);
            this.processAlarms(schem);
        }
        catch (err) { logger.error(`setControllerAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    public async checkFlowAsync(schem: ChemControllerState): Promise<boolean> {
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
            logger.verbose(`Begin polling Chem Controller ${this.id}`);
            if (this._suspendPolling > 0) logger.warn(`Suspend polling for ${this.chem.name} -> ${this._suspendPolling}`);
            if (this.suspendPolling) return;
            if (this._ispolling) return;
            this._ispolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let schem = state.chemControllers.getItemById(this.chem.id, !this.closing);
            // We need to check on the equipment to make sure it is solid.
            if (sys.board.valueMaps.chemControllerTypes.getName(this.chem.type) === 'rem') {
                if (NixieEquipment.isConnected) {
                    schem.alarms.comms = 0;
                    schem.status = 0;
                    schem.lastComm = new Date().getTime();
                    await this.checkFlowAsync(schem);
                    await this.validateSetupAsync(this.chem, schem);
                    if (this.chem.ph.enabled) await this.ph.probe.setTempCompensationAsync(schem.ph.probe);
                    // Check each piece of equipment to make sure it is doing its thing.
                    schem.calculateSaturationIndex();
                    this.processAlarms(schem);
                    if (state.mode === 0) {
                        if (this.chem.ph.enabled) await this.ph.checkDosing(this.chem, schem.ph);
                        if (this.chem.orp.enabled) await this.orp.checkDosing(this.chem, schem.orp);
                    }
                }
                else
                    logger.warn('REM Server not Connected');
            }
            this._ispolling = false;
        }
        catch (err) { this._ispolling = false; logger.error(`Error polling Chem Controller - ${err}`); }
        finally {
            if (!this.closing && !this._ispolling)
                this._pollTimer = setTimeout(() => { self.pollEquipmentAsync(); }, this.pollingInterval || 10000);
            logger.verbose(`End polling Chem Controller ${this.id}`);
        }
    }
    public processAlarms(schem: ChemControllerState) {
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
            schem.activeBodyId = this.activeBodyId;
            schem.ph.dailyVolumeDosed = schem.ph.calcDoseHistory();
            schem.orp.dailyVolumeDosed = schem.orp.calcDoseHistory();
            let chem = this.chem;
            schem.orp.enabled = this.chem.orp.enabled;
            schem.ph.enabled = this.chem.ph.enabled;
            let probeType = chem.orp.probe.type;
            if (this.chem.orp.enabled) {
                let useChlorinator = chem.orp.useChlorinator;
                let pumpType = chem.orp.pump.type;
                let currLevelPercent = schem.orp.tank.level / schem.orp.tank.capacity * 100;
                if (pumpType !== 0) {
                    if (currLevelPercent <= 0) schem.alarms.orpTank = 64;
                    else schem.alarms.orpTank = schem.orp.tank.alarmEmptyEnabled && currLevelPercent <= schem.orp.tank.alarmEmptyLevel ? 130 : 0;
                }
                else schem.alarms.orpTank = 0;
                // Alright we need to determine whether we need to adjust the volume any so that we get at least 3 seconds out of the pump.
                let padj = this.chem.orp.pump.type > 0 && !this.chem.orp.useChlorinator ? (this.chem.orp.pump.ratedFlow / 60) * 3 : 0;
                if (this.chem.orp.dosingMethod !== 0 && this.chem.orp.maxDailyVolume <= schem.orp.dailyVolumeDosed && !this.chem.orp.useChlorinator) {
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
                    let chlorErr = 0;
                    if (useChlorinator && schem.isBodyOn) {
                        const chlorCollection = sys.chlorinators.getByBody(schem.activeBodyId);
                        if (chlorCollection.length > 0) {
                            for (let chlor of chlorCollection.toArray()) {
                                let schlor = state.chlorinators.getItemById(chlor.id);
                                if (schlor.status & 0xF0) {
                                    chlorErr = 16;
                                    break;
                                }
                            }
                        }
                    }
                    schem.warnings.chlorinatorCommError = chlorErr;
                    schem.warnings.pHLockout = useChlorinator === false && probeType !== 0 && pumpType !== 0 && schem.ph.level >= chem.orp.phLockout ? 1 : 0;
                }
                else {
                    schem.alarms.orp = 0;
                    schem.warnings.chlorinatorCommError = 0;
                    schem.warnings.pHLockout = 0;
                }
                schem.orp.freezeProtect = (state.freeze && chem.orp.disableOnFreeze && schem.isBodyOn);
            }
            else {
                schem.warnings.chlorinatorCommError = 0;
                schem.alarms.orpTank = 0;
                schem.warnings.orpDailyLimitReached = 0;
                // RSG 5-22-22 below block will allow a user to have an orp probe without enabling orp output
                if (probeType !== 0 && chem.orp.tolerance.enabled){
                    schem.alarms.orp = schem.orp.level < chem.orp.tolerance.low ? 16 : schem.orp.level > chem.orp.tolerance.high ? 8 : 0;
                }
                else schem.alarms.orp = 0;
                schem.warnings.pHLockout = 0;
                schem.orp.freezeProtect = false;
            }
            probeType = chem.ph.probe.type;
            if (this.chem.ph.enabled) {
                let pumpType = chem.ph.pump.type;
                let currLevelPercent = schem.ph.tank.level / schem.ph.tank.capacity * 100;
                if (pumpType !== 0) {
                    if (currLevelPercent <= 0) schem.alarms.pHTank = 32;
                    else schem.alarms.pHTank = schem.ph.tank.alarmEmptyEnabled && currLevelPercent <= schem.ph.tank.alarmEmptyLevel ? 129 : 0;
                }
                else schem.alarms.pHTank = 0;
                schem.warnings.pHDailyLimitReached = 0;
                // Alright we need to determine whether we need to adjust the volume any so that we get at least 3 seconds out of the pump.
                let padj = this.chem.ph.pump.type > 0 ? (this.chem.ph.pump.ratedFlow / 60) * 3 : 0;
                if (this.chem.ph.dosingMethod !== 0 && this.chem.ph.maxDailyVolume <= schem.ph.dailyVolumeDosed + padj) {
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
                schem.ph.freezeProtect = (state.freeze && chem.ph.disableOnFreeze && schem.isBodyOn);
            }
            else {
                schem.alarms.pHTank = 0;
                schem.warnings.pHDailyLimitReached = 0;
                // RSG 5-22-22 Below block will allow user to have a pH probe without enabling pH control
                if (probeType !== 0 && chem.ph.tolerance.enabled) {
                    schem.alarms.pH = schem.ph.level < chem.ph.tolerance.low ? 4 : schem.ph.level > chem.ph.tolerance.high ? 2 : 0;
                }
                else schem.alarms.pH = 0;
                schem.ph.freezeProtect = false;
            }
            
            if (chem.lsiRange.enabled) {
                schem.warnings.waterChemistry = schem.saturationIndex < chem.lsiRange.low ? 1 : schem.saturationIndex > chem.lsiRange.high ? 2 : 0;
            }
            else schem.warnings.waterChemistry = 0;

            schem.alarms.freezeProtect = (schem.ph.freezeProtect || schem.orp.freezeProtect) ? sys.board.valueMaps.chemControllerAlarms.getValue('freezeprotect') : 0;
        } catch (err) { logger.error(`Error processing chem controller ${this.chem.name} alarms: ${err.message}`); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(chem: ChemController, schem: ChemControllerState) {
        try {
            // The validation will be different if the body is on or not.  So lets get that information.
            logger.verbose(`Begin validating ${chem.id} - ${chem.name} setup`);
            if (chem.orp.enabled) {
                if (chem.orp.probe.type !== 0) {
                    let type = sys.board.valueMaps.chemORPProbeTypes.transform(chem.orp.probe.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatusAsync(chem.orp.probe.connectionId, chem.orp.probe.deviceBinding);
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
                        let dev = await this.checkHardwareStatusAsync(chem.orp.pump.connectionId, chem.orp.pump.deviceBinding);
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
                        let dev = await this.checkHardwareStatusAsync(chem.ph.probe.connectionId, chem.ph.probe.deviceBinding);
                        schem.alarms.pHProbeFault = dev.hasFault ? 1 : 0;
                    }
                    else schem.alarms.pHProbeFault = 0;
                }
                else schem.alarms.pHProbeFault = 0;
                if (chem.ph.pump.type !== 0) {
                    let type = sys.board.valueMaps.chemPumpTypes.transform(chem.ph.pump.type);
                    if (type.remAddress) {
                        let dev = await this.checkHardwareStatusAsync(chem.ph.pump.connectionId, chem.ph.pump.deviceBinding);
                        schem.alarms.pHPumpFault = dev.hasFault ? 2 : 0;
                    }
                    else schem.alarms.pHPumpFault = 0;
                }
                else schem.alarms.pHPumpFault = 0;
            }
            else schem.alarms.pHPumpFault = schem.alarms.pHPumpFault = 0;
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
                if (schem.alarms.bodyFault !== 0) logger.warn(`Chem controller body calculation invalid ${totalGallons} -> ${chem.body}`);
            }
            schem.alarms.comms = 0;
            logger.verbose(`End validating ${chem.id} - ${chem.name} setup`);

        } catch (err) { logger.error(`Error checking Chem Controller Hardware ${this.chem.name}: ${err.message}`); schem.alarms.comms = 2; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            this.closing = true;
            let schem = state.chemControllers.getItemById(this.chem.id);
            await this.ph.cancelDosing(schem.ph, 'closing');
            await this.orp.cancelDosing(schem.orp, 'closing');
            await this.ph.closeAsync();
            await this.orp.closeAsync();
            schem.emitEquipmentChange();
        }
        catch (err) { logger.error(`ChemController closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
    public syncRemoteREMFeeds(servers) {
        this.ph.probe.syncRemoteREMFeeds(this.chem, servers);
        this.orp.probe.syncRemoteREMFeeds(this.chem, servers);
    }
}
class NixieChemical extends NixieChildEquipment implements INixieChemical {
    public chemical: Chemical;
    public pump: NixieChemPump;
    public chlor: NixieChemChlor;
    public tank: NixieChemTank;
    public _lastOnStatus: number;
    protected _stoppingMix = false;
    protected _suspendPolling: number = 0;
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1)); }
    protected _processingMix = false;
    //public currentDose: ChemicalDoseState;
    public chemType: string;
    public _currentMix: NixieChemMix;
    //public doseHistory: NixieChemDoseLog[] = [];
    protected _mixTimer: NodeJS.Timeout;
    //public get logFilename() { return `chemDosage_unknown.log`; }
    public get chemController(): NixieChemController { return this.getParent() as NixieChemController; }
    public get currentMix(): NixieChemMix { return this._currentMix; }
    public set currentMix(val: NixieChemMix) {
        if (typeof val === 'undefined' && typeof this._currentMix !== 'undefined') logger.debug(`${this.chemical.chemType} mix set to undefined`);
        else logger.debug(`Set new current mix ${this.chemical.chemType}`)
        this._currentMix = val;
    }
    constructor(controller: NixieChemController, chemical: Chemical) {
        super(controller);
        chemical.master = 1;
        this.chemical = chemical;
        this.pump = new NixieChemPump(this, chemical.pump);
        this.tank = new NixieChemTank(this, chemical.tank);
        logger.info(`Nixie Chemical ${chemical.chemType} object created`);
    }
    public async cancelMixing(schem: IChemicalState): Promise<void> {
        try {
            logger.verbose(`Cancelling ${this.chemType} Mix`);
            await this.stopMixing(schem);
        } catch (err) { logger.error(`cancelMixing ${this.chemType}: ${err.message}`); return Promise.reject(err); }
    }
    protected async setHardware(chemical: Chemical, data: any) {
        try {

        }
        catch (err) { return Promise.reject(err); }
    }
    protected async setDosing(chemical: Chemical, data: any): Promise<void> {
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
                chemical.maxDailyVolume = typeof data.maxDailyVolume !== 'undefined' ? typeof data.maxDailyVolume === 'number' ? data.maxDailyVolume : parseInt(data.maxDailyVolume, 10) : chemical.maxDailyVolume;
            }
        } catch (err) { logger.error(`setDosing: ${err.message}`); return Promise.reject(err); }
    }
    protected async setMixing(chemical: Chemical, data: any): Promise<void> {
        try {
            this.suspendPolling = true;
            if (typeof data !== 'undefined') {
                if (typeof data.mixingTimeHours !== 'undefined' || typeof data.mixingTimeMinutes !== 'undefined') {
                    data.mixingTime = (typeof data.mixingTimeHours !== 'undefined' ? parseInt(data.mixingTimeHours, 10) * 3600 : 0) +
                        (typeof data.mixingTimeMinutes !== 'undefined' ? parseInt(data.mixingTimeMinutes, 10) * 60 : 0) +
                        (typeof data.mixingTimeSeconds !== 'undefined' ? parseInt(data.mixingTimeSeconds, 10) : 0);
                }
                chemical.mixingTime = typeof data.mixingTime !== 'undefined' ? parseInt(data.mixingTime, 10) : chemical.mixingTime;
                chemical.flowOnlyMixing = typeof data.flowOnlyMixing !== 'undefined' ? utils.makeBool(data.flowOnlyMixing) : chemical.flowOnlyMixing;
            }
        } catch (err) { logger.error(`setMixing: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
    protected async stopMixing(schem: IChemicalState): Promise<void> {
        try {
            this._stoppingMix = true;
            this.suspendPolling = true;
            if (typeof this.currentMix !== 'undefined') logger.debug(`Stopping ${schem.chemType} mix and clearing the current mix object.`);
            if (typeof this.chemController.orp.orp.useChlorinator !== 'undefined' && this.chemController.orp.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0)
                schem.chlor.isDosing = false;
            else
                schem.pump.isDosing = false;

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
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('monitoring');
                schem.mixTimeRemaining = 0;
                schem.manualMixing = false;
            }
        } catch (err) { logger.error(`Error stopping chemical mix`); return Promise.reject(err); }
        finally { this._stoppingMix = false; this.suspendPolling = false; }
    }
    protected async initMixChemicals(schem: IChemicalState, mixingTime?: number): Promise<void> {
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

                        this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: Math.max(0, this.chemical.mixingTime - schem.mixTimeRemaining) });
                }

                else
                    this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: 0 });
                logger.info(`Chem Controller begin mixing ${schem.chemType} for ${utils.formatDuration(this.currentMix.timeRemaining)} of ${utils.formatDuration(this.currentMix.time)}`)
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
            }
            if (typeof this._mixTimer === 'undefined' || !this._mixTimer) {
                let self = this;
                this._mixTimer = setInterval(async () => { await self.mixChemicals(schem); }, 1000);
                logger.verbose(`Set ${schem.chemType} mix timer`);
            }
        } catch (err) { logger.error(`Error initializing ${schem.chemType} mix: ${err.message}`); }
    }
    public async mixChemicals(schem: IChemicalState, mixingTime?: number): Promise<void> {
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
            if (!this.chemical.enabled) {
                // The chemical is not enabled so we need to ditch the mixing if it is currently underway.
                await this.stopMixing(schem);
                return;
            }

            let dt = new Date().getTime();
            await this.initMixChemicals(schem, mixingTime);
            if (this._stoppingMix) return;
            schem.chlor.isDosing = schem.pump.isDosing = false;
            if (!this.chemical.flowOnlyMixing || (schem.chemController.isBodyOn && this.chemController.flowDetected && !schem.freezeProtect)) {
                if (this.chemType === 'orp' && typeof this.chemController.orp.orp.useChlorinator !== 'undefined' && this.chemController.orp.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0) {
                    if (state.chlorinators.getItemById(this.chlor.id).currentOutput !== 0) {
                        logger.debug(`Chem mixing ORP (chlorinator) paused waiting for chlor current output to be 0%.  Mix time remaining: ${utils.formatDuration(schem.mixTimeRemaining)} `);
                        return;
                    }
                }
                this.currentMix.timeMixed += Math.round((dt - this.currentMix.lastChecked) / 1000);
                // Reflect any changes to the configuration.
                if (!this.currentMix.isManual) { this.currentMix.time = this.chemical.mixingTime; }
                schem.mixTimeRemaining = Math.round(this.currentMix.timeRemaining);
                logger.verbose(`Chem mixing ${schem.chemType} remaining: ${utils.formatDuration(schem.mixTimeRemaining)}`);
            }
            else
                logger.verbose(`Chem ${schem.chemType} mixing paused because body is not on.`);
            this.currentMix.lastChecked = dt;
            if (schem.mixTimeRemaining <= 0) {
                logger.info(`Chem Controller ${schem.chemType} mixing Complete after ${utils.formatDuration(this.currentMix.timeMixed)}`);
                await this.stopMixing(schem);
            }
            else {
                schem.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.getValue('mixing');
            }
        } catch (err) { logger.error(`Error mixing chemicals: ${err.message}`); }
        finally {
            this._processingMix = false;
            setImmediate(() => {
                schem.chemController.emitEquipmentChange();
            });
        }
    }
    public async initDose(schem: IChemicalState) { }
    public async closeAsync() {
        try {
            // We are only killing the mix timer here so when njsPC is restarted it picks up where
            // it left off with mixing.
            if (typeof this._mixTimer !== 'undefined') clearInterval(this._mixTimer);
            this._mixTimer = undefined;
            await super.closeAsync();
        }
        catch (err) { logger.error(`chemController closeAsync ${err.message}`); return Promise.reject(err); }
    }
    public async cancelDosing(schem: IChemicalState, reason: string): Promise<void> {
        try {
            if (typeof this.chemController.orp.orp.useChlorinator !== 'undefined' && this.chemController.orp.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0) {
                if (!this.chlor.chlor.superChlor) await this.chlor.stopDosing(schem, reason);
                // for chlor, we want 15 minute intervals
                if (schem.doseHistory.length) {
                    // if last dose was within 15 minutes, set mix time to 15 mins-lastdose
                    // if no dose in last 15, then we should be monitoring
                    let lastDoseTime = schem.doseHistory[0].timeDosed;
                    let mixTime = Math.min(Math.max(this.chlor.chlorInterval * 60 - lastDoseTime, 0), this.chlor.chlorInterval * 60);
                    if (schem.dosingStatus === 0) await this.mixChemicals(schem, mixTime);
                }
                else
                    if (schem.dosingStatus === 0) await this.mixChemicals(schem);
            }
            else {
                // Just stop the pump for now but we will do some logging later.
                if (schem.dosingStatus === 0) await this.mixChemicals(schem);
            }
        } catch (err) { logger.error(`cancelDosing: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieChemTank extends NixieChildEquipment {
    public tank: ChemicalTank;
    constructor(chemical: INixieChemical, tank: ChemicalTank) {
        super(chemical);
        this.tank = tank;
        tank.master = 1;
    }
    public async setTankAsync(stank: ChemicalTankState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                stank.level = typeof data.level !== 'undefined' ? parseFloat(data.level) : stank.level;
                stank.capacity = this.tank.capacity = typeof data.capacity !== 'undefined' ? parseFloat(data.capacity) : this.tank.capacity;
                stank.units = this.tank.units = typeof data.units !== 'undefined' ? sys.board.valueMaps.volumeUnits.encode(data.units) : this.tank.units;
                stank.alarmEmptyEnabled = this.tank.alarmEmptyEnabled = typeof data.alarmEmptyEnabled !== 'undefined' ? data.alarmEmptyEnabled : this.tank.alarmEmptyEnabled;
                stank.alarmEmptyLevel = this.tank.alarmEmptyLevel = typeof data.alarmEmptyLevel !== 'undefined' ? data.alarmEmptyLevel : this.tank.alarmEmptyLevel;
            }
        }
        catch (err) { logger.error(`setTankAsync: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieChemMix {
    public time: number;
    public timeMixed: number = 0;
    public schem: ChemicalState;
    public lastChecked: number = new Date().getTime();
    public isManual: boolean = false;
    public get timeRemaining(): number { return Math.max(0, this.time - this.timeMixed); }
    public set(obj: any) {
        if (typeof obj.time === 'number') this.time = obj.time;
        if (typeof obj.timeMixed === 'number') this.timeMixed = obj.timeMixed;
        if (typeof obj.schem !== 'undefined') this.schem = obj.schem;
        if (typeof obj.isManual !== 'undefined') this.isManual = utils.makeBool(obj.isManual);
    }
}
export class NixieChemPump extends NixieChildEquipment {
    public pump: ChemicalPump;
    public isOn: boolean;
    public _lastOnStatus: number;
    protected _dosingTimer: NodeJS.Timeout;
    private _isStopping = false;
    constructor(chemical: INixieChemical, pump: ChemicalPump) { super(chemical); this.pump = pump; }
    public get chemical(): INixieChemical { return this.getParent() as INixieChemical; }
    public async setPumpAsync(spump: ChemicalPumpState, data: any): Promise<void> {
        try {
            if (typeof data !== 'undefined') {
                //this.pump.enabled = typeof data.enabled !== 'undefined' ? data.enabled : this.pump.enabled;
                this.pump.type = typeof data.type !== 'undefined' ? data.type : this.pump.type;
                this.pump.enabled = this.pump.type !== 0;
                this.pump.ratedFlow = typeof data.ratedFlow !== 'undefined' ? data.ratedFlow : this.pump.ratedFlow;
                this.pump.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : this.pump.connectionId;
                this.pump.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : this.pump.deviceBinding;
                let type = sys.board.valueMaps.chemPumpTypes.getName(this.pump.type);
                if (this.pump.type === 'ezo-pmp') {
                    // Now we need to ask for the pump attributes


                }
            }
        } catch (err) { logger.error(`setPumpAsync: ${err.message}`); return Promise.reject(err); }

    }
    public async stopDosing(schem: IChemicalState, reason: string): Promise<void> {
        try {
            logger.debug(`Stopping ${schem.chemType} pump: ${reason}`);
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
            }
            if (this._isStopping) {
                logger.warn('Trying to stop dosing pump but it has not yet responded.');
                return;  // We have to semaphore here just in case the pump is not stopping as we would like.
            }
            this._isStopping = true;
            let dose = schem.currentDose;
            if (this.pump.type !== 0) await this.turnOff(schem);
            if (typeof dose !== 'undefined') {
                schem.endDose(new Date(), reason);
                schem.manualDosing = false;
                schem.dosingTimeRemaining = 0;
                schem.dosingVolumeRemaining = 0;
                schem.volumeDosed = 0;
                schem.timeDosed = 0;
            }
        } catch (err) { logger.error(`Error stopping ${schem.chemType} dosing: ${err.message}`); return Promise.reject(err); }
        finally { this._isStopping = false; }
    }
    public async dose(schem: IChemicalState): Promise<void> {
        let self = this;
        let dose: ChemicalDoseState = schem.currentDose;
        try {
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
            }
            if (typeof dose === 'undefined') {
                await this.chemical.cancelDosing(schem, 'undefined dose');
                return;
            }

            let type = sys.board.valueMaps.chemPumpTypes.getName(this.pump.type);
            if (type === 'none') {
                // We aren't going to do anything.
                logger.verbose(`Chem pump dose ignore pump ${type}`);
            }
            else if (type === 'relay' || type == 'ezo-pmp') {
                if (dose.method === 'calibration') {
                    //if (dose.time - (dose._timeDosed / 1000) > 0) {
                    if (dose.timeRemaining > 0) {
                        logger.verbose(`Sending command to activate chem pump...`);
                        let res = await this.turnOn(schem, 3000);
                        if (typeof res.status === 'undefined' || res.status.code !== 200) {
                            let status = res.status || { code: res.status.code, message: res.status.message };
                            logger.error(`Chem pump could not activate pump ${status.code}: ${status.message}`);
                        }
                        let relay = res.obj;
                        try {
                            logger.verbose(`Chem pump response ${JSON.stringify(relay)}`);
                        } catch (err) { logger.error(`Invalid chem pump response`); }
                        if (typeof dose._lastLatch !== 'undefined') {
                            let time = new Date().getTime() - (dose._lastLatch || new Date().getTime());
                            // Run our math out to 7 sig figs to keep in the ballpark for very slow pumps.
                            let vol = Math.round((this.pump.ratedFlow * (time / 1000) / 60) * 1000000) / 1000000;
                            schem.appendDose(0, time);
                            if (schem.tank.units > 0) {
                                let lvl = schem.tank.level - utils.convert.volume.convertUnits(vol, 'mL', sys.board.valueMaps.volumeUnits.getName(schem.tank.units));
                                schem.tank.level = Math.max(0, lvl);
                            }
                        }
                        logger.info(`Chem Controller calibrating ${dose.chem} ${utils.formatDuration(dose.timeRemaining)} remaining`);
                        dose._lastLatch = new Date().getTime();
                        schem.pump.isDosing = this.isOn = relay.state;
                        schem.dosingStatus = 0;
                    }
                    else {
                        dose._timeDosed = dose.time * 1000;
                        await this.turnOff(schem);
                        await this.chemical.cancelDosing(schem, 'complete');
                    }
                }
                else {
                    // We are a relay pump so we need to turn on the pump for a timed interval
                    // then check it on each iteration.  If the pump does not receive a request
                    // from us then the relay will turn off.
                    await this.chemical.chemController.processAlarms(schem.chemController);
                    let isBodyOn = schem.chemController.flowDetected;
                    await this.chemical.initDose(schem);
                    let delay = 0;
                    // Check to see if we are in delay.  The start delay for the configuration is in minutes.
                    if (isBodyOn && !schem.freezeProtect) {
                        // The remaining delay = delay time - (current time - on time).
                        let timeElapsed = new Date().getTime() - this.chemical.chemController.bodyOnTime;
                        delay = Math.max(0, ((this.chemical.chemical.startDelay * 60) * 1000) - timeElapsed);
                        schem.delayTimeRemaining = Math.max(0, Math.round(delay / 1000));
                        if (delay > 0) {
                            if (!schem.flowDelay) logger.info(`Chem Controller delay dosing for ${utils.formatDuration(delay / 1000)}`)
                            else logger.verbose(`Chem pump delay dosing for ${utils.formatDuration(delay / 1000)}`);
                            schem.flowDelay = true;
                        }
                        else {
                            schem.flowDelay = false;
                        }
                    }
                    // Send a request to latch the relay for 3 seconds.  If we don't send another request within 3 seconds of the latch
                    // expiring it will turn the relay back off again. This makes sure we don't leave the pump running on failure.
                    //console.log({ status: dosage.schem.dosingStatus, time: dosage.time, timeDosed: dosage.timeDosed / 1000, volume: dosage.volume, volumeDosed: dosage.volumeDosed });
                    if (!isBodyOn) {
                        // Make sure the pump is off.
                        logger.info(`Chem pump flow not detected. Body is not running.`);
                        // We originally thought that we could wait to turn the dosing on but instead we will cancel the dose.  This will allow
                        // the chlorinator to work more smoothly.
                        await this.chemical.cancelDosing(schem, 'no flow');
                    }
                    else if (schem.freezeProtect) {
                        logger.info(`Chem pump freeze protection`);
                        // We originally thought that we could wait to turn the dosing on but instead we will cancel the dose.  This will allow
                        // the chlorinator to work more smoothly.
                        await this.chemical.cancelDosing(schem, 'freeze');
                    }
                    else if (schem.tank.level <= 0) {
                        logger.info(`Chem tank ran dry with ${schem.currentDose.volumeRemaining}mL remaining`);
                        await this.chemical.cancelDosing(schem, 'empty tank');
                    }
                    else if (dose.timeRemaining <= 0 || dose.volumeRemaining <= 0) {
                        logger.info(`Dose completed ${dose.volumeDosed}mL ${dose.timeRemaining} ${dose.volumeRemaining}`);
                        await this.chemical.cancelDosing(schem, 'completed');
                    }
                    else if (dose.timeRemaining > 0 && dose.volumeRemaining > 0) { // We are actually dosing here
                        if (delay <= 0) {
                            logger.verbose(`Sending command to activate chem pump...`);
                            let res = await this.turnOn(schem, 3000);
                            if (typeof res.status === 'undefined' || res.status.code !== 200) {
                                let status = res.status || { code: res.status.code, message: res.status.message };
                                logger.error(`Chem pump could not activate relay ${status.code}: ${status.message}`);
                            }
                            let relay = res.obj;
                            try {
                                logger.verbose(`Chem pump response ${JSON.stringify(relay)}`);
                            } catch (err) { logger.error(`Invalid chem pump response`); }
                            if (typeof dose._lastLatch !== 'undefined') {
                                let time = new Date().getTime() - (dose._lastLatch || new Date().getTime());
                                // Run our math out to 7 sig figs to keep in the ballpark for very slow pumps.
                                let vol = Math.round((this.pump.ratedFlow * (time / 1000) / 60) * 1000000) / 1000000;
                                schem.appendDose(vol, time);
                                if (schem.tank.units > 0) {
                                    let lvl = schem.tank.level - utils.convert.volume.convertUnits(vol, 'mL', sys.board.valueMaps.volumeUnits.getName(schem.tank.units));
                                    schem.tank.level = Math.max(0, lvl);
                                }
                            }
                            logger.info(`Chem Controller dosed ${dose.chem} ${dose.volumeDosed.toFixed(2)}mL of ${dose.volume}mL ${utils.formatDuration(dose.timeRemaining)} remaining`);
                            dose._lastLatch = new Date().getTime();
                            schem.pump.isDosing = this.isOn = relay.state;
                        }
                        else {
                            await this.turnOff(schem);
                        }
                        schem.dosingStatus = 0;
                    }
                    else {
                        await this.chemical.cancelDosing(schem, 'unknown cancel');
                    }
                }
            }
            // Check to see if we reached our max dosing time or volume or the tank is empty mix it up.
            let status = schem.dosingStatus;
            if (status === 0 && dose.method !== 'calibration') {
                let chem = this.chemical.chemical;
                if (chem.dosingMethod === 1 && chem.maxDosingTime < (dose._timeDosed / 1000))
                    await this.chemical.cancelDosing(schem, 'completed');
                if (chem.dosingMethod === 2 && chem.maxDosingVolume < dose.volumeDosed)
                    await this.chemical.cancelDosing(schem, 'completed');
                if (schem.tank.level <= 0)
                    await this.chemical.cancelDosing(schem, 'empty tank');
            }
            //dosage.schem.dosingStatus = status;
            return;
        } catch (err) {
            // If we have an error then we want to clear the latch time.  Theoretically we could add 3 seconds of latch time but who knows when the failure
            // actually occurred.
            if (typeof dose !== 'undefined') dose._lastLatch = undefined;
            logger.error(`chemController.pump dose: ${err.message}`);
            return Promise.reject(err);
        }
        finally {
            schem.chemController.emitEquipmentChange();
            // Add a check to tell the chem when we are done.
            if (schem.dosingStatus === 0) {
                this._dosingTimer = setTimeout(async () => {
                    try {
                        await self.dose(schem);
                    }
                    catch (err) {
                        logger.error(`self.dose error in finally: ${err.message}`);
                        //return Promise.reject(err); // this isn't a promise we should be returning
                    }
                }, 1000);
            }
            else {
                // Tell whichever chemical we are dealing with to begin mixing.
                if (typeof dose !== 'undefined') {
                    try {
                        await this.chemical.cancelDosing(schem, 'completed');
                    }
                    catch (err) {
                        logger.error(`this.chemical.cancelDosing error in finally: ${err.message}`);
                    }
                    schem.pump.isDosing = this.isOn = false;
                    schem.manualDosing = false;
                }
            }
        }
    }
    public async turnOff(schem: IChemicalState): Promise<InterfaceServerResponse> {
        try {
            // We need to be turning this pig off.  If the REM service has been interrupted
            // then we will assume that the relay is off since any request to turn it on will be based upon
            // the idea that the socket remains open.  If it fails then it will have gone off.  If we are talking
            // about an EZO pump all the values are maintained anyway through the state settings.
            let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, { state: false });
            this.isOn = schem.pump.isDosing = false;
            return res;
        }
        catch (err) { logger.error(`chemController.pump.turnOff: ${err.message}`); return Promise.reject(err); }
    }
    public async turnOn(schem: IChemicalState, latchTimeout?: number): Promise<InterfaceServerResponse> {
        try {
            let res = await NixieEquipment.putDeviceService(this.pump.connectionId, `/state/device/${this.pump.deviceBinding}`, typeof latchTimeout !== 'undefined' ? { isOn: true, latch: latchTimeout } : { isOn: true });
            this.isOn = schem.pump.isDosing = true;
            return res;
        }
        catch (err) { logger.error(`chemController.pump.turnOn: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieChemChlor extends NixieChildEquipment {
    public get chlor(): Chlorinator { return sys.chlorinators.getItemById((this.getParent() as NixieChemicalORP).orp.chlorId); }
    public isOn: boolean; // can this just be chlor.isOn?
    public _lastOnStatus: number;
    protected _dosingTimer: NodeJS.Timeout;
    private _isStopping = false;
    public chlorInterval = 15;
    // constructor(chemical: NixieChemical, chlor: ChemicalChlor) { super(chemical); this.chlor = chlor; }
    constructor(chemical: NixieChemical) { super(chemical); }
    public get chemical(): NixieChemical { return this.getParent() as NixieChemical; }
    public async setChlorAsync(schlor: ChemicalChlorState, data: any) {
        try {
            if (typeof data.chlorDosingMethod !== 'undefined' && data.chlorDosingMethod === 0) {
                if (schlor.chemical.dosingStatus === 0) { await this.chemical.cancelDosing(schlor.chemController.orp, 'dosing method changed'); }
                if (schlor.chemical.dosingStatus === 1) { await this.chemical.cancelMixing(schlor.chemController.orp); }
                let chlor = sys.chlorinators.getItemById((this.getParent() as NixieChemicalORP).orp.chlorId);
                chlor.disabled = false;
                chlor.isDosing = false;
            }
            let c = sys.chlorinators.toArray
        } catch (err) { logger.error(`setChlorAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async stopDosing(schem: IChemicalState, reason: string): Promise<void> {
        try {
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
            }
            if (this._isStopping) {
                logger.warn('Trying to stop dosing chlor but it has not yet responded.');
                return Promise.reject(new EquipmentTimeoutError(`Already trying to stop chlor dosing.`, `chlorStopDosingInProgress`));
                // return false;  // We have to semaphore here just in case the chlor is not stopping as we would like.
            }
            logger.debug(`Stopping chlorinating: ${reason}`);
            this._isStopping = true;
            let dose = schem.currentDose;
            await this.turnOff(schem);
            if (typeof dose !== 'undefined') {
                schem.endDose();
                schem.manualDosing = false;
                schem.dosingTimeRemaining = 0;
                schem.dosingVolumeRemaining = 0;
                schem.volumeDosed = 0;
            }
        } catch (err) { logger.error(`Error stopping ${schem.chemType} dosing: ${err.message}`); return Promise.reject(err); }
        finally { this._isStopping = false; }
    }
    public async dose(schem: ChemicalState): Promise<void> {
        let self = this;
        let dose: ChemicalDoseState = schem.currentDose;
        try {
            if (this._dosingTimer) {
                clearTimeout(this._dosingTimer);
                this._dosingTimer = undefined;
            }
            if (typeof dose === 'undefined') {
                await this.chemical.cancelDosing(schem, 'undefined dose');
                return;
            }
            let chlor = sys.chlorinators.getItemById((this.getParent() as NixieChemicalORP).orp.chlorId);
            if (chlor.ratedLbs === 0) {
                // We aren't going to do anything.
                logger.verbose(`Chem dose ignore chlor because it doesn't have a dosing rating.`);
            }
            else {
                await this.chemical.chemController.processAlarms(schem.chemController);
                let isBodyOn = schem.chemController.flowDetected;
                await this.chemical.initDose(schem);
                let chemController = schem.getParent()
                let schlor = state.chlorinators.getItemById(chlor.id);
                if (!isBodyOn) {
                    // Make sure the chlor is off.
                    logger.info(`Chem chlor flow not detected. Body is not running.`);
                    await this.chemical.cancelDosing(schem, 'no flow');
                }

                else if (chemController.ph.enabled && chemController.ph.pump.isDosing && chemController.ph.dosePriority) {
                    // If ph has dose priority and is dosing, we shouldn't be continuing here
                    let chem = sys.chemControllers.getItemById(chemController.id, false);
                    if (chem.ph.dosePriority)
                        await this.chemical.cancelDosing(schem, 'ph dose priority');
                }
                else if (chlor.superChlor) {
                    // if superchlor is active, it may be to boost the ORP and we should respect that
                    await this.chemical.cancelDosing(schem, 'superchlor');
                }
                else if (dose.timeRemaining <= 0 || dose.volumeRemaining <= 0) {
                    logger.info(`Dose completed ${dose.volumeDosed}lbs ${dose.timeRemaining} ${dose.volumeRemaining}`);
                    await this.chemical.cancelDosing(schem, 'completed');
                }
                else if (dose.timeRemaining > 0 && dose.volumeRemaining > 0) { // We are actually dosing here
                    try {
                        await this.turnOn(schem);
                        if (schlor.currentOutput !== 100) {
                            logger.silly(`Chlor dose not added because current output is not 100%`);
                        }
                        else {
                            if (typeof dose._lastLatch !== 'undefined') {
                                let time = new Date().getTime() - (dose._lastLatch || new Date().getTime());
                                let vol = chlor.ratedLbs * time / 1000;
                                schem.appendDose(vol, time);
                            }
                            logger.info(`Chem Controller ${dose.chem} chlorinated ${Math.round(dose.volumeDosed * 1000000) / 1000000}lbs of ${Math.round(dose.volume * 1000000) / 1000000}lbs - ${utils.formatDuration(dose.timeRemaining)} remaining`);
                            dose._lastLatch = new Date().getTime();
                        }
                    }
                    catch (err) {
                        logger.error(`Error starting chlorination: ${err}.`)
                    }
                    // if we don't reach the chlorinator, we still want to be in dosing status
                    schem.dosingStatus = 0;
                }
                else {
                    await this.chemical.cancelDosing(schem, 'unknown cancel');
                }
                return;
            }
        } catch (err) {
            logger.error(`chemController.chlor dose: ${err.message}`);
            return Promise.reject(err);
        }
        finally {
            schem.chemController.emitEquipmentChange();
            // Add a check to tell the chem when we are done.
            if (schem.dosingStatus === 0) {
                this._dosingTimer = setTimeout(async () => {
                    try { await self.dose(schem); }
                    catch (err) {
                        logger.error(`Chem dosing error: ${err.message}`);
                        // return Promise.reject(err); // should not be returning a promise in a finally 
                    }
                }, 1000);
            }
            else {
                // Tell whichever chemical we are dealing with to begin mixing.
                if (typeof dose !== 'undefined') {
                    await this.chemical.cancelDosing(schem, 'completed');
                    schem.chlor.isDosing = this.isOn = false;
                    // schem.manualDosing = false;
                }
            }
        }
    }
    public async turnOff(schem: IChemicalState): Promise<ChlorinatorState> {
        try {
            //logger.info(`Turning off the chlorinator`);
            let chemORP = this.getParent() as NixieChemicalORP;
            let chlor = sys.chlorinators.getItemById(chemORP.orp.chlorId);
            let schlor = state.chlorinators.getItemById(chlor.id);
            if (schlor.currentOutput === 0 && schlor.targetOutput === 0 && !schlor.superChlor && chlor.disabled && !chlor.isDosing) {
                this.isOn = schem.chlor.isDosing = false;
                return schlor;
            }
            let cstate = await sys.board.chlorinator.setChlorAsync({
                id: chlor.id,
                disabled: true,
                isDosing: false
            })
            this.isOn = schem.chlor.isDosing = false;
            return cstate;
        }
        catch (err) { logger.error(`chemController.chlor.turnOff: ${err.message}`); return Promise.reject(err); }
    }
    public async turnOn(schem: ChemicalState, latchTimeout?: number): Promise<ChlorinatorState> {
        try {
            let chemORP = this.getParent() as NixieChemicalORP;
            let chlor = sys.chlorinators.getItemById(chemORP.orp.chlorId);
            let schlor = state.chlorinators.getItemById(chlor.id);
            if (schlor.currentOutput === 100 && schlor.targetOutput === 100 && !schlor.superChlor && !chlor.disabled && chlor.isDosing) {
                this.isOn = schem.chlor.isDosing = true;
                return schlor;
            }
            let cstate = await sys.board.chlorinator.setChlorAsync({
                id: chlor.id,
                disabled: false,
                isDosing: true
            })
            this.isOn = schem.chlor.isDosing = true;
            return cstate;
        }
        catch (err) { logger.error(`chemController.chlor.turnOn: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieChemicalPh extends NixieChemical {
    public get ph(): ChemicalPh { return this.chemical as ChemicalPh; }
    public probe: NixieChemProbePh;
    public mixStart: Date;
    public doseStart: Date;
    public get logFilename() { return `chemDosage_${(this.chemical as ChemicalPh).phSupply === 1 ? 'acid' : 'base'}.log`; }
    constructor(controller: NixieChemController, chemical: ChemicalPh) {
        super(controller, chemical);
        this.chemType = 'acid';
        this.probe = new NixieChemProbePh(this, chemical.probe);
        let sph = state.chemControllers.getItemById(controller.id).ph;
        if (!this.ph.enabled || !this.ph.pump.enabled) {
            this.ph.doserType = 0;
            sph.chemType = 'none';
        }
        else {
            this.ph.doserType = 1; // External Relay
            sph.chemType = (this.ph.phSupply === 0) ? 'base' : 'acid';
        }
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
                this.ph.disableOnFreeze = typeof data.disableOnFreeze !== 'undefined' ? utils.makeBool(data.disableOnFreeze) : this.ph.disableOnFreeze;
                if (!this.ph.disableOnFreeze) sph.freezeProtect = false;
                if (!this.ph.enabled || !this.ph.pump.enabled) {
                    this.ph.doserType = 0;
                    sph.chemType = 'none';
                }
                else {
                    this.ph.doserType = 1; // External Relay
                    sph.chemType = (this.ph.phSupply === 0) ? 'base' : 'acid';
                }

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
                                if (!chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true, isDosing: false });
                            }
                            // If we are currently dosing ORP then we need to stop that because pH is currently dosing.
                            if (sorp.pump.isDosing || sorp.chlor.isDosing) await this.chemController.orp.cancelDosing(sorp, 'pH priority');
                        }
                        this.ph.dosePriority = b;
                    }

                }
            }
        }
        catch (err) { logger.error(`chemController setPhAysnc.: ${err.message}`); return Promise.reject(err); }
    }
    public async checkDosing(chem: ChemController, sph: ChemicalPhState) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            logger.debug(`Begin check ${sph.chemType} dosing status = ${status}`);
            let demand = sph.calcDemand(chem);
            sph.demand = Math.max(demand, 0);
            if (!chem.ph.enabled) {
                await this.cancelDosing(sph, 'disabled');
                return;
            }
            if (sph.suspendDosing) {
                // Kill off the dosing and make sure the pump isn't running.  Let's force the issue here.
                await this.cancelDosing(sph, 'suspended');
                return;
            }
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof sph.currentDose !== 'undefined') logger.error('Somehow we made it to monitoring and still have a current dose');
                sph.currentDose = undefined;
                sph.manualDosing = false;
                sph.dosingVolumeRemaining = 0;
                sph.dosingTimeRemaining = 0;
                if (typeof this.currentMix !== 'undefined') {
                    if (ncp.chemControllers.length > 1) {
                        let arrIds = [];
                        for (let i = 0; i < ncp.chemControllers.length; i++) {
                            arrIds.push(ncp[i].id);
                        }
                        logger.info(`More than one NixieChemController object was found ${JSON.stringify(arrIds)}`);
                    }
                    logger.debug(`We are now monitoring and have a mixing object`);
                    await this.stopMixing(sph);
                }
                await this.cancelDosing(sph, 'monitoring');
            }
            if (status === 'mixing') {
                await this.cancelDosing(sph, 'mixing');
                if (typeof this.currentMix === 'undefined') {
                    // First lets check to see how many chem controllers we have.
                    // RKS: Keep this case around in case there is another Moby Dick and Nixie has an orphan out there.
                    //if (ncp.chemControllers.length > 1) {
                    //    let arrIds = [];
                    //    for (let i = 0; i < ncp.chemControllers.length; i++) {
                    //        arrIds.push(ncp[i].id);
                    //    }
                    //    logger.info(`More than one NixieChemController object was found ${JSON.stringify(arrIds)}`);
                    //}
                    logger.info(`Current ${sph.chemType} mix object not defined initializing mix`);
                    await this.mixChemicals(sph);
                }
            }
            else if (sph.manualDosing) {
                // We are manually dosing.  We are not going to dynamically change the dose.
                if (typeof sph.currentDose === 'undefined') {
                    // This will only happen when njspc is killed in the middle of a dose.  Unlike IntelliChem we will pick that back up.
                    // Unfortunately we will lose the original start date but who cares as the volumes should remain the same.
                    let volume = sph.volumeDosed + sph.dosingVolumeRemaining;
                    let time = sph.timeDosed + sph.dosingTimeRemaining;
                    sph.startDose(new Timestamp().addSeconds(-sph.doseTime).toDate(), 'manual', volume, sph.dosingVolumeRemaining, time * 1000, sph.doseTime * 1000);
                }
                if (sph.tank.level > 0) {
                    logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                    await this.stopMixing(sph);
                    await this.pump.dose(sph);
                }
                else {
                    if (typeof sph.currentDose !== 'undefined' && sph.currentDose.method === 'calibration') { }
                    else await this.cancelDosing(sph, 'empty tank');
                }
            }
            else if (sph.dailyLimitReached) {
                await this.cancelDosing(sph, 'daily limit');
            }
            else if (status === 'monitoring' || status === 'dosing') {
                // Figure out what mode we are in and what mode we should be in.
                //sph.level = 7.61;
                // Check the setpoint and the current level to see if we need to dose.
                if (!sph.chemController.isBodyOn)
                    await this.cancelDosing(sph, 'body off');
                else if (sph.freezeProtect)
                    await this.cancelDosing(sph, 'freeze');
                else if (!sph.chemController.flowDetected)
                    await this.cancelDosing(sph, 'no flow');
                else if (demand <= 0)
                    await this.cancelDosing(sph, 'setpoint reached');
                else if (demand > 0) {
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
                    if (typeof sph.currentDose === 'undefined' && sph.tank.level > 0) {
                        // We will include this with the dose demand because our limits may reduce it.
                        //dosage.demand = demand;
                        if (sph.dosingStatus === 0) { // 0 is dosing.
                            // We need to finish off a dose that was interrupted by regular programming.  This occurs
                            // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                            // mixing before we will never get here.
                            logger.info(`Continuing a previous new acid dose ${sph.doseVolume}mL`);
                            sph.startDose(new Timestamp().addSeconds(-sph.doseTime).toDate(), 'auto', sph.doseVolume + sph.dosingVolumeRemaining, sph.doseVolume, (sph.doseTime + sph.dosingTimeRemaining) * 1000, sph.doseTime * 1000);
                        }
                        else {
                            logger.info(`Starting a new acid dose ${dose}mL`);
                            sph.startDose(new Date(), 'auto', dose, 0, time, 0);
                        }
                    }
                    // Now let's determine what we need to do with our pump to satisfy our acid demand.
                    if (sph.tank.level > 0) {
                        logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                        await this.pump.dose(sph);
                    }
                    else {
                        logger.warn(`Chem acid NOT dosed because tank level is level ${sph.tank.level}.`);
                        await this.cancelDosing(sph, 'empty tank');
                    }
                }
            }
        }
        catch (err) { logger.error(`Error checking for dosing: ${err.message}`); return Promise.reject(err); }
        finally {
            logger.debug(`End check ${sph.chemType} dosing status = ${sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus)}`);
        }
    }
    public async cancelDosing(sph: ChemicalPhState, reason: string) {
        try {
            // Just stop the pump for now but we will do some logging later.
            await this.pump.stopDosing(sph, reason);
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
            if (typeof sph.currentDose !== 'undefined') sph.endDose(new Date(), 'cancelled');
        } catch (err) { logger.error(`cancelDosing pH: ${err.message}`); return Promise.reject(err); }
    }
    public async calibrateDoseAsync(sph: ChemicalPhState, time: number) {
        try {
            logger.debug(`Starting manual ${sph.chemType} dose for ${time}seconds`);
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof sph.currentDose !== 'undefined') await this.cancelDosing(sph, 'manual cancel');
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(sph);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sph);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sph, 'manual cancel');
            }
            //if (sph.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ${sph.chemType} tank is empty`, 'chemical', sph));
            let pump = this.pump.pump;
            let volume = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : time * (pump.ratedFlow / 60);
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose current: ${sph.level} setpoint: ${this.ph.setpoint} time:${time} seconds`);
            sph.demand = sph.calcDemand(this.chemController.chem);
            sph.manualDosing = true;
            sph.startDose(new Date(), 'calibration', -1, 0, time);
            logger.verbose(`Chem acid manual calibration dose activate pump`);
            await this.pump.dose(sph);
        }
        catch (err) { logger.error(`calibrateDoseAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async manualDoseVolumeAsync(sph: ChemicalPhState, volume: number) {
        try {
            logger.debug(`Starting manual ${sph.chemType} dose of ${volume}mL`);
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sph.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof sph.currentDose !== 'undefined') await this.cancelDosing(sph, 'manual cancel');
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(sph);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sph);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sph, 'manual cancel');
            }
            if (sph.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ${sph.chemType} tank is empty`, 'chemical', sph));
            let pump = this.pump.pump;
            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(volume / (pump.ratedFlow / 60));
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose current: ${sph.level} setpoint: ${this.ph.setpoint} volume:${volume}`);
            sph.demand = sph.calcDemand(this.chemController.chem);
            sph.manualDosing = true;
            sph.startDose(new Date(), 'manual', volume, 0, time);
            if (sph.tank.level > 0) {
                logger.verbose(`Chem acid manual dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                await this.pump.dose(sph);
            }
        }
        catch (err) { logger.error(`manualDoseVolumeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initDose(sph: ChemicalPhState) {
        try {
            // We need to do a couple of things here.  First we should disable the chlorinator.
            if (this.ph.dosePriority) {
                let chlors = sys.chlorinators.getByBody(this.chemController.chem.body);
                for (let i = 0; i < chlors.length; i++) {
                    let chlor = chlors.getItemByIndex(i);
                    if (!chlor.disabled) await sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                }
                // Now we need to stop dosing on orp but I don't want to hold on to the state object so get it from weak references.
                let schem = sph.chemController;
                if (schem.orp.pump.isDosing) await this.chemController.orp.cancelDosing(schem.orp, 'pH priority');
            }
        }
        catch (err) { logger.error(`initDose: ${err.message}`); return Promise.reject(err); }
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
        // this.chlor = new NixieChemChlor(this, chemical.chlor);
        this.chlor = new NixieChemChlor(this);
        let sorp = state.chemControllers.getItemById(controller.id).orp;
        if (!this.orp.enabled) {
            this.orp.doserType = 0;
            sorp.chemType = 'none';
        }
        else if (this.orp.useChlorinator) {
            this.orp.doserType = 2;
            sorp.chemType = 'chlorine';
        }
        else if (this.orp.pump.enabled) {
            this.orp.doserType = 1;
            sorp.chemType = 'chlorine';
        }
        else {
            this.orp.doserType = 0;
            sorp.chemType = 'none';
        }
    }
    public get logFilename() { return `chemDosage_orp.log`; }
    public async setORPAsync(sorp: ChemicalORPState, data: any) {
        try {
            if (typeof data !== 'undefined') {
                this.orp.useChlorinator = typeof data.useChlorinator !== 'undefined' ? utils.makeBool(data.useChlorinator) : this.orp.useChlorinator;
                if (this.orp.useChlorinator) {
                    if (typeof data.chlorId === 'undefined') {
                        return Promise.reject(new InvalidEquipmentDataError(`Chlorinator ID must be provided when useChlorinator is true`, 'chemController', data.chlorId));
                    }
                    let chlor = sys.chlorinators.getItemById(data.chlorId);
                    if (typeof chlor === 'undefined') {
                        return Promise.reject(new InvalidEquipmentDataError(`Chlorinator with ID ${data.chlorId} not found`, 'chemController', data.chlorId));
                    }
                    if (chlor.body !== this.chemController.chem.body && chlor.body !== 32) {
                        return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body does not match the chem controller body`, 'chemController', data.chlorId));
                    }
                    let assignedChemController = sys.chemControllers.get().find((cc: ChemController) => 
                        {
                            return cc.orp.chlorId === data.chlorId && cc.id !== this.chemController.id;
                        });
                    if (assignedChemController) {
                        return Promise.reject(new InvalidEquipmentDataError(`Chlorinator is already assigned to another chem controller`, 'chemController', data.chlorId));
                    }
                    this.orp.chlorId = data.chlorId;
                    if (typeof data.chlorDosingMethod !== 'undefined') { this.orp.chlorDosingMethod = data.chlorDosingMethod; }
                } else {
                    this.orp.chlorId = undefined;
                    this.orp.chlorDosingMethod = undefined; 
                }
                sorp.enabled = this.orp.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : this.orp.enabled;
                sorp.level = typeof data.level !== 'undefined' && !isNaN(parseFloat(data.level)) ? parseFloat(data.level) : sorp.level;
                this.orp.phLockout = typeof data.phLockout !== 'undefined' && !isNaN(parseFloat(data.phLockout)) ? parseFloat(data.phLockout) : this.orp.phLockout;
                this.orp.flowReadingsOnly = typeof data.flowReadingsOnly !== 'undefined' ? utils.makeBool(data.flowReadingsOnly) : this.orp.flowReadingsOnly;
                this.orp.disableOnFreeze = typeof data.disableOnFreeze !== 'undefined' ? utils.makeBool(data.disableOnFreeze) : this.orp.disableOnFreeze;
                if (!this.orp.disableOnFreeze) sorp.freezeProtect = false;

                await this.setDosing(this.orp, data);
                await this.setMixing(this.orp, data);
                await this.probe.setProbeORPAsync(sorp.probe, data.probe);
                await this.tank.setTankAsync(sorp.tank, data.tank);
                await this.pump.setPumpAsync(sorp.pump, data.pump);
                await this.chlor.setChlorAsync(sorp.chlor, data);
                if (!this.orp.enabled) {
                    this.orp.doserType = 0;
                    sorp.chemType = 'none';
                }
                else if (this.orp.useChlorinator) {
                    this.orp.doserType = 2;
                    sorp.chemType = 'chlorine';
                }
                else if (this.orp.pump.enabled) {
                    this.orp.doserType = 1;
                    sorp.chemType = 'chlorine';
                }
                else {
                    this.orp.doserType = 0;
                    sorp.chemType = 'none';
                }

                this.orp.setpoint = sorp.setpoint = typeof data.setpoint !== 'undefined' ? parseInt(data.setpoint, 10) : this.orp.setpoint;
                if (typeof data.tolerance !== 'undefined') {
                    if (typeof data.tolerance.enabled !== 'undefined') this.orp.tolerance.enabled = utils.makeBool(data.tolerance.enabled);
                    if (typeof data.tolerance.low === 'number') this.orp.tolerance.low = data.tolerance.low;
                    if (typeof data.tolerance.high === 'number') this.orp.tolerance.high = data.tolerance.high;
                }
            }
        }
        catch (err) { logger.error(`setORPAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async manualDoseVolumeAsync(sorp: ChemicalORPState, volume: number) {
        try {
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentMix = undefined;
                sorp.manualDosing = false;
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sorp);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sorp, 'manual cancel');
            }
            if (sorp.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ORP tank is empty`, 'chemical', sorp));
            let pump = this.pump.pump;
            // We should now be monitoring.
            logger.info(`Chem begin calculating manual dose current: ${sorp.level} setpoint: ${this.orp.setpoint} volume:${volume}`);
            let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(volume / (pump.ratedFlow / 60));
            sorp.startDose(new Date(), 'manual', volume, 0, time);
            sorp.manualDosing = true;
            // Now let's determine what we need to do with our pump to satisfy our acid demand.
            if (sorp.tank.level > 0) {
                logger.verbose(`Chem orp dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                await this.pump.dose(sorp);
            }
        }
        catch (err) { logger.error(`manualDoseVolumeAsync ORP: ${err.message}`); return Promise.reject(err); }
    }
    public async calibrateDoseAsync(sorp: ChemicalORPState, time: number) {
        try {
            logger.debug(`Starting manual ${sorp.chemType} dose for ${time}seconds`);
            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                if (typeof sorp.currentDose !== 'undefined') await this.cancelDosing(sorp, 'manual cancel');
                if (typeof this.currentMix !== 'undefined') await this.stopMixing(sorp);
            }
            if (status === 'mixing') {
                // We are mixing so we need to stop that.
                await this.stopMixing(sorp);
            }
            else if (status === 'dosing') {
                // We are dosing so we need to stop that.
                await this.cancelDosing(sorp, 'manual cancel');
            }
            //if (sorp.tank.level <= 0) return Promise.reject(new InvalidEquipmentDataError(`The ${sorp.chemType} tank is empty`, 'chemical', sorp));
            let pump = this.pump.pump;
            let volume = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : time * (pump.ratedFlow / 60);
            // We should now be monitoring.
            logger.verbose(`Chem begin calculating manual dose current: ${sorp.level} setpoint: ${this.orp.setpoint} time:${time} seconds`);
            sorp.demand = sorp.calcDemand(this.chemController.chem);
            sorp.manualDosing = true;
            sorp.startDose(new Date(), 'calibration', -1, 0, time);
            logger.verbose(`Chem acid manual dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
            await this.pump.dose(sorp);
        }
        catch (err) { logger.error(`calibrateDoseAsync: ${err.message}`); return Promise.reject(err); }
    }

    public async cancelDosing(sorp: ChemicalORPState, reason: string): Promise<void> {
        try {
            if (typeof this.orp.useChlorinator !== 'undefined' && this.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0) {
                await this.chlor.stopDosing(sorp, reason);
                // for chlor, we want 15 minute intervals
                if (sorp.doseHistory.length) {
                    // if last dose was within 15 minutes, set mix time to 15 mins-lastdose
                    // if no dose in last 15, then we should be monitoring
                    if (new Date().getTime() - sorp.doseHistory[0].end.getTime() <  this.chlor.chlorInterval * 60 * 1000){
                        let lastDoseTime = sorp.doseHistory[0].timeDosed;
                        let mixTime = Math.min(Math.max(this.chlor.chlorInterval * 60 - lastDoseTime, 0), this.chlor.chlorInterval * 60);
                        // if (mixTime === 0) return; // due to delays with setting chlor, let the checkDosing pick up the cycle again with the chlor already on.
                        if (sorp.dosingStatus === 0) await this.mixChemicals(sorp, mixTime);
                    }
                }
                else{
                    if (sorp.dosingStatus === 0) await this.mixChemicals(sorp);
                }
                return;
            }
            else {
                // Just stop the pump for now but we will do some logging later.
                await this.pump.stopDosing(sorp, reason);
            }
            if (sorp.dosingStatus === 0) {
                await this.mixChemicals(sorp);
                sorp.endDose(new Date(), 'cancelled');
            }
        } catch (err) { logger.error(`cancelDosing ORP: ${err.message}`); return Promise.reject(err); }
    }
    protected async initMixChemicals(schem: ChemicalState, mixingTime?: number): Promise<void> {
        try {
            if (this._stoppingMix) return;
            if (typeof this.currentMix === 'undefined' || (typeof this.currentMix !== 'undefined' && isNaN(this.currentMix.timeMixed))) {
                if (typeof mixingTime !== 'undefined') {
                    // This is a manual mix so we need to make sure the pump is not dosing.
                    logger.info(`Clearing any possible ${schem.chemType} dosing or existing mix for mixingTime: ${mixingTime}`);
                    if (this.orp.useChlorinator) await this.chlor.stopDosing(schem, 'mix override');
                    else await this.pump.stopDosing(schem, 'mix override');
                    await this.stopMixing(schem);
                }
                this.currentMix = new NixieChemMix();
                if (typeof mixingTime !== 'undefined' && !isNaN(mixingTime)) {
                    this.currentMix.set({ time: Math.round(mixingTime), timeMixed: 0, isManual: true });
                    schem.manualMixing = true;
                }
                else if (schem.mixTimeRemaining > 0) {
                    if (schem.manualMixing) {
                        this.currentMix.set({ time: schem.mixTimeRemaining, timeMixed: 0, isManual: true });
                    }
                    else
                        if (typeof this.chemController.orp.orp.useChlorinator !== 'undefined' && this.chemController.orp.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0) {
                            // if last dose was within 15 minutes, set mix time to 15 mins-(now-lastdose)
                            // if no dose in last 15, then we should be monitoring
                            await this.chlor.stopDosing(schem, 'mix override'); // ensure chlor has stopped
                            if (schem.doseHistory.length) {
                                // if last dose was within 15 minutes, set mix time to 15 mins-lastdose
                                // if no dose in last 15, then we should be monitoring
                                let lastDoseTime = schem.doseHistory[0].timeDosed;
                                let mixTime = Math.min(Math.max(this.chlor.chlorInterval * 60 - lastDoseTime, 0), this.chlor.chlorInterval * 60);
                                // if (mixTime === 0) return; // due to delays in the setting the chlor, if we had a full dose last time let the chlor continue
                                this.currentMix.set({ time: this.chlor.chlorInterval, timeMixed: Math.max(0, mixTime - schem.mixTimeRemaining) });
                            }
                            else
                                // if no dose history, mix for 0s
                                // this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: Math.max(0, (this.chlor.chlorInterval * 60) - schem.mixTimeRemaining) });
                                this.currentMix.set({ time: 0, timeMixed: 0 });
                        }
                        else {
                            this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: Math.max(0, this.chemical.mixingTime - schem.mixTimeRemaining) });
                        }
                }
                else
                    if (typeof this.chemController.orp.orp.useChlorinator !== 'undefined' && this.chemController.orp.orp.useChlorinator && this.chemController.orp.orp.chlorDosingMethod > 0)
                        this.currentMix.set({ time: this.chlor.chlorInterval * 60, timeMixed: 0 });
                    else
                        this.currentMix.set({ time: this.chemical.mixingTime, timeMixed: 0 });
                logger.info(`Chem Controller begin mixing ${schem.chemType} for ${utils.formatDuration(this.currentMix.timeRemaining)} of ${utils.formatDuration(this.currentMix.time)}`)
                schem.mixTimeRemaining = this.currentMix.timeRemaining;
            }
            if (typeof this._mixTimer === 'undefined' || !this._mixTimer) {
                let self = this;
                this._mixTimer = setInterval(async () => { await self.mixChemicals(schem); }, 1000);
                logger.verbose(`Set ${schem.chemType} mix timer`);
            }
        } catch (err) { logger.error(`Error initializing ${schem.chemType} mix: ${err.message}`); }
    }
    public async checkDosing(chem: ChemController, sorp: ChemicalORPState): Promise<void> {
        try {
            if (!chem.orp.enabled) {
                await this.cancelDosing(sorp, 'disabled');
                return;
            }

            let status = sys.board.valueMaps.chemControllerDosingStatus.getName(sorp.dosingStatus);
            if (!chem.orp.flowReadingsOnly || (chem.orp.flowReadingsOnly && sorp.chemController.flowDetected)) {
                // demand in raw mV
                sorp.demand = this.orp.setpoint - sorp.level;
                // log the demand.  We'll store the last 100 data points.  
                // With 1s intervals, this will only be 1m 40s.  Likely should consider more... and def time to move this to an external file.
                sorp.appendDemand(new Date().valueOf(), sorp.demand);
            }
            if (chem.orp.useChlorinator && chem.orp.chlorDosingMethod === 0) return; // if chlor is managing itself, don't even cancel/stop as it will set the flags on the chlor
           
            if (sorp.suspendDosing) {
                // Kill off the dosing and make sure the pump isn't running.  Let's force the issue here.
                await this.cancelDosing(sorp, 'suspended');
                return;
            }
            if (status === 'monitoring') {
                // Alright our mixing and dosing have either been cancelled or we fininsed a mixing cycle.  Either way
                // let the system clean these up.
                this.currentMix = undefined;
                sorp.manualDosing = false;
                sorp.mixTimeRemaining = 0;
                sorp.dosingVolumeRemaining = 0;
                sorp.dosingTimeRemaining = 0;
                await this.stopMixing(sorp);
                await this.cancelDosing(sorp, 'monitoring');
            }
            if (status === 'mixing') {
                await this.cancelDosing(sorp, 'mixing');
                await this.mixChemicals(sorp);
            }
            else if (sorp.manualDosing) {
                // We are manually dosing.  We are not going to dynamically change the dose.
                if (typeof sorp.currentDose === 'undefined') {
                    // This will only happen when njspc is killed in the middle of a dose.  Unlike IntelliChem we will pick that back up.
                    // Unfortunately we will lose the original start date but who cares as the volumes should remain the same.
                    let volume = sorp.volumeDosed + sorp.dosingVolumeRemaining;
                    let time = sorp.timeDosed + sorp.dosingTimeRemaining;
                    sorp.demand = sorp.calcDemand(this.chemController.chem);
                    sorp.startDose(new Timestamp().addSeconds(-sorp.doseTime).toDate(), 'manual', volume, sorp.dosingVolumeRemaining, time * 1000, sorp.doseTime * 1000);
                }
                if (sorp.tank.level > 0) {
                    logger.verbose(`Chem acid dose activate pump ${this.pump.pump.ratedFlow}mL/min`);
                    await this.stopMixing(sorp);
                    await this.pump.dose(sorp);
                }
                else {
                    if (typeof sorp.currentDose !== 'undefined' && sorp.currentDose.method === 'calibration') { }
                    else await this.cancelDosing(sorp, 'empty tank');
                }
            }
            else if (sorp.freezeProtect) {
                await this.cancelDosing(sorp, 'freeze');
            }
            else if (sorp.dailyLimitReached && !chem.orp.useChlorinator) {
                await this.cancelDosing(sorp, 'daily limit');
            }
            // if the ph pump is dosing and dosePriority is enabled, do not dose
            else if (sorp.chemController.ph.pump.isDosing && chem.ph.dosePriority) {
                await this.cancelDosing(sorp, 'ph pump dosing + dose priority');
                return;
            }
            else if (status === 'monitoring' || status === 'dosing') {
                // let _doseCalculatedSec = 0;
                if (!sorp.lockout) {

                    // 1. Get the total gallons of water that the chem controller is in control of.
                    let totalGallons = 0;
                    let body1 = sys.bodies.getItemById(1);
                    let body2 = sys.bodies.getItemById(2);
                    if (chem.body === 0 || chem.body === 32) totalGallons += body1.capacity;
                    if (chem.body === 1 || chem.body === 32) totalGallons += body2.capacity;
                    if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
                    if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;

                    if (chem.orp.useChlorinator) {
                        /*
            Alright, here's the current thinking.
            1. If the orp setpoint is > 50mV below the current orp, the chlor will
            be run at 100%.
            2. At the other end, if the demand is  < -20mV above the setpoint, chlor
            will be run at 0%.
            3. This assumes a sliding scale where we will have an equilibrium point when
            setpoint = current orp and hopefully this will be somewhere near (50-20 / 100) = ~30% of time the chlor is on
             
            Thoughts from @rstrouste
            Volume -- Check
            Delivery Rate -- IC40, IC60, IC20 and IC30 all have different production rates in pounds/day.  The pounds are Sodium Hypochlorite which translates into Hypochlorous acid (HOCl) + Hypochlorite (OCI-).  The former is stronger and the amount of this that is produced is based upon, temperature, pH, and CYA with pH within range being irrelevant (hence the reason for pH lockout).
             
             
            Additional future factors to consider-
            * If temp is below 65(?), the chlor won't be producing any chlorine.  Throw a warning/error?
            * If salt level is too low/high it will cause issues.  Warning/error?
            * Adjust chlor output if it is under/oversized for the total gallons
            */
                        // if we are still mixing, return
                        if (typeof sorp.mixTimeRemaining !== 'undefined' && sorp.mixTimeRemaining > 0) {
                            await this.cancelDosing(sorp, 'still mixing');
                            return;
                        }
                        // Old fashion method; let the setpoints on chlor be the master
                        // if (chem.orp.chlorDosingMethod === 0) return;
                        // if there is a current pending dose, finish it out
                        if (typeof sorp.currentDose === 'undefined') {
                            if (sorp.dosingStatus === 0) { // 0 is dosing
                                // We need to finish off a dose that was interrupted by regular programming.  This occurs
                                // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                                // mixing before we will never get here.
                                if (typeof sorp.currentDose === 'undefined')
                                    sorp.startDose(new Timestamp().addSeconds(-sorp.doseTime).toDate(), 'auto', sorp.doseVolume + sorp.dosingVolumeRemaining, sorp.doseVolume, (sorp.doseTime + sorp.dosingTimeRemaining) * 1000, sorp.doseTime * 1000);
                                await this.chlor.dose(sorp);
                                return;
                            }
                        }
                        let chlor = this.chlor.chlor; // Still haven't seen any systems with 2+ chlors.  
                        // 2024.12.25 RSG - Oh really?  See https://github.com/tagyoureit/nodejs-poolController/discussions/896
                        let schlor = state.chlorinators.getItemById(chlor.id);
                        // If someone or something is superchloring the pool, let it be
                        if (schlor.superChlor) return;
                        // Let's have some fun trying to figure out a dynamic approach to chlor management
                        let body = sys.board.bodies.getBodyState(this.chemController.chem.body);
                        let adj = 1;
                        if (typeof body !== 'undefined' && totalGallons > 0 && sys.bodies.length > 1) {
                            // Intellichem scales down dosing based on the spa being on
                            // vs the pool.  May be interesting to experiment with.
                            let type = sys.board.valueMaps.bodyTypes.getName(body.type);
                            switch (type) {
                                case "pool":
                                case "pool/spa":
                                    // normal dosing
                                    break;
                                default:
                                    // case "spa":
                                    // adjust dosing down to the amount of the smaller body
                                    adj -= Math.abs((body1.capacity - body2.capacity) / Math.max(body1.capacity, body2.capacity));
                                    break;
                            }
                        }
                        let model = sys.board.valueMaps.chlorinatorModel.findItem(chlor.model);
                        if (typeof model === 'undefined' || model === 0) return Promise.reject(new EquipmentNotFoundError(`Please specify a chlorinator model to allow Nixie to calculate chlorine demand`, `chlorinator`));
                        // if we want to adjust for over/under sized chlorinator we can do so here
                        // if (typeof model !== 'undefined' && model.capacity > 0) {
                        //     adj *= totalGallons / model.capacity;
                        // }

                        // unlike ph/orp tank dosing, we are using 15 min intervals so if there is an existing dose then continue
                        if (typeof sorp.currentDose !== 'undefined' && sorp.currentDose.volumeRemaining > 0) {
                            await this.chlor.dose(sorp);
                            return;
                        }

                        // We could store these data points in a separate file like the dosing logs.
                        let percentOfTime = 0;
                        if (sorp.demand > 50) {
                            logger.info(`Chlor demand  ${sorp.demand} > 50;  % of time set to 100%.`);
                            percentOfTime = 1;
                        }
                        else if (sorp.demand < -20) {
                            await this.cancelDosing(sorp, 'demand < -20');
                        }
                        else {
                            // y=mx+b; m = 100/70; b = 100-(50*100/70) = 28.57
                            // let's start with a straight line
                            let b = 100 - (50 * 100 / 70);
                            percentOfTime = ((100 / 70) * sorp.demand * adj + b) / 100;
                            logger.info(`Chlor trend line is ${sorp.demandHistory.slope}.`);
                            if (sorp.demandHistory.slope > 5 && sorp.demand < 0) {
                                // need less chlorine, but we're getting there too fast
                                // slope is high; turn down dose
                                percentOfTime *= .5;
                            }
                            else if (sorp.demandHistory.slope < 5 && sorp.demand > 0) {
                                // need more chlorine, but we aren't getting there fast enough
                                // slope is too low, turn up dose
                                percentOfTime *= 1.1;
                            }
                            else if (sorp.demandHistory.slope > 0 && sorp.demand > 0) {
                                // chlorine is increasing, but we need less of it
                                percentOfTime *= .5;
                            }
                            else if (sorp.demandHistory.slope < 0 && sorp.demand > 0) {
                                // chlorine is decreasing, but we need more
                                percentOfTime *= 1.1;
                            }
                            percentOfTime = Math.min(1, Math.max(0, percentOfTime));
                            logger.info(`Chlor dosing % of time is ${Math.round(percentOfTime * 10000) / 100}%`)
                        }

                        // convert the % of time back to an amount of chlorine over 15 minutes; 
                        let time = this.chlor.chlorInterval * 60 * percentOfTime;
                        let dose = model.chlorinePerSec * time;
                        
                        if (dose > 0) {
                            logger.info(`Chem chlor calculated dosing at ${Math.round(percentOfTime * 10000) / 100}% and will dose ${Math.round(dose * 1000000) / 1000000}Lbs of chlorine over the next ${utils.formatDuration(time)}.`)
                            sorp.startDose(new Date(), 'auto', dose, 0, time, 0);
                            await this.chlor.dose(sorp);
                            return;
                        }

                        // if none of the other conditions are true, mix
                        // await this.mixChemicals(sorp, this.chlor.chlorInterval * 60);

                    }
                    else if (this.orp.setpoint > sorp.level) {
                        let pump = this.pump.pump;
                        // Calculate how many mL are required to raise to our ORP level.
                        let demand = Math.round(utils.convert.volume.convertUnits(0, 'oz', 'mL'));
                        let time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(demand / (pump.ratedFlow / 60));
                        let meth = sys.board.valueMaps.chemDosingMethods.getName(this.orp.dosingMethod);
                        // Now that we know our chlorine demand we need to adjust this dose based upon the limits provided in the setup.
                        switch (meth) {
                            case 'time':
                                time = this.orp.maxDosingTime;
                                demand = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                                break;
                            case 'volume':
                                demand = this.orp.maxDosingVolume;
                                time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(demand / (pump.ratedFlow / 60));
                                break;
                            case 'volumeTime':
                            default:
                                // This is maybe a bit dumb as the volume and time should equal out for the rated flow.  In other words
                                // you will never get to the volume limit if the rated flow can't keep up to the time.
                                if (demand > this.orp.maxDosingVolume) {
                                    demand = this.orp.maxDosingVolume;
                                    time = typeof pump.ratedFlow === 'undefined' || pump.ratedFlow <= 0 ? 0 : Math.round(demand / (pump.ratedFlow / 60));
                                }
                                if (time > this.orp.maxDosingTime) {
                                    time = this.orp.maxDosingTime;
                                    demand = typeof pump.ratedFlow === 'undefined' ? 0 : Math.round(time * (this.pump.pump.ratedFlow / 60));
                                }
                                break;
                        }
                        logger.info(`Chem orp dose calculated ${demand}mL for ${utils.formatDuration(time)} Tank Level: ${sorp.tank.level} using ${meth}`);

                        sorp.demand = sorp.calcDemand(chem);
                        if (sorp.demand > 0) logger.info(`Chem orp dose calculated ${demand}mL for ${utils.formatDuration(time)} Tank Level: ${sorp.tank.level} using ${meth}`);

                        if (typeof sorp.currentDose === 'undefined') {
                            // We will include this with the dose demand because our limits may reduce it.
                            //dosage.demand = demand;
                            if (sorp.dosingStatus === 0) { // 0 is dosing.
                                // We need to finish off a dose that was interrupted by regular programming.  This occurs
                                // when for instance njspc is interrupted and restarted in the middle of a dose. If we were
                                // mixing before we will never get here.
                                if (typeof sorp.currentDose === 'undefined')
                                    sorp.startDose(new Timestamp().addSeconds(-sorp.doseTime).toDate(), 'auto', sorp.doseVolume + sorp.dosingVolumeRemaining, sorp.doseVolume, (sorp.doseTime + sorp.dosingTimeRemaining) * 1000, sorp.doseTime * 1000);
                            }
                            else
                                sorp.startDose(new Date(), 'auto', demand, 0, time, 0);
                        }
                        // Now let's determine what we need to do with our pump to satisfy our acid demand.
                        if (sorp.tank.level > 0) {
                            await this.pump.dose(sorp);
                        }
                        else await this.cancelDosing(sorp, 'empty tank');
                    }
                }
                else
                    await this.cancelDosing(sorp, 'unknown cancel');
            }
        }
        catch (err) { logger.error(`checkDosing ORP: ${err.message}`); return Promise.reject(err); }
    }
    public async deleteChlorAsync(chlor: NixieChlorinator) {
        logger.info(`Removing chlor ${chlor.id} from Chem Controller ${this.getParent().id}`);
        let schem = state.chemControllers.getItemById(this.getParent().id);
        this.orp.useChlorinator = false;
        // schem.orp.useChlorinator = false;
        if (schem.orp.dosingStatus === 0) { await this.cancelDosing(schem.orp, 'deleting chlorinator'); }
        if (schem.orp.dosingStatus === 1) { await this.cancelMixing(schem.orp); }
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
        } catch (err) { logger.error(`setProbeAsync: ${err.message}`); return Promise.reject(err); }
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
                // if probe is not Atlas, or binding changes, disable feed for existing probe
                if (this.probe.type !== 1 || this.probe.deviceBinding !== data.deviceBinding) {
                    let disabledFeed = this.probe;
                    disabledFeed.remFeedEnabled = false;
                    try {
                        // if remote REM server was not found this would error out
                        await this.setRemoteREMFeed(disabledFeed);
                    }
                    catch (err){
                        logger.silly(`Disabling remote REM connection for PH Probe returned error ${err.message}.  Continuing.`)
                    }
                    this.probe.remFeedId = undefined;
                }
                await this.setProbeAsync(this.probe, sprobe, data);
                this.probe.type = typeof data.type !== 'undefined' ? data.type : this.probe.type;
                this.probe.type === 0 ? this.probe.enabled = false : this.probe.enabled = true;
                sprobe.temperature = typeof data.temperature !== 'undefined' ? parseFloat(data.temperature) : sprobe.temperature;
                sprobe.tempUnits = typeof data.tempUnits !== 'undefined' ? data.tempUnits : sprobe.tempUnits;
                this.probe.feedBodyTemp = typeof data.feedBodyTemp !== 'undefined' ? utils.makeBool(data.feedBodyTemp) : utils.makeBool(this.probe.feedBodyTemp);
                //this.probe.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : this.probe.connectionId;
                await this.setRemoteREMFeed(data);
            }
        } catch (err) { logger.error(`setProbeAsync pH: ${err.message}`); return Promise.reject(err); }
    }
    public async setTempCompensationAsync(sprobe: ChemicalProbePHState) {
        try {

            if (this.probe.feedBodyTemp) {
                if (this.probe.type !== 0) {
                    // Set the current body so that it references the temperature of the current running body.
                    let body = sys.board.bodies.getBodyState(this.chemical.chemController.chem.body);
                    if (typeof body !== 'undefined' && body.isOn) {
                        let units = sys.board.valueMaps.tempUnits.transform(state.temps.units);
                        let obj = {};
                        obj[`temp${units.name.toUpperCase()}`] = body.temp;
                        sprobe.tempUnits = units.val;
                        sprobe.temperature = body.temp; // set temp for lsi calc
                        let res = await NixieEquipment.putDeviceService(this.probe.connectionId, `/feed/device/${this.probe.deviceBinding}`, obj);

                    }
                }
            }
        }
        catch (err) { logger.error(`setTempCompensation phProbe: ${err.message}`); return Promise.reject(err); }
    }
    public async setRemoteREMFeed(data: any) {
        // Set/update remote feeds
        try {
            // if no device binding, return (if this is switched from atlas no 0/2 it will still have a value)
            if (typeof this.probe.deviceBinding === 'undefined') return;
            let remoteConnectionId = webApp.findServerByGuid(this.probe.connectionId).remoteConnectionId;
            let d = {
                id: this.probe.remFeedId,
                connectionId: remoteConnectionId,
                options: { id: this._pmap['parent'].chemController.id },
                deviceBinding: this.probe.deviceBinding,
                eventName: "chemController",
                property: "pHLevel",
                sendValue: 'all',
                isActive: data.remFeedEnabled,
                //sampling: 1,
                //changesOnly: false,
                propertyDesc: '[chemController].pHLevel'
            }
            let res = await NixieChemController.putDeviceService(this.probe.connectionId, '/config/verifyFeed', d);
            if (res.status.code === 200) { this.probe.remFeedEnabled = data.remFeedEnabled; }
            else { logger.warn(`setRemoteREMFeed: Cannot set remote feed. Message:${JSON.stringify(res.status)} for feed: ${JSON.stringify(d)}.`); }
        }
        catch (err) { logger.error(`setRemoteREMFeed: ${err.message}`); return Promise.reject(err); }
    }
    public syncRemoteREMFeeds(chem: ChemController, servers) {
        // match any feeds and store the id/statusf
        try {
            let pHProbe = this.probe;
            for (let i = 0; i < servers.length; i++) {
                let device = servers[i].devices.find(el => el.binding === pHProbe.deviceBinding);
                if (typeof device !== 'undefined' && typeof device.feeds !== 'undefined')
                    for (let j = 0; j < device.feeds.length; j++) {
                        let feed = device.feeds[j];
                        if (feed.options.id === chem.id &&
                            feed.eventName === "chemController" &&
                            feed.property === "pHLevel" &&
                            (feed.sendValue === 'pH' || feed.sendValue === 'all')
                        ) {
                            // if feed is enabled, but probe is disabled; disable feed
                            if (feed.isActive && this.probe.enabled === false) {
                                chem.ph.probe.remFeedEnabled = false;
                                this.setRemoteREMFeed(chem.ph.probe);
                                return;
                            }
                            this.probe.remFeedEnabled = feed.isActive;
                            this.probe.remFeedId = feed.id;
                            return;
                        }
                    }
            }
            // if we get this far, no feed was found. 
            this.probe.remFeedEnabled = false;
            this.probe.remFeedId = undefined;
        }
        catch (err) { logger.error(`syncRemoteREMFeeds error: ${err}`); }
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
                // if probe is not Atlas, or binding changes, disable feed for existing probe
                if (this.probe.type !== 1 || this.probe.deviceBinding !== data.deviceBinding) {
                    let disabledFeed = this.probe;
                    disabledFeed.remFeedEnabled = false;
                    try {
                        // if remote REM server was not found this would error out
                        await this.setRemoteREMFeed(disabledFeed);
                    }
                    catch (err){
                        logger.silly(`Disabling remote REM connection for ORP Probe returned error ${err.message}.  Continuing.`)
                    }
                    this.probe.remFeedId = undefined;
                }
                await this.setProbeAsync(this.probe, sprobe, data);
                this.probe.type = typeof data.type !== 'undefined' ? data.type : this.probe.type;
                this.probe.type === 0 ? this.probe.enabled = false : this.probe.enabled = true;
                sprobe.saltLevel = typeof data.saltLevel !== 'undefined' ? parseFloat(data.saltLevel) : sprobe.saltLevel;
                await this.setRemoteREMFeed(data);
            }
        } catch (err) { logger.error(`setProbeAsync ORP: ${err.message}`); return Promise.reject(err); }
    }
    public async setRemoteREMFeed(data: any) {
        // Set/update remote feeds
        try {
            // if no device binding, return (if this is switched from atlas no 0/2 it will still have a value)
            if (typeof this.probe.deviceBinding === 'undefined') return;
            let remoteConnectionId = webApp.findServerByGuid(this.probe.connectionId).remoteConnectionId;
            let d = {
                id: this.probe.remFeedId,
                connectionId: remoteConnectionId,
                options: { id: this._pmap['parent'].chemController.id },
                deviceBinding: this.probe.deviceBinding,
                eventName: 'chemController',
                property: 'orpLevel',
                sendValue: 'orp',
                isActive: data.remFeedEnabled,
                //sampling: 1,
                //changesOnly: false,
                propertyDesc: '[chemController].orpLevel'
            }
            let res = await NixieChemController.putDeviceService(this.probe.connectionId, '/config/verifyFeed', d);
            if (res.status.code === 200) { this.probe.remFeedEnabled = data.remFeedEnabled; }
            else {
                logger.warn(`setRemoteREMFeed: Cannot set remote feed. Message:${JSON.stringify(res.status)} for feed: ${JSON.stringify(d)}.`);
                // return Promise.reject(new InvalidOperationError(`Nixie could not set remote REM feed for the ORP probe.`, this.probe.dataName));
            }
        }
        catch (err) {
            logger.error(`setRemoteREMFeed: ${err.message}`);
            //return Promise.reject(err); // don't muck up chem controller if we can't set the feeds.
        }
    }
    public syncRemoteREMFeeds(chem: ChemController, servers) {
        // match any feeds and store the id/statusf
        try {
            let pHProbe = this.probe;
            for (let i = 0; i < servers.length; i++) {
                let device = servers[i].devices.find(el => el.binding === pHProbe.deviceBinding);
                if (typeof device !== 'undefined' && typeof device.feeds !== 'undefined')
                    for (let j = 0; j < device.feeds.length; j++) {
                        let feed = device.feeds[j];
                        if (feed.options.id === chem.id &&
                            feed.eventName === "chemController" &&
                            feed.property === "orpLevel" &&
                            (feed.sendValue === 'orp' || feed.sendValue === 'all')
                        ) {
                            // if feed is enabled, but probe is disabled; disable feed
                            if (feed.isActive && this.probe.enabled === false) {
                                chem.ph.probe.remFeedEnabled = false;
                                this.setRemoteREMFeed(chem.ph.probe);
                                return;
                            }
                            this.probe.remFeedEnabled = feed.isActive;
                            this.probe.remFeedId = feed.id;
                            return;
                        }
                    }
            }
            // if we get this far, no feed was found. 
            this.probe.remFeedEnabled = false;
            this.probe.remFeedId = undefined;
        }
        catch (err) { logger.error(`syncRemoteREMFeeds error: ${err}`); }
    }
}
export class NixieChemFlowSensor extends NixieChildEquipment {
    public sensor: ChemFlowSensor;
    constructor(parent: NixieEquipment, sensor: ChemFlowSensor) {
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
        } catch (err) { logger.error(`setSensorAsync flowSensor: ${err.message}`); return Promise.reject(err); }
    }
    public async getState() {
        try {
            let dev = await NixieEquipment.getDeviceService(this.sensor.connectionId, `/state/device/${this.sensor.deviceBinding}`);
            return dev;
        }
        catch (err) {
            // RKS: We should not be thowing here.  We want the system to try to shut everything down
            // if the server cannot be contacted.
            logger.error(`getState flowSensor: ${err.message}`); return { obj: { state: false } };
        }
    }
}
