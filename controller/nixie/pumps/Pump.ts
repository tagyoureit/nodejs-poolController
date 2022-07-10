import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Pump, PumpCircuit, PumpCollection, PumpRelay, sys } from "../../../controller/Equipment";
import { CircuitState, PumpState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { Outbound, Protocol, Response } from '../../comms/messages/Messages';
import { conn } from '../../comms/Comms';

export class NixiePumpCollection extends NixieEquipmentCollection<NixiePump> {
    public async deletePumpAsync(id: number) {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let pump = this[i];
                if (pump.id === id) {
                    await pump.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { logger.error(`Nixie Control Panel deletePumpAsync ${err.message}`); }
    }
    public async setPumpStateAsync(pstate: PumpState) {
        try {
            let pump: NixiePump = this.find(elem => elem.id === pstate.id) as NixiePump;
            if (typeof pump === 'undefined') {
                return logger.error(`Nixie Control Panel Error setPumpState could not find pump ${pstate.id}-${pstate.name}`);
            }
            await pump.setPumpStateAsync(pstate);
        } catch (err) { logger.error(`Nixie Error setting pump state ${pstate.id}-${pstate.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async setPumpAsync(pump: Pump, data: any) {
        // By the time we get here we know that we are in control and this is a Nixie pump.
        try {
            let c: NixiePump = this.find(elem => elem.id === pump.id) as NixiePump;
            if (typeof c === 'undefined') {
                pump.master = 1;
                if (typeof data.type !== 'undefined') pump.type = data.type; // needed for init of correct type
                if (typeof pump.type === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Invalid pump type for ${pump.name}`, data.id, 'Pump'));
                c = this.pumpFactory(pump);
                // c = new NixiePump(this.controlPanel, pump);
                this.push(c);
                logger.info(`A pump was not found for id #${pump.id} creating pump`);
                return await c.setPumpAsync(data);
            }
            else {
                if (typeof data.type !== 'undefined' && c.pump.type !== data.type) {
                    // pump exists, changing type
                    await c.closeAsync();
                    pump.type = data.type; // needed for init of correct type
                    if (typeof pump.type === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Invalid pump type for ${pump.name}`, data.id, 'Pump'));
                    c = this.pumpFactory(pump);
                }
                return await c.setPumpAsync(data);
            }
        }
        catch (err) { logger.error(`setPumpAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(pumps: PumpCollection) {
        try {
            for (let i = 0; i < pumps.length; i++) {
                let pump = pumps.getItemByIndex(i);
                if (pump.master === 1) {
                    if (typeof this.find(elem => elem.id === pump.id) === 'undefined') {
                        let type = sys.board.valueMaps.pumpTypes.getName(pump.type);
                        let npump = this.pumpFactory(pump);
                        logger.info(`Initializing Nixie Pump ${npump.id}-${pump.name}`);
                        this.push(npump);
                    }
                }
            }
        }
        catch (err) { logger.error(`Nixie Pump initAsync Error: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Pump ${err}`); }
            }
        } catch (err) { } // Don't bail if we have an errror.
    }
    public async setServiceModeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    let p = this[i] as NixiePump;
                    await p.setServiceModeAsync();
                } catch (err) { logger.error(`Error setting service mode for Nixie Pump ${err}`); }
            }
        } catch (err) { } // Don't bail if we have an errror.
    }
    public async initPumpAsync(pump: Pump): Promise<NixiePump> {
        try {
            let c: NixiePump = this.find(elem => elem.id === pump.id) as NixiePump;
            if (pump.master === 1) {
                // if pump exists, close it so we can re-init 
                // (EG if pump type changes, we need to setup a new instance of the pump)
                if (typeof c !== 'undefined' && c.pump.type !== pump.type) {
                    await c.closeAsync();
                    c = this.pumpFactory(pump);
                }
                logger.info(`Initializing Nixie Pump ${c.id}-${pump.name}`);
                this.push(c);
            }
            return c;
        } catch (err) { return Promise.reject(logger.error(`Nixie Controller: initPumpAsync Error: ${err.message}`)); }
    }
    private pumpFactory(pump: Pump) {
        let type = sys.board.valueMaps.pumpTypes.getName(pump.type);
        switch (type) {
            case 'ss':
                return new NixiePumpSS(this.controlPanel, pump);
            case 'ds':
                return new NixiePumpDS(this.controlPanel, pump);
            case 'vsf':
                return new NixiePumpVSF(this.controlPanel, pump);
            case 'vf':
                return new NixiePumpVF(this.controlPanel, pump);
            case 'sf':
                return new NixiePumpSF(this.controlPanel, pump);
            case 'vs':
                return new NixiePumpVS(this.controlPanel, pump);
            case 'hwvs':
                return new NixiePumpHWVS(this.controlPanel, pump);
            case 'hwrly':
                return new NixiePumpHWRLY(this.controlPanel, pump);
            default:
                throw new EquipmentNotFoundError(`NCP: Cannot create pump ${pump.name}.`, type);
        }
    }
    public syncPumpStates() {
        // loop through all pumps and update rates based on circuit changes
        // this would happen in <2s anyway based on pollAsync but this is immediate.
        for (let i = this.length - 1; i >= 0; i--) {
            setTimeout(async () => {
                let pump = this[i] as NixiePump;
                try {
                    if (!pump.closing) await pump.pollEquipmentAsync();
                } catch (err) { }
            }, 100);

        }
    }
}
export class NixiePump extends NixieEquipment {
    public pollingInterval: number = 2000;
    protected _pollTimer: NodeJS.Timeout = null;
    public pump: Pump;
    protected _targetSpeed: number;
    protected _suspendPolling = 0;
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1)); }
    public closing = false;
    public async setServiceModeAsync() {
        let pstate = state.pumps.getItemById(this.pump.id);
        await this.setPumpStateAsync(pstate);
    }
    /*
    _targetSpeed will hold values as follows:
    vs/vsf/vf: rpm/gpm;
    ss: 0=off, 1=on;
    ds/sf: bit shift 1-4 = values 1/2/4/8 for relays 1/2/3/4
    */
    constructor(ncp: INixieControlPanel, pump: Pump) {
        super(ncp);
        this.pump = pump;
        this._targetSpeed = 0;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.pump !== 'undefined' ? this.pump.id : -1; }
    public async setPumpStateAsync(pstate: PumpState) {
        try {
            // Here we go we need to set the pump state.
            return new InterfaceServerResponse(200, 'Ok');
        } catch (err) { return Promise.reject(`Nixie Error setting pump state ${pstate.id}-${pstate.name}: ${err.message}`); }
    }
    public async setPumpAsync(data: any): Promise<InterfaceServerResponse> {
        try {

            this.pump.master = 1;
            // if (typeof data.isVirtual !== 'undefined') this.pump.isVirtual = data.isVirtual;
            this.pump.isActive = true;
            // if (typeof data.type !== 'undefined' && data.type !== this.pump.type) {
            //     sys.board.pumps.setType(this.pump, data.type);
            //     this.pump = sys.pumps.getItemById(id, true);
            //     spump = state.pumps.getItemById(id, true);
            // }
            let type = sys.board.valueMaps.pumpTypes.transform(this.pump.type);
            this.pump.name = data.name || this.pump.name || type.desc;
            if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0 && typeof data.circuits !== 'undefined') { // This pump type supports circuits
                for (let i = 1; i <= data.circuits.length && i <= type.maxCircuits; i++) {
                    let c = data.circuits[i - 1];
                    c.id = i;
                    let circuit = parseInt(c.circuit, 10);
                    let cd = this.pump.circuits.find(elem => elem.circuit === circuit);
                    let speed = parseInt(c.speed, 10);
                    let relay = parseInt(c.relay, 10);
                    let flow = parseInt(c.flow, 10);
                    let units = typeof c.units !== 'undefined' ? sys.board.valueMaps.pumpUnits.encode(c.units) : undefined;
                    switch (type.name) {
                        case 'vf':
                            units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                            break;
                        case 'hwvs':
                        case 'vssvrs':
                        case 'vs':
                            c.units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            break;
                        case 'ss':
                        case 'ds':
                        case 'sf':
                        case 'hwrly':
                            c.units = 'undefined';
                            break;
                    }
                    if (isNaN(units)) units = typeof cd !== 'undefined' ? cd.units : sys.board.valueMaps.pumpUnits.getValue('rpm');
                    if (isNaN(speed)) speed = type.minSpeed;
                    if (isNaN(flow)) flow = type.minFlow;
                    if (isNaN(relay)) relay = 1;
                    c.units = units;
                    //c.units = parseInt(c.units, 10) || type.name === 'vf' ? sys.board.valueMaps.pumpUnits.getValue('gpm') : sys.board.valueMaps.pumpUnits.getValue('rpm');
                    if (typeof type.minSpeed !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('rpm')) {
                        c.speed = speed;
                    }
                    else if (typeof type.minFlow !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('gpm')) {
                        c.flow = flow;
                    }
                    else if (type.maxRelays > 0)
                        c.relay = relay;
                }
            }
            this.pump.set(data); // Sets all the data back to the pump.  This also sets the relays should it exist on the data.
            let spump = state.pumps.getItemById(this.pump.id, true);
            spump.name = this.pump.name;
            spump.address = this.pump.address;
            spump.type = this.pump.type;
            sys.pumps.sortById();
            state.pumps.sortById();
            this.pump.hasChanged = true;
            return Promise.resolve(new InterfaceServerResponse(200, 'Ok'));
        }
        catch (err) { logger.error(`Nixie setPumpAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (this.suspendPolling || this.closing) return;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            // let success = false;
            let pstate = state.pumps.getItemById(this.pump.id);
            this.setTargetSpeed(pstate);
            await this.setPumpStateAsync(pstate);
        }
        catch (err) { logger.error(`Nixie Error running pump sequence - ${err}`); }
        finally { if (!this.closing) this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 2000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Pump checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(pump: Pump, pstate: PumpState) {
        try {
        } catch (err) { logger.error(`Nixie Error checking Pump Hardware ${this.pump.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            logger.info(`Nixie Pump closing ${this.pump.name}.`)
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            this._targetSpeed = 0;
            let pstate = state.pumps.getItemById(this.pump.id);
            try {
                await this.setPumpStateAsync(pstate);
                // Since we are closing we need to not reject.
            } catch (err) { logger.error(`Nixie Closing pump closeAsync: ${err.message}`); }
            // This will make sure the timer is dead and we are completely closed.
            this.closing = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            pstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Pump closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
    protected setTargetSpeed(pstate: PumpState) { };
    protected isBodyOn(bodyCode: number) {
        let assoc = sys.board.valueMaps.pumpBodies.transform(bodyCode);
        switch (assoc.name) {
            case 'body1':
            case 'pool':
                return state.temps.bodies.getItemById(1).isOn;
            case 'body2':
            case 'spa':
                return state.temps.bodies.getItemById(2).isOn;
            case 'body3':
                return state.temps.bodies.getItemById(3).isOn;
            case 'body4':
                return state.temps.bodies.getItemById(4).isOn;
            case 'poolspa':
                if (sys.equipment.shared && sys.equipment.maxBodies >= 2) {
                    return state.temps.bodies.getItemById(1).isOn === true || state.temps.bodies.getItemById(2).isOn === true;
                }
                else
                    return state.temps.bodies.getItemById(1).isOn;
        }
        return false;
    }
}
export class NixiePumpSS extends NixiePump {
    public setTargetSpeed(pState: PumpState) {
        // Turn on ss pumps.
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            // let pt = sys.board.valueMaps.pumpTypes.get(this.pump.type);
            // if (pt.hasBody) _newSpeed = this.isBodyOn(this.pump.body) ? 1 : 0;
            //console.log(`BODY: ${sys.board.bodies.isBodyOn(this.pump.body)} CODE: ${this.pump.body}`);
            if (!pState.pumpOnDelay) {
                let pumpCircuits: PumpCircuit[] = this.pump.circuits.get();
                if (!pState.pumpOnDelay) {
                    for (let i = 0; i < pumpCircuits.length; i++) {
                        let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                        if (circ.isOn) _newSpeed = 1;
                    }
                }
            }
        }
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed > 0 ? 'on' : 'off'}. ${sys.board.bodies.isBodyOn(this.pump.body)}`);
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this._targetSpeed = _newSpeed;
    }
    public async setServiceModeAsync() {
        let pstate = state.pumps.getItemById(this.pump.id);
        pstate.targetSpeed = this._targetSpeed = 0;
        await this.setPumpStateAsync(pstate);
    }
    public async setPumpStateAsync(pstate: PumpState) {
        let relays: PumpRelay[] = this.pump.relays.get();
        let relayState = 0;
        for (let i = 0; i < relays.length; i++) {
            let pr = relays[i];
            if (typeof pr.id === 'undefined') pr.id = i + 1; // remove when id is added to dP relays upon save.
            let isOn = this._targetSpeed >> pr.id - 1 & 1;
            if (utils.isNullOrEmpty(pr.connectionId) || utils.isNullOrEmpty(pr.deviceBinding)) {
                // If they haven't set a program for the relay bugger out.
                if (isOn) relayState |= (1 << pr.id - 1);
            }
            else {
                try {
                    let res = await NixieEquipment.putDeviceService(pr.connectionId, `/state/device/${pr.deviceBinding}`, { isOn, latch: isOn ? 5000 : undefined });
                    if (res.status.code === 200) {
                        if (isOn) relayState |= (1 << pr.id - 1);
                    }
                    else pstate.status = 16;
                }
                catch (err) {
                    logger.error(`NCP: Error setting pump ${this.pump.name} relay ${pr.id} to ${isOn ? 'on' : 'off'}.  Error ${err.message}}`);
                    pstate.status = 16;
                }
            }
        }
        if (pstate.targetSpeed === 0) {
            pstate.status = 0;
            pstate.driveState = 0; // We need to set this if it is a priming cycle but it might not matter for our relay based pumps.
            pstate.command = 0;
        }
        else if (relayState === pstate.targetSpeed) {
            pstate.status = 1;
            pstate.driveState = 2;
            pstate.command = 4;
        }
        pstate.relay = relayState;
        return new InterfaceServerResponse(200, 'Success');
    }
}
export class NixiePumpDS extends NixiePumpSS {
    public setTargetSpeed(pState: PumpState) {
        // Turn on sf pumps.  The new speed will be the relays associated with the pump.  I believe when this comes out in the final
        // wash it should engage all the relays for all speeds associated with the pump.  The pump logic will determine which program is
        // the one to engage.
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits: PumpCircuit[] = this.pump.circuits.get();
            if (!pState.pumpOnDelay) {
                for (let i = 0; i < pumpCircuits.length; i++) {
                    let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                    // relay speeds are bit-shifted 'or' based on 1,2,4,8
                    if (circ.isOn) _newSpeed |= (1 << pumpCircuits[i].relay - 1);
                }
            }
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this.logSpeed(_newSpeed);
        this._targetSpeed = _newSpeed;
    }
    public logSpeed(_newSpeed: number) {
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} relays to Relay 1: ${_newSpeed & 1 ? 'on' : 'off'}, Relay 2: ${_newSpeed & 2 ? 'on' : 'off'}.`);
    }
}
export class NixiePumpSF extends NixiePumpDS {
    // effectively operates the same way as a DS pump since we removed the body association on DS.
    // only logger msg is different
    public logSpeed(_newSpeed: number) {
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} relays to Relay 1: ${_newSpeed & 1 ? 'on' : 'off'}, Relay 2: ${_newSpeed & 2 ? 'on' : 'off'}, Relay 3: ${_newSpeed & 4 ? 'on' : 'off'}, and Relay 4: ${_newSpeed & 8 ? 'on' : 'off'}.`);
    }
}
export class NixiePumpHWRLY extends NixiePumpDS {
    // This operates as a relay pump with up to 8 speeds.  The speeds are defined as follows.  The override
    // relay should be defined as being normally closed.  When it opens then the pump will turn on to the speed.
    // +-------+---------+---------+---------+---------+
    // + Speed | Relay 1 | Relay 2 | Relay 3 |  OVRD   |
    // +-------+---------+---------+---------+---------+
    // |  OFF  |   OFF   |   OFF   |   OFF   |   OFF   |
    // +-------+---------+---------+---------+---------+
    // |   1   |   OFF   |   OFF   |   OFF   |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   2   |   ON    |   OFF   |   OFF   |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   3   |   OFF   |   ON    |   OFF   |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   4   |   ON    |   ON    |   OFF   |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   5   |   OFF   |   OFF   |   ON    |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   6   |   ON    |   OFF   |   ON    |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   7   |   OFF   |   ON    |   ON    |   ON    |
    // +-------+---------+---------+---------+---------+
    // |   8   |   ON    |   ON    |   ON    |   ON    |
    // +-------+---------+---------+---------+---------+

    public setTargetSpeed(pState: PumpState) {
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits = this.pump.circuits.get();
            for (let i = 0; i < pumpCircuits.length; i++) {
                let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                let pc = pumpCircuits[i];
                if (circ.isOn) {
                    _newSpeed = Math.max(_newSpeed, pc.relay);
                }
            }
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this._targetSpeed = _newSpeed;
        if (this._targetSpeed !== 0) Math.min(Math.max(this.pump.minSpeed, this._targetSpeed), this.pump.maxSpeed);
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed}.`);
    }
    public async setPumpStateAsync(pstate: PumpState) {
        // Don't poll while we are seting the state.
        this.suspendPolling = true;
        try {
            let relays: PumpRelay[] = this.pump.relays.get();
            let relayState = 0;
            let targetState = 0;
            for (let i = 0; i < relays.length; i++) {
                let pr = relays[i];
                if (typeof pr.id === 'undefined') pr.id = i + 1; // remove when id is added to dP relays upon save.
                // If we are turning on the pump relay #4 needs to be on.  NOTE: It is expected that the OVRD relay is hooked up in a normally closed
                // configuration so that whenever the pump is off the relay terminals are closed.
                let isOn = this._targetSpeed > 0 ? i === 3 ? true : (this._targetSpeed - 1 & (1 << i)) > 0 : false;
                let bit = isOn ? (1 << i) : 0;
                targetState |= bit;
                if (utils.isNullOrEmpty(pr.connectionId) || utils.isNullOrEmpty(pr.deviceBinding)) {
                    // Determine whether the relay should be on.
                    relayState |= bit;
                }
                else {
                    try {
                        let res = await NixieEquipment.putDeviceService(pr.connectionId, `/state/device/${pr.deviceBinding}`, { isOn, latch: isOn ? 5000 : undefined });
                        if (res.status.code === 200) {
                            relayState |= bit;
                        }
                        else pstate.status = 16;
                    }
                    catch (err) {
                        logger.error(`NCP: Error setting pump ${this.pump.name} relay ${pr.id} to ${isOn ? 'on' : 'off'}.  Error ${err.message}}`);
                        pstate.status = 16;
                    }
                }
            }
            pstate.command = this._targetSpeed;
            if (targetState === relayState) {
                pstate.status = relayState > 0 ? 1 : 0;
                pstate.driveState = relayState > 0 ? 2 : 0;
                pstate.relay = relayState;
            }
            else {
                pstate.driveState = 0;
            }
            return new InterfaceServerResponse(200, 'Success');
        }
        catch (err) {
            logger.error(`Error running pump sequence for ${this.pump.name}: ${err.message}`);
            return Promise.reject(err);
        }
        finally { this.suspendPolling = false; }
    };

}
export class NixiePumpRS485 extends NixiePump {
    public async setServiceModeAsync() {
        this._targetSpeed = 0;
        await this.setDriveStateAsync(false);
        await this.setPumpToRemoteControl(false);
    }
    public async setPumpStateAsync(pstate: PumpState) {
        // Don't poll while we are seting the state.
        this.suspendPolling = true;
        try {
            let pt = sys.board.valueMaps.pumpTypes.get(this.pump.type);
            if (state.mode === 0) {
                // Since these process are async the closing flag can be set
                // between calls.  We need to check it in between each call.
                try { if (!this.closing) await this.setDriveStateAsync(); } catch (err) { }
                try {
                    if (!this.closing) {
                        if (this._targetSpeed >= pt.minFlow && this._targetSpeed <= pt.maxFlow) await this.setPumpGPMAsync();
                        else if (this._targetSpeed >= pt.minSpeed && this._targetSpeed <= pt.maxSpeed) await this.setPumpRPMAsync();
                    }
                } catch (err) { };
                try { if (!this.closing && pt.name !== 'vsf' && pt.name !== 'vs') await this.setPumpFeature(6); } catch (err) { };
                try { if (!this.closing) await utils.sleep(1000); } catch (err) { };
                try { if (!this.closing) await this.requestPumpStatus(); } catch (err) { };
                try { if (!this.closing) await this.setPumpToRemoteControl(); } catch (err) { };
            }
            return new InterfaceServerResponse(200, 'Success');
        }
        catch (err) {
            logger.error(`Error running pump sequence for ${this.pump.name}: ${err.message}`);
            return Promise.reject(err);
        }
        finally { this.suspendPolling = false; }
    };
    protected async setDriveStateAsync(running: boolean = true) {
        return new Promise<void>((resolve, reject) => {
            if (conn.isPortEnabled(this.pump.portId || 0)) {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 6,
                    payload: running && this._targetSpeed > 0 ? [10] : [4],
                    retries: 1,
                    response: true,
                    onComplete: (err, msg: Outbound) => {
                        if (err) {
                            logger.error(`Error sending setDriveState for ${this.pump.name} : ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            }
            else {
                let pstate = state.pumps.getItemById(this.pump.id);
                pstate.command = pstate.rpm > 0 || pstate.flow > 0 ? 10 : 0;
                resolve();
            }
        });
    };
    protected async requestPumpStatus() {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 7,
                    payload: [],
                    retries: 2,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) {
                            logger.error(`Error sending requestPumpStatus for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
    };
    protected setPumpToRemoteControl(running: boolean = true) {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 4,
                    payload: running ? [255] : [0], // when stopAsync is called, pass false to return control to pump panel
                    // payload: spump.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running') ? [255] : [0],
                    retries: 1,
                    response: true,
                    onComplete: (err) => {
                        if (err) {
                            logger.error(`Error sending setPumpToRemoteControl for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
    }
    protected setPumpFeature(feature?: number) {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            // empty payload (possibly 0?, too) is no feature
            // 6: Feature 1
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 5,
                    payload: typeof feature === 'undefined' ? [] : [feature],
                    retries: 2,
                    response: true,
                    onComplete: (err, msg: Outbound) => {
                        if (err) {
                            logger.error(`Error sending setPumpFeature for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
        else {
            
        }
    };
    protected async setPumpRPMAsync() {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 1,
                    payload: [2, 196, Math.floor(this._targetSpeed / 256), this._targetSpeed % 256],
                    retries: 1,
                    // timeout: 250,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) {
                            logger.error(`Error sending setPumpRPMAsync for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
        else {

        }
    };
    protected async setPumpGPMAsync() {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            // packet for vf; vsf will override
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 1,
                    payload: [2, 228, 0, this._targetSpeed],
                    retries: 1,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) {
                            logger.error(`Error sending setPumpGPMAsync for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
    };
    public async closeAsync() {
        try {
            this.suspendPolling = true;
            logger.info(`Nixie Pump closing ${this.pump.name}.`)
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let pstate = state.pumps.getItemById(this.pump.id);
            this._targetSpeed = 0;
            try { await this.setDriveStateAsync(false); } catch (err) { logger.error(`Error closing pump ${this.pump.name}: ${err.message}`) }
            try { await this.setPumpFeature(); } catch (err) { logger.error(`Error closing pump ${this.pump.name}: ${err.message}`) }
            try { await this.setDriveStateAsync(false); } catch (err) { logger.error(`Error closing pump ${this.pump.name}: ${err.message}`) }
            try { await this.setPumpToRemoteControl(false); } catch (err) { logger.error(`Error closing pump ${this.pump.name}: ${err.message}`) }
            this.closing = true;
            // Make sure the polling timer is dead after we have closted this all off.  That way we do not
            // have another process that revives it from the dead.
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            pstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Pump closeAsync: ${err.message}`); return Promise.reject(err); }
        finally { this.suspendPolling = false; }
    }
}
export class NixiePumpVS extends NixiePumpRS485 {
    public setTargetSpeed(pState: PumpState) {
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits = this.pump.circuits.get();

            for (let i = 0; i < pumpCircuits.length; i++) {
                let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                let pc = pumpCircuits[i];
                if (circ.isOn) _newSpeed = Math.max(_newSpeed, pc.speed);
            }
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this._targetSpeed = _newSpeed;
        if (this._targetSpeed !== 0) Math.min(Math.max(this.pump.minSpeed, this._targetSpeed), this.pump.maxSpeed);
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed} RPM.`);
    }
}
export class NixiePumpVF extends NixiePumpRS485 {
    public setTargetSpeed(pState: PumpState) {
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits = this.pump.circuits.get();
            for (let i = 0; i < pumpCircuits.length; i++) {
                let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                let pc = pumpCircuits[i];
                if (circ.isOn) _newSpeed = Math.max(_newSpeed, pc.flow);
            }
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this._targetSpeed = _newSpeed;
        if (this._targetSpeed !== 0) Math.min(Math.max(this.pump.minFlow, this._targetSpeed), this.pump.maxFlow);
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed} GPM.`);
    }
}
export class NixiePumpVSF extends NixiePumpRS485 {
    public setTargetSpeed(pState: PumpState) {
        let _newSpeed = 0;
        let maxRPM = 0;
        let maxGPM = 0;
        let flows = 0;
        let speeds = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits = this.pump.circuits.get();
            let pt = sys.board.valueMaps.pumpTypes.get(this.pump.type);
            // VSF pumps present a problem.  In fact they do not currently operate properly on Touch panels.  On touch these need to either be all in RPM or GPM
            // if there is a mix in the circuit array then they will not work.  In IntelliCenter if there is an RPM setting in the mix it will use RPM by converting
            // the GPM to RPM but if there is none then it will use GPM.
            let toRPM = (flowRate: number, minSpeed: number = 450, maxSpeed: number = 3450) => {
                let eff = .03317 * maxSpeed;
                let rpm = Math.min((flowRate * maxSpeed) / eff, maxSpeed);
                return rpm > 0 ? Math.max(rpm, minSpeed) : 0;
            };
            let toGPM = (speed: number, maxSpeed: number = 3450, minFlow: number = 15, maxFlow: number = 140) => {
                let eff = .03317 * maxSpeed;
                let gpm = Math.min((eff * speed) / maxSpeed, maxFlow);
                return gpm > 0 ? Math.max(gpm, minFlow) : 0;
            }
            for (let i = 0; i < pumpCircuits.length; i++) {
                let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                let pc = pumpCircuits[i];
                if (circ.isOn) {
                    if (pc.units > 0) {
                        maxGPM = Math.max(maxGPM, pc.flow);
                        // Calculate an RPM from this flow.
                        maxRPM = Math.max(maxGPM, toRPM(pc.flow, pt.minSpeed, pt.maxSpeed));
                        flows++;
                    }
                    else {
                        maxRPM = Math.max(maxRPM, pc.speed);
                        maxGPM = Math.max(maxGPM, toGPM(pc.speed, pt.maxSpeed, pt.minFlow, pt.maxFlow));
                        speeds++;
                    }
                }
            }
            _newSpeed = speeds > 0 || flows === 0 ? maxRPM : maxGPM;
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        // Send the flow message if it is flow and the rpm message if it is rpm.
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed} ${flows > 0 ? 'GPM' : 'RPM'}.`);
        this._targetSpeed = _newSpeed;
    }
    protected async setPumpRPMAsync() {
        // vsf action is 10 for rpm
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 10,
                    payload: [2, 196, Math.floor(this._targetSpeed / 256), this._targetSpeed % 256],
                    retries: 1,
                    // timeout: 250,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) {
                            logger.error(`Error sending setPumpRPMAsync for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
    };
    protected async setPumpGPMAsync() {
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            // vsf payload; different from vf payload
            return new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Pump,
                    dest: this.pump.address,
                    action: 9,
                    payload: [2, 196, 0, this._targetSpeed],
                    retries: 1,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) {
                            logger.error(`Error sending setPumpGPMAsync for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                        return
                    }
                });
                conn.queueSendMessage(out);
            });
        }
    };
};
export class NixiePumpHWVS extends NixiePumpRS485 {
    public setTargetSpeed(pState: PumpState) {
        let _newSpeed = 0;
        if (!pState.pumpOnDelay) {
            let pumpCircuits = this.pump.circuits.get();

            for (let i = 0; i < pumpCircuits.length; i++) {
                let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                let pc = pumpCircuits[i];
                if (circ.isOn) _newSpeed = Math.max(_newSpeed, pc.speed);
            }
        }
        if (isNaN(_newSpeed)) _newSpeed = 0;
        this._targetSpeed = _newSpeed;
        if (this._targetSpeed !== 0) Math.min(Math.max(this.pump.minSpeed, this._targetSpeed), this.pump.maxSpeed);
        if (this._targetSpeed !== _newSpeed) logger.info(`NCP: Setting Pump ${this.pump.name} to ${_newSpeed} RPM.`);
    }
    public async setServiceModeAsync() {
        this._targetSpeed = 0;
        await this.setPumpRPMAsync();
    }

    public async setPumpStateAsync(pstate: PumpState) {
        // Don't poll while we are seting the state.
        this.suspendPolling = true;
        try {
            let pt = sys.board.valueMaps.pumpTypes.get(this.pump.type);
            // Since these process are async the closing flag can be set
            // between calls.  We need to check it in between each call.
            try { if (!this.closing) { await this.setPumpRPMAsync(); } } catch (err) { }
            return new InterfaceServerResponse(200, 'Success');
        }
        catch (err) {
            logger.error(`Error running pump sequence for ${this.pump.name}: ${err.message}`);
            return Promise.reject(err);
        }
        finally { this.suspendPolling = false; }
    };
    protected async requestPumpStatus() { return Promise.resolve(); };
    protected setPumpFeature(feature?: number) { return Promise.resolve(); }
    protected setPumpToRemoteControl(running: boolean = true) {
        console.log(`Setting pump to remote control`);
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            // We do nothing on this pump to set it to remote control.  That is unless we are turning it off.
            return new Promise<void>((resolve, reject) => {
                if (!running) {
                    let out = Outbound.create({
                        portId: this.pump.portId || 0,
                        protocol: Protocol.Hayward,
                        source: 12, // Use the broadcast address
                        dest: this.pump.address,
                        action: 1,
                        payload: [0], // when stopAsync is called, pass false to return control to pump panel
                        // payload: spump.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running') ? [255] : [0],
                        retries: 1,
                        response: Response.create({ protocol: Protocol.Hayward, action: 12, source: this.pump.address - 96}),
                        onComplete: (err) => {
                            if (err) {
                                logger.error(`Error sending setPumpToRemoteControl for ${this.pump.name}: ${err.message}`);
                                reject(err);
                            }
                            else resolve();
                        }
                    });
                    conn.queueSendMessage(out);
                }
                else resolve();
            });
        }
    }
    protected async setPumpRPMAsync() {
        // Address 1
        //[][16, 2, 12, 1, 0][41][0, 72, 16, 3] out
        //[][16, 2, 0, 12, 0][0, 41, 0, 135][0, 206, 16, 3] In
        // Address 2
        //[][16, 2, 12, 1, 1][100][0, 132, 16, 3] out
        //[][16, 2, 0, 12, 1][0, 96, 21, 64][0, 212, 16, 3] in
        // Note that action 12 is in a different position for the outbound than the inbound.  The source and destination are kind
        // of a misnomer in that it identifies the equipment address in byte(4) of the header and flips the command address around.
        // So in essence for equipment item 0-16 (pump addresses) the outbound is really a broadcast on 12 (broadcast) from 1 and the inbound is
        // broadcast from the equipment item to 0 (anybody).
        if (conn.isPortEnabled(this.pump.portId || 0)) {
            return new Promise<void>((resolve, reject) => {
                let pt = sys.board.valueMaps.pumpTypes.get(this.pump.type);
                let out = Outbound.create({
                    portId: this.pump.portId || 0,
                    protocol: Protocol.Hayward,
                    source: 1, // Use the broadcast address
                    dest: this.pump.address - 96,
                    action: 12,
                    payload: [Math.min(Math.round((this._targetSpeed / pt.maxSpeed) * 100), 100)], // when stopAsync is called, pass false to return control to pump panel
                    retries: 1,
                    response: Response.create({ protocol: Protocol.Hayward, action: 12, source: this.pump.address - 96 }),
                    onComplete: (err) => {
                        if (err) {
                            let pstate = state.pumps.getItemById(this.pump.id);
                            pstate.command = 0;
                            pstate.rpm = 0;
                            pstate.watts = 0;
                            logger.error(`Error sending setPumpRPM for ${this.pump.name}: ${err.message}`);
                            reject(err);
                        }
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
        }
        else {
            let pstate = state.pumps.getItemById(this.pump.id);
            pstate.command = 0;
            pstate.rpm = 0;
            pstate.watts = 0;
        }
    };
}
