import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Circuit, CircuitCollection, sys } from "../../../controller/Equipment";
import { CircuitState, state, ICircuitState, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { delayMgr } from '../../../controller/Lockouts';
import { time } from 'console';

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
    public async setServiceModeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    let c = this[i] as NixieCircuit;
                    await c.setServiceModeAsync();
                } catch (err) { logger.error(`Error stopping Nixie Circuit ${err}`); }
            }

        } catch (err) { return logger.error(`NCP: setServiceModeAsync: ${err.message}`); }
    }
    public async setLightThemeAsync(id: number, theme: any) {
        let c: NixieCircuit = this.find(elem => elem.id === id) as NixieCircuit;
        if (typeof c === 'undefined') return Promise.reject(new Error(`NCP: Circuit ${id} could not be found to set light theme ${theme.name}.`));
        await c.setLightThemeAsync(theme);
    } catch(err) { return logger.error(`NCP: sendOnOffSequence: ${err.message}`); }
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
    private timeOff: Timestamp;
    constructor(ncp: INixieControlPanel, circuit: Circuit) {
        super(ncp);
        this.circuit = circuit;
        // Clear out the delays.
        let cstate = state.circuits.getItemById(circuit.id);
        cstate.startDelay = false;
        cstate.stopDelay = false;
        cstate.name = circuit.name;
        cstate.type = circuit.type;
        cstate.showInFeatures = circuit.showInFeatures;
    }
    public async setServiceModeAsync() {
        let cstate = state.circuits.getItemById(this.circuit.id);
        await this.setCircuitStateAsync(cstate, false, false);
    }
    public get id(): number { return typeof this.circuit !== 'undefined' ? this.circuit.id : -1; }
    public get eggTimerOff(): Timestamp { return typeof this.timeOn !== 'undefined' && !this.circuit.dontStop ? this.timeOn.clone().addMinutes(this.circuit.eggTimer) : undefined; }
    public async setCircuitAsync(data: any) {
        try {
            let circuit = this.circuit;
        }
        catch (err) { logger.error(`Nixie setCircuitAsync: ${err.message}`); return Promise.reject(err); }
    }
    protected async setIntelliBriteThemeAsync(cstate: CircuitState, theme: any): Promise<InterfaceServerResponse> {
        let arr = [];
        let count = typeof theme !== 'undefined' && theme.sequence ? theme.sequence : 0;

        // Removing this. No need to turn the light off first.  We actually need it on to start the sequence for theme setting to work correctly when the light is starting from the off state.
        // if (cstate.isOn) arr.push({ isOn: false, timeout: 1000 });

        // Start the sequence of off/on after the light is on.
        arr.push({ isOn: true, timeout: 100 });
        for (let i = 0; i < count; i++) {
            arr.push({ isOn: false, timeout: 100 });
            arr.push({ isOn: true, timeout: 100 });
        }
        // Ensure light stays on long enough for the theme to stick (required for light group theme setting to function correctly).
        // 2s was too short.
        arr.push({ isOn: true, timeout: 3000 });

        logger.debug(arr);
        let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
        // Even though we ended with on we need to make sure that the relay stays on now that we are done.
        if (!res.error) {
            this._sequencing = false;
            await this.setCircuitStateAsync(cstate, true, false);
        }
        return res;
    }
    protected async setPoolToneThemeAsync(cstate: CircuitState, theme: any): Promise<InterfaceServerResponse> {
        let ptheme = sys.board.valueMaps.lightThemes.findItem(cstate.lightingTheme) || { val: 0, sequence: 0 };
        // First check to see if we are on.  If we are not then we need to emit our status as if we are initializing and busy.
        let arr = [];
        if (ptheme.val === 0) {
            // We don't know our previous theme so we are going to sync the lights to get a starting point.
            arr.push({ isOn: true, timeout: 1000 }); // Turn on for 1 second
            arr.push({ isOn: false, timeout: 5000 }); // Turn off for 5 seconds
            arr.push({ isOn: true, timeout: 1000 });
            ptheme = sys.board.valueMaps.lightThemes.findItem('eveningsea');
        }
        let count = theme.sequence - ptheme.sequence;
        if (count < 0) count = count + 16;
        for (let i = 0; i < count; i++) {
            arr.push({ isOn: true, timeout: 200 });
            arr.push({ isOn: false, timeout: 200 });
        }
        console.log(arr);
        if (arr.length === 0) return new InterfaceServerResponse(200, 'Success');
        let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
        // Even though we ended with on we need to make sure that the relay stays on now that we are done.
        if (!res.error) {
            cstate.lightingTheme = ptheme.val;
            cstate.isOn = true; // At this point the relay will be off but we want the process
            // to assume that the relay state is not actually changing.
            this._sequencing = false;
            await this.setCircuitStateAsync(cstate, true, false);
        }
        return res;
    }
    protected async setWaterColorsThemeAsync(cstate: CircuitState, theme: any): Promise<InterfaceServerResponse> {
        // RSG 2024.12.24 - This logic was aligned with the Pool Tone themes.  I haven't checked if that 
        // logic is correct, but made a copy and adjusted for the watercolors themes.
        
        let ptheme = sys.board.valueMaps.lightThemes.findItem(cstate.lightingTheme) || { val: 0, sequence: 0 };
        // First check to see if we are on.  If we are not then we need to emit our status as if we are initializing and busy.
        let arr = [];
        if (ptheme.val === 0) {
            // We don't know our previous theme so we are going to sync the lights to get a starting point.
            arr.push({ isOn: true, timeout: 1000 }); // Turn on for 1 second
            arr.push({ isOn: false, timeout: 5000 }); // Turn off for 5 seconds
            arr.push({ isOn: true, timeout: 1000 });
            ptheme = sys.board.valueMaps.lightThemes.findItem('alpinewhite');
        }
        let count = theme.sequence - ptheme.sequence;
        if (count < 0) count = count + 14;
        for (let i = 0; i < count; i++) {
            arr.push({ isOn: true, timeout: 200 });
            arr.push({ isOn: false, timeout: 200 });
        }
        console.log(arr);
        if (arr.length === 0) return new InterfaceServerResponse(200, 'Success');
        let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
        // Even though we ended with on we need to make sure that the relay stays on now that we are done.
        if (!res.error) {
            cstate.lightingTheme = ptheme.val;
            cstate.isOn = true; // At this point the relay will be off but we want the process
            // to assume that the relay state is not actually changing.
            this._sequencing = false;
            await this.setCircuitStateAsync(cstate, true, false);
        }
        return res;
    }
    protected async setColorLogicThemeAsync(cstate: CircuitState, theme: any): Promise<InterfaceServerResponse> {
        let ptheme = sys.board.valueMaps.lightThemes.findItem(cstate.lightingTheme) || { val: 0, sequence: 0 };
        // First check to see if we are on.  If we are not then we need to emit our status as if we are initializing and busy.
        let arr = [];
        if (ptheme.val === 0) {
            // We don't know our previous theme so we are going to sync the lights to get a starting point.
            arr.push({ isOn: true, timeout: 1000 }); // Turn on for 1 second
            arr.push({ isOn: false, timeout: 12000 }); // Turn off for 12 seconds
            arr.push({ isOn: true, timeout: 1000 });
            ptheme = sys.board.valueMaps.lightThemes.findItem('voodoolounge');
        }
        else if (!cstate.isOn) {
            if (typeof this.timeOff === 'undefined' || new Date().getTime() - this.timeOff.getTime() > 15000) {
                // We have been off for more than 15 seconds so we need to turn it on then wait for 17 seconds while the safety light processes.
                arr.push({ isOn: true, timeout: 17000 }); // Crazy pants
            }
            else arr.push({ isOn: true, timeout: 1000 }); // Start with on
        }
        let count = theme.sequence - ptheme.sequence;
        if (count < 0) count = count + 17;
        for (let i = 0; i < count; i++) {
            arr.push({ isOn: true, timeout: 200 }); // Use 200ms since @Crewski verified 200ms is reliable
            arr.push({ isOn: false, timeout: 200 });
        }
        console.log(arr);
        if (arr.length === 0) return new InterfaceServerResponse(200, 'Success');
        let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
        // Even though we ended with on we need to make sure that the relay stays on now that we are done.
        if (!res.error) {
            cstate.lightingTheme = ptheme.val;
            cstate.isOn = true; // At this point the relay will be off but we want the process
            // to assume that the relay state is not actually changing.
            this._sequencing = false;
            await this.setCircuitStateAsync(cstate, true, false);
        }
        return res;
    }
    // This method only dispatches to the proper light setting algorithm.  Previously we assumed that simply switching on/off sequences the proper
    // number of times was all there was but the nutcases who make these things must torture small animals.
    public async setLightThemeAsync(theme: any) {
        try {
            this._sequencing = true;
            let res = new InterfaceServerResponse(200, 'Success');
            let arr = [];
            let cstate = state.circuits.getItemById(this.circuit.id);
            let type = sys.board.valueMaps.circuitFunctions.transform(this.circuit.type);
            // Now set the command state so that users do not get all button mashy.
            cstate.action = sys.board.valueMaps.circuitActions.getValue('settheme');
            cstate.emitEquipmentChange();
            switch (type.name) {
                case 'colorcascade':
                case 'globrite':
                case 'magicstream':
                case 'intellibrite':
                    res = await this.setIntelliBriteThemeAsync(cstate, theme);
                    break;
                case 'colorlogic':
                    res = await this.setColorLogicThemeAsync(cstate, theme);
                    break;
                case 'watercolors':
                    res = await this.setWaterColorsThemeAsync(cstate, theme);
                    break;
                case 'pooltone':
                    res = await this.setPoolToneThemeAsync(cstate, theme);
                    break;
            }
            cstate.action = 0;
            // Make sure clients know that we are done.
            cstate.emitEquipmentChange();
            return res;
        } catch (err) { logger.error(`Nixie: Error setting lighting theme ${this.id} - ${theme.desc}: ${err.message}`); }
        finally { this._sequencing = false; }
    }
    public async sendOnOffSequenceAsync(count: number | { isOn: boolean, timeout: number }[], timeout?: number): Promise<InterfaceServerResponse> {
        try {

            this._sequencing = true;
            let arr = [];
            let cstate = state.circuits.getItemById(this.circuit.id);

            if (typeof count === 'number') {
                if (cstate.isOn) arr.push({ isOn: false, timeout: 1000 });
                let t = typeof timeout === 'undefined' ? 100 : timeout;
                //arr.push({ isOn: false, timeout: t }); // This may not be needed but we always need to start from off.
                //[{ isOn: true, timeout: 1000 }, { isOn: false, timeout: 1000 }]
                for (let i = 0; i < count; i++) {
                    if (i < count - 1) {
                        arr.push({ isOn: true, timeout: t });
                        arr.push({ isOn: false, timeout: t });
                    }
                    else arr.push({ isOn: true, timeout: 1000 });
                }
                console.log(arr);
            }
            else arr = count;
            let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, arr, 60000);
            // Even though we ended with on we need to make sure that the relay stays on now that we are done.
            if (!res.error) {
                this._sequencing = false;
                await this.setCircuitStateAsync(cstate, true, false);
            }
            return res;
        } catch (err) { logger.error(`Nixie: Error sending circuit sequence ${this.id}: ${count}`); }
        finally { this._sequencing = false; }
    }
    public async setCircuitStateAsync(cstate: ICircuitState, val: boolean, scheduled: boolean = false): Promise<InterfaceServerResponse> {
        try {
            // Lets do some special processing here for service mode
            if (state.mode !== 0 && val) {
                // Always set the state to off if we are in service mode for bodies.  Other circuits
                // may actually be turned on but only if they are not one of the body circuits.
                switch (sys.board.valueMaps.circuitFunctions.getName(this.circuit.type)) {
                    case 'pool':
                    case 'spa':
                    case 'chemrelay':
                        val = false;
                        break;
                }
            }
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
                if (val && val !== cstate.isOn) {
                    sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(cstate.id), cstate, val);
                }
                else if (!val) {
                    if (cstate.manualPriorityActive) delayMgr.cancelManualPriorityDelay(cstate.id);
                    cstate.manualPriorityActive = false; // if the delay was previously cancelled, still need to turn this off
                }
                cstate.isOn = val;
                return new InterfaceServerResponse(200, 'Success');
            }
            if (this._sequencing) return new InterfaceServerResponse(200, 'Success');
            let res = await NixieEquipment.putDeviceService(this.circuit.connectionId, `/state/device/${this.circuit.deviceBinding}`, { isOn: val, latch: val ? 10000 : undefined });
            if (res.status.code === 200) {
                // Set this up so we can process our egg timer.
                if (val && val !== cstate.isOn) {
                    sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(cstate.id), cstate, val);
                    switch (sys.board.valueMaps.circuitFunctions.getName(this.circuit.type)) {
                        case 'colorlogic':
                            if (!this._sequencing) {
                                // We need a little bit of special time for ColorLogic circuits.  
                                let timeDiff = typeof this.timeOff === 'undefined' ? 30000 : new Date().getTime() - this.timeOff.getTime();
                                //logger.info(`Resetting ColorLogic themes ${cstate.isOn}:${val} ${cstate.lightingTheme}... ${timeDiff}`);
                                if (timeDiff > 15000) {
                                    // There is this wacko thing that the lights will come on white for 15 seconds
                                    // so we need to make sure they don't try to advance the theme setting during this period.  We will simply set this to a holding pattern for
                                    // that timeframe.
                                    cstate.action = sys.board.valueMaps.circuitActions.getValue('settheme');
                                    let theme = cstate.lightingTheme;
                                    cstate.lightingTheme = sys.board.valueMaps.lightThemes.getValue('cloudwhite');
                                    cstate.startDelay = true;
                                    setTimeout(() => { cstate.startDelay = false; cstate.action = 0; cstate.lightingTheme = theme; cstate.emitEquipmentChange(); }, 17000);
                                }
                                else if (timeDiff <= 10000) {
                                    // If the user turns the light back on within 10 seconds.  Surprise!  You are forced into the next theme.
                                    let thm = sys.board.valueMaps.lightThemes.get(cstate.lightingTheme);
                                    let themes = this.circuit.getLightThemes();
                                    cstate.lightingTheme = thm.sequence === 17 ? themes.find(elem => elem.sequence === 1).val : themes.find(elem => elem.sequence === thm.sequence + 1).val;
                                }
                                else if (timeDiff <= 15000) {
                                    // If the user turns the light back on before 15 seconds expire then we are going to do voodoo.  Switch the theme to voodoolounge.
                                    cstate.lightingTheme = sys.board.valueMaps.lightThemes.getValue('voodoolounge');
                                }
                            }
                            break;
                    }
                }
                else if (!val) {
                    delayMgr.cancelManualPriorityDelays();
                    cstate.manualPriorityActive = false; // if the delay was previously cancelled, still need to turn this off
                }
                if (!val && cstate.isOn) this.timeOff = new Timestamp();
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
