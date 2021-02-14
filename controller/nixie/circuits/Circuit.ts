import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Circuit, CircuitCollection, sys } from "../../../controller/Equipment";
import { CircuitState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieCircuitCollection extends NixieEquipmentCollection<NixieCircuit> {
    public async setCircuitAsync(circuit: Circuit, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieCircuit = this.find(elem => elem.id === circuit.id) as NixieCircuit;
            if (typeof c === 'undefined') {
                circuit.master = 1;
                c = new NixieCircuit(this.controlPanel, circuit);
                this.push(c);
                await c.setCircuitAsync(data);
                logger.info(`A circuit was not found for id #${circuit.id} creating circuit`);
            }
            else {
                await c.setCircuitAsync(data);
            }
        }
        catch (err) { logger.error(`setCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(circuits: CircuitCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < circuits.length; i++) {
                let circuit = circuits.getItemByIndex(i);
                if (circuit.master === 1) {
                    logger.info(`Initializing circuit ${circuit.name}`);
                    let ncircuit = new NixieCircuit(this.controlPanel, circuit);
                    this.push(ncircuit);
                }
            }
        }
        catch (err) { logger.error(`Nixie Circuit initAsync: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieCircuit extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public circuit: Circuit;
    constructor(ncp: INixieControlPanel, circuit: Circuit) {
        super(ncp);
        this.circuit = circuit;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.circuit !== 'undefined' ? this.circuit.id : -1; }
    public async setCircuitAsync(data: any) {
        try {
            let circuit = this.circuit;
        }
        catch (err) { logger.error(`Nixie setCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling circuit - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await this.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Circuit checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(circuit: Circuit, temp: CircuitState) {
        try {
            // The validation will be different if the circuit is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Circuit Hardware ${this.circuit.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        catch (err) { logger.error(`Nixie Circuit closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
