import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Circuit, CircuitCollection, sys } from "../../../controller/Equipment";
import { CircuitState, state, ICircuitState, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieCircuitCollection extends NixieEquipmentCollection<NixieCircuit> {
    public pollingInterval: number = 2000;
    private _pollTimer: NodeJS.Timeout = null;
    public async deleteCircuitAsync(id: number) {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let circ = this[i];
                if (circ.id === id) {
                    await circ.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { return Promise.reject(`Nixie Control Panel deleteCircuitAsync ${err.message}`); }
    }
    public async sendOnOffSequenceAsync(id: number, count: number | { isOn: boolean, timeout: number }[]) {
        try {
            let c: NixieCircuit = this.find(elem => elem.id === id) as NixieCircuit;
            if (typeof c === 'undefined') return Promise.reject(new Error(`NCP: Circuit ${id} could not be found to send sequence ${count}.`));
            await c.sendOnOffSequenceAsync(count);

        } catch (err) { return logger.error(`NCP: sendOnOffSequence: ${err.message}`); }
    }
    public async setCircuitStateAsync(cstate: ICircuitState, val: boolean) {
        try {
            let c: NixieCircuit = this.find(elem => elem.id === cstate.id) as NixieCircuit;
            if (typeof c === 'undefined') return Promise.reject(new Error(`NCP: Circuit ${cstate.id}-${cstate.name} could not be found to set the state to ${val}.`));
            await c.setCircuitStateAsync(cstate, val);
        }
        catch (err) { return logger.error(`NCP: setCircuitStateAsync ${cstate.id}-${cstate.name}: ${err.message}`); }
    }
    public async setCircuitAsync(circuit: Circuit, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieCircuit = this.find(elem => elem.id === circuit.id) as NixieCircuit;
            if (typeof c === 'undefined') {
                circuit.master = 1;
                c = new NixieCircuit(this.controlPanel, circuit);
                this.push(c);
                await c.setCircuitAsync(data);
                logger.debug(`NixieController: A circuit was not found for id #${circuit.id} creating circuit`);
            }
            else {
                await c.setCircuitAsync(data);
            }
        }
        catch (err) { logger.error(`setCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async checkCircuitEggTimerExpirationAsync(cstate: ICircuitState) {
     try {
        let c: NixieCircuit = this.find(elem => elem.id === cstate.id) as NixieCircuit;
        await c.checkCircuitEggTimerExpirationAsync(cstate);
    } catch (err) { logger.error(`NCP: Error synching circuit states: ${err}`); }
    }
    public async initAsync(circuits: CircuitCollection) {
        try {
            for (let i = 0; i < circuits.length; i++) {
                let circuit = circuits.getItemByIndex(i);
                if (circuit.master === 1) {
                    if (typeof this.find(elem => elem.id === circuit.id) === 'undefined') {
                        logger.info(`Initializing Nixie circuit ${circuit.name}`);
                        let ncircuit = new NixieCircuit(this.controlPanel, circuit);
                        this.push(ncircuit);
                    }
                }
            }
        }
        catch (err) { return Promise.reject(logger.error(`NixieController: Circuit initAsync: ${err.message}`)); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Circuit ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an errror.
    }

    public async initCircuitAsync(circuit: Circuit): Promise<NixieCircuit> {
        try {
            let c: NixieCircuit = this.find(elem => elem.id === circuit.id) as NixieCircuit;
            if (typeof c === 'undefined') {
                c = new NixieCircuit(this.controlPanel, circuit);
                this.push(c);
            }
            return c;
        } catch (err) { logger.error(`initCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollCircuitsAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;

        } catch (err) { logger.error(`Error polling circuits: ${err.message}`); return Promise.reject(err); }
        finally { this._pollTimer = setTimeout(async () => await self.pollCircuitsAsync(), this.pollingInterval || 10000); }
    }
}
export class NixieCircuit extends NixieEquipment {
    public circuit: Circuit;
    private _sequencing = false;
    private scheduled = false;
    private timeOn: Timestamp;
    constructor(ncp: INixieControlPanel, circuit: Circuit) {
        super(ncp);
        this.circuit = circuit;
        // Clear out the delays.
        let cstate = state.circuits.getItemById(circuit.id);
        cstate.startDelay = false;
        cstate.stopDelay = false;
    }
    public get id(): number { return typeof this.circuit !== 'undefined' ? this.circuit.id : -1; }
    public get eggTimerOff(): Timestamp { return typeof this.timeOn !== 'undefined' && !this.circuit.dontStop ? this.timeOn.clone().addMinutes(this.circuit.eggTimer) : undefined; }
    public async setCircuitAsync(data: any) {
        try {
            let circuit = this.circuit;
        }
        catch (err) { logger.error(`Nixie setCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async sendOnOffSequenceAsync(count: number | { isOn: boolean, timeout: number }[], timeout?:number): Promise<InterfaceServerResponse> {
        try {
            this._sequencing = true;
            let arr = [];
            if (typeof count === 'number') {
                let t = typeof timeout === 'undefined' ? 100 : timeout;
                arr.push({ isOn: false, timeout: t }); // This may not be needed but we always need to start from off.
                //[{ isOn: true, timeout: 1000 }, { isOn: false, timeout: 1000 }]
                for (let i = 0; i < count; i++) {
                    arr.push({ isOn: true, timeout: t });
                    if (i < count - 1) arr.push({ isOn: false, timeout: t });
                }
            }
            else arr = count;
            // The documentation for IntelliBrite is incorrect.  The sequence below will give us Party mode.
            // Party mode:2
            // Start: Off
            // On
            // Off
            // On
            // According to the docs this is the sequence they lay out.
            // Party mode:2
            // Start: On
            // Off
            // On
            // Off
            // On

            let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
            return res;
        } catch (err) { logger.error(`Nixie: Error sending circuit sequence ${this.id}: ${count}`); }
        finally { this._sequencing = false; }
    }
    public async setThemeAsync(cstate: ICircuitState, theme: number): Promise<InterfaceServerResponse> {
        try {
            


            return new InterfaceServerResponse(200, 'Sucess');
        } catch (err) { logger.error(`Nixie: Error setting light theme ${cstate.id}-${cstate.name} to ${theme}`); }
    }
    public async setCircuitStateAsync(cstate: ICircuitState, val: boolean, scheduled: boolean = false): Promise<InterfaceServerResponse> {
        try {
            if (val !== cstate.isOn) {
                logger.info(`NCP: Setting Circuit ${cstate.name} to ${val}`);
                if (cstate.isOn && val) {
                    // We are already on so lets check the egg timer and shut it off if it has expired.
                    let eggOff = this.eggTimerOff;
                    if (typeof eggOff !== 'undefined' && eggOff.getTime() <= new Date().getTime()) val = false;
                }
                // Check to see if we should be on by poking the schedules.
            }
            if (utils.isNullOrEmpty(this.circuit.connectionId) || utils.isNullOrEmpty(this.circuit.deviceBinding)) {
                sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(cstate.id), cstate, val);
                cstate.isOn = val;
                return new InterfaceServerResponse(200, 'Success');
            }
            if (this._sequencing) return new InterfaceServerResponse(200, 'Success');
            let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, { isOn: val, latch: val ? 10000 : undefined });
            if (res.status.code === 200) {
                sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(cstate.id), cstate, val);
                // Set this up so we can process our egg timer.
                //if (!cstate.isOn && val) { cstate.startTime = this.timeOn = new Timestamp(); }
                //else if (!val) cstate.startTime = this.timeOn = undefined;
                cstate.isOn = val;
            }
            return res;
        } catch (err) { logger.error(`Nixie: Error setting circuit state ${cstate.id}-${cstate.name} to ${val}`); }
    }
    public async checkCircuitEggTimerExpirationAsync(cstate: ICircuitState) {
        // if circuit end time is past current time, either the schedule is finished
        // (this should already be turned off) or the egg timer has expired
        try {
            if (!cstate.isActive || !cstate.isOn) return;
            if (typeof cstate.endTime !== 'undefined') {
                if (cstate.endTime.toDate() < new Timestamp().toDate()) {
                    await sys.board.circuits.setCircuitStateAsync(cstate.id, false);
                    cstate.emitEquipmentChange();
                }
            }
        } catch (err) { logger.error(`Error syncing circuit: ${err}`); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Circuit checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(circuit: Circuit, cstate: CircuitState) {
        try {
            if (typeof circuit.connectionId !== 'undefined' && circuit.connectionId !== ''
                && typeof circuit.deviceBinding !== 'undefined' && circuit.deviceBinding !== '') {
                try {
                    let stat = await this.checkHardwareStatusAsync(circuit.connectionId, circuit.deviceBinding);
                    // If we have a status check the return.
                    cstate.commStatus = stat.hasFault ? 1 : 0;
                } catch (err) { cstate.commStatus = 1; }
            }
            else
                cstate.commStatus = 0;
            // The validation will be different if the circuit is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Circuit Hardware ${this.circuit.name}: ${err.message}`); cstate.commStatus = 1; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            let cstate = state.circuits.getItemById(this.circuit.id);
            cstate.stopDelay = false;
            cstate.startDelay = false;
            await this.setCircuitStateAsync(cstate, false);
            cstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Circuit closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
