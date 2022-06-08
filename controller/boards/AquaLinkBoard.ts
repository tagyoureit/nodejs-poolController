/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as extend from 'extend';
import { logger } from '../../logger/Logger';
import { Message, Outbound, Protocol, Response } from '../comms/messages/Messages';
import { BodyCommands, byteValueMap, ChemControllerCommands, ChlorinatorCommands, CircuitCommands, ConfigQueue, ConfigRequest, EquipmentIdRange, FeatureCommands, HeaterCommands, PumpCommands, ScheduleCommands, SystemBoard, SystemCommands } from './SystemBoard';
import { BodyTempState, ChlorinatorState, ICircuitGroupState, ICircuitState, LightGroupState, state } from '../State';
import { Body, ChemController, ConfigVersion, EggTimer, Feature, Heater, ICircuit, LightGroup, LightGroupCircuit, PoolSystem, Pump, Schedule, sys } from '../Equipment';
import { EquipmentTimeoutError, InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../Errors';
import { conn } from '../comms/Comms';
import { ncp } from "../nixie/Nixie";
import { utils } from '../Constants';

export class AquaLinkBoard extends SystemBoard {
    constructor(system: PoolSystem) {
        super(system);
        this.equipmentIds.features.start = 41;
        this.equipmentIds.features.end = 50;
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'IT5', part: 'i5+3', desc: 'IntelliTouch i5+3', circuits: 6, shared: true }],
            [1, { name: 'IT7', part: 'i7+3', desc: 'IntelliTouch i7+3', circuits: 8, shared: true }],
            [2, { name: 'IT9', part: 'i9+3', desc: 'IntelliTouch i9+3', circuits: 10, shared: true }],
            [3, { name: 'IT5S', part: 'i5+3S', desc: 'IntelliTouch i5+3S', circuits: 5, shared: false, bodies: 1, intakeReturnValves: false }],
            [4, { name: 'IT9S', part: 'i9+3S', desc: 'IntelliTouch i9+3S', circuits: 9, shared: false, bodies: 1, intakeReturnValves: false }],
            [5, { name: 'IT10D', part: 'i10D', desc: 'IntelliTouch i10D', circuits: 10, shared: false, dual: true }],
            [32, { name: 'IT5X', part: 'i5X', desc: 'IntelliTouch i5X', circuits: 5 }],
            [33, { name: 'IT10X', part: 'i10X', desc: 'IntelliTouch i10X', circuits: 10 }]
        ]);
    }
    public initExpansionModules(byte1: number, byte2: number) {
        console.log(`Jandy AquaLink System Detected!`);
        state.emitControllerChange();
    }
    public bodies: AquaLinkBodyCommands = new AquaLinkBodyCommands(this);
    public system: AquaLinkSystemCommands = new AquaLinkSystemCommands(this);
    public circuits: AquaLinkCircuitCommands = new AquaLinkCircuitCommands(this);
    public features: AquaLinkFeatureCommands = new AquaLinkFeatureCommands(this);
    public chlorinator: AquaLinkChlorinatorCommands = new AquaLinkChlorinatorCommands(this);
    public pumps: AquaLinkPumpCommands = new AquaLinkPumpCommands(this);
    public schedules: AquaLinkScheduleCommands = new AquaLinkScheduleCommands(this);
    public heaters: AquaLinkHeaterCommands = new AquaLinkHeaterCommands(this);
    protected _configQueue: AquaLinkConfigQueue = new AquaLinkConfigQueue();

}
class AquaLinkConfigQueue extends ConfigQueue {
    //protected _configQueueTimer: NodeJS.Timeout;
    //public clearTimer(): void { clearTimeout(this._configQueueTimer); }
    protected queueRange(cat: number, start: number, end: number) {}
    protected queueItems(cat: number, items: number[] = [0]) { }
    public queueChanges() {
        this.reset();
        logger.info(`Requesting ${sys.controllerType} configuration`);
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else {
            state.status = 1;
        }
        state.emitControllerChange();
    }
    // TODO: RKS -- Investigate why this is needed.  Me thinks that there really is no difference once the whole thing is optimized.  With a little
    // bit of work I'll bet we can eliminate these extension objects altogether.
    public processNext(msg?: Outbound) {
        if (this.closed) return;
        if (typeof msg !== "undefined" && msg !== null)
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.action, msg.payload[0]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            this.curr.oncomplete(this.curr);
                            this.curr.oncomplete = undefined;
                        }
                    }
                }

            } else this.curr.failed = true;
        if (!this.curr && this.queue.length > 0) this.curr = this.queue.shift();
        if (!this.curr) {
            // There never was anything for us to do. We will likely never get here.
            state.status = 1;
            state.emitControllerChange();
            return;
        } else {
            state.status = sys.board.valueMaps.controllerStatus.transform(2, this.percent);
        }
        // Shift to the next config queue item.
        logger.verbose(`Config Queue Completed... ${this.percent}% (${this.remainingItems} remaining)`);
        while ( this.queue.length > 0 && this.curr.isComplete) { this.curr = this.queue.shift() || null; }
        let itm = 0;
        const self = this;
        if (this.curr && !this.curr.isComplete) {
            itm = this.curr.items.shift();
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            sys.configVersion.lastUpdated = new Date();
            // set a timer for 20 mins; if we don't get the config request it again.  This most likely happens if there is no other indoor/outdoor remotes or ScreenLogic.
            // this._configQueueTimer = setTimeout(()=>{sys.board.checkConfiguration();}, 20 * 60 * 1000);
            logger.info(`AquaLink system config complete.`);
            state.cleanupState();
            ncp.initAsync(sys);
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
class AquaLinkScheduleCommands extends ScheduleCommands {
    public async setScheduleAsync(data: any): Promise<Schedule> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
        let sched = sys.schedules.getItemById(id, id > 0);
        let ssched = state.schedules.getItemById(id, id > 0);
        let schedType = typeof data.scheduleType !== 'undefined' ? data.scheduleType : sched.scheduleType;
        if (typeof schedType === 'undefined') schedType = sys.board.valueMaps.scheduleTypes.getValue('repeat'); // Repeats

        let startTimeType = typeof data.startTimeType !== 'undefined' ? data.startTimeType : sched.startTimeType;
        let endTimeType = typeof data.endTimeType !== 'undefined' ? data.endTimeType : sched.endTimeType;
        // let startDate = typeof data.startDate !== 'undefined' ? data.startDate : sched.startDate;
        // if (typeof startDate.getMonth !== 'function') startDate = new Date(startDate);
        let heatSource = typeof data.heatSource !== 'undefined' && data.heatSource !== null ? data.heatSource : sched.heatSource || 32;
        let heatSetpoint = typeof data.heatSetpoint !== 'undefined' ? data.heatSetpoint : sched.heatSetpoint;
        let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
        let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
        let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
        let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays || 255); // default to all days
        let changeHeatSetpoint = typeof (data.changeHeatSetpoint !== 'undefined') ? utils.makeBool(data.changeHeatSetpoint) : sched.changeHeatSetpoint;
        let display = typeof data.display !== 'undefined' ? data.display : sched.display || 0;

        // Ensure all the defaults.
        // if (isNaN(startDate.getTime())) startDate = new Date();
        if (typeof startTime === 'undefined') startTime = 480; // 8am
        if (typeof endTime === 'undefined') endTime = 1020; // 5pm
        if (typeof startTimeType === 'undefined') startTimeType = 0; // Manual
        if (typeof endTimeType === 'undefined') endTimeType = 0; // Manual
        if (typeof circuit === 'undefined') circuit = 6; // pool
        if (typeof heatSource !== 'undefined' && typeof heatSetpoint === 'undefined') heatSetpoint = state.temps.units === sys.board.valueMaps.tempUnits.getValue('C') ? 26 : 80;
        if (typeof changeHeatSetpoint === 'undefined') changeHeatSetpoint = false;

        // At this point we should have all the data.  Validate it.
        if (!sys.board.valueMaps.scheduleTypes.valExists(schedType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule type; ${schedType}`, 'Schedule', schedType)); }
        if (!sys.board.valueMaps.scheduleTimeTypes.valExists(startTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid start time type; ${startTimeType}`, 'Schedule', startTimeType)); }
        if (!sys.board.valueMaps.scheduleTimeTypes.valExists(endTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid end time type; ${endTimeType}`, 'Schedule', endTimeType)); }
        if (!sys.board.valueMaps.heatSources.valExists(heatSource)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid heat source: ${heatSource}`, 'Schedule', heatSource)); }
        if (heatSetpoint < 0 || heatSetpoint > 104) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid heat setpoint: ${heatSetpoint}`, 'Schedule', heatSetpoint)); }
        if (sys.board.circuits.getCircuitReferences(true, true, false, true).find(elem => elem.id === circuit) === undefined) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid circuit reference: ${circuit}`, 'Schedule', circuit)); }
        if (typeof heatSource !== 'undefined' && !sys.circuits.getItemById(circuit).hasHeatSource) heatSource = undefined;

        // If we make it here we can make it anywhere.
        // let runOnce = (schedDays || (schedType !== 0 ? 0 : 0x80));
        if (schedType === sys.board.valueMaps.scheduleTypes.getValue('runonce')) {
            // make sure only 1 day is selected
            let scheduleDays = sys.board.valueMaps.scheduleDays.transform(schedDays);
            let s2 = sys.board.valueMaps.scheduleDays.toArray();
            if (scheduleDays.days.length > 1) {
                schedDays = scheduleDays.days[scheduleDays.days.length - 1].val;  // get the earliest day in the week
            }
            else if (scheduleDays.days.length === 0) {
                for (let i = 0; i < s2.length; i++) {
                    if (s2[i].days[0].name === 'sun') schedDays = s2[i].val;
                }
            }
            // update end time incase egg timer changed
            const eggTimer = sys.circuits.getInterfaceById(circuit).eggTimer || 720;
            endTime = (startTime + eggTimer) % 1440; // remove days if we go past midnight
        }


        // If we have sunrise/sunset then adjust for the values; if heliotrope isn't set just ignore
        if (state.heliotrope.isCalculated) {
            const sunrise = state.heliotrope.sunrise.getHours() * 60 + state.heliotrope.sunrise.getMinutes();
            const sunset = state.heliotrope.sunset.getHours() * 60 + state.heliotrope.sunset.getMinutes();
            if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) startTime = sunrise;
            else if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) startTime = sunset;
            if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) endTime = sunrise;
            else if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) endTime = sunset;
        }
        return new Promise<Schedule>((resolve, reject) => {
            resolve(sys.schedules.getItemById(id));
        });
    }
    public async deleteScheduleAsync(data: any): Promise<Schedule> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
        let sched = sys.schedules.getItemById(id);
        let ssched = state.schedules.getItemById(id);
        return new Promise<Schedule>((resolve, reject) => {
            resolve(sched);
        });
    }
    public async setEggTimerAsync(data?: any): Promise<EggTimer> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule/eggTimer id: ${data.id} or all schedule/eggTimer ids filled (${sys.eggTimers.length + sys.schedules.length} used out of ${sys.equipment.maxSchedules})`, data.id, 'Schedule'));
        let circuit = sys.circuits.getInterfaceById(data.circuit);
        if (typeof circuit === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.circuit} for schedule id ${data.id}`, data.id, 'Schedule'));
        return new Promise<EggTimer>((resolve, reject) => { resolve(sys.eggTimers.getItemById(id)); });
    }
    public async deleteEggTimerAsync(data: any): Promise<EggTimer> {
        return new Promise<EggTimer>((resolve, reject) => {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (isNaN(id) || id < 0) reject(new InvalidEquipmentIdError(`Invalid eggTimer id: ${data.id}`, data.id, 'Schedule'));
            let eggTimer = sys.eggTimers.getItemById(id);
            resolve(eggTimer);
        });
    }
}
class AquaLinkSystemCommands extends SystemCommands {
    public async cancelDelay() {
        return new Promise<void>((resolve, reject) => {
            resolve(state.data.delay);
        });
    }
    public async setDateTimeAsync(obj: any): Promise<any> {
        let dayOfWeek = function (): number {
            // for IntelliTouch set date/time
            if (state.time.toDate().getUTCDay() === 0)
                return 0;
            else
                return Math.pow(2, state.time.toDate().getUTCDay() - 1);
        }
        return new Promise<any>((resolve, reject) => {
            resolve({
                time: state.time.format(),
                adjustDST: sys.general.options.adjustDST,
                clockSource: sys.general.options.clockSource
            });
        });
    }
}
class AquaLinkBodyCommands extends BodyCommands {
    public async setBodyAsync(obj: any): Promise<Body> {
        try {
            return new Promise<Body>((resolve, reject) => {
                let manualHeat = sys.general.options.manualHeat;
                if (typeof obj.manualHeat !== 'undefined') manualHeat = utils.makeBool(obj.manualHeat);
                let body = sys.bodies.getItemById(obj.id, false);
                let intellichemInstalled = sys.chemControllers.getItemByAddress(144, false).isActive;
                resolve(body);
            });

        }
        catch (err) { return Promise.reject(err); }
    }
    public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
            const body1 = sys.bodies.getItemById(1);
            const body2 = sys.bodies.getItemById(2);
            const temp1 = body1.setPoint || 100;
            const temp2 = body2.setPoint || 100;
            let cool = body1.coolSetpoint || 0;
            let mode1 = body1.heatMode;
            let mode2 = body2.heatMode;
            body.id === 1 ? mode1 = mode : mode2 = mode;
            let bstate = state.temps.bodies.getItemById(body.id);
            resolve(bstate);
        });
    }
    public async setSetpoints(body: Body, obj: any): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
            let setPoint = typeof obj.setPoint !== 'undefined' ? parseInt(obj.setPoint, 10) : parseInt(obj.heatSetpoint, 10);
            let coolSetPoint = typeof obj.coolSetPoint !== 'undefined' ? parseInt(obj.coolSetPoint, 10) : 0;
            if (isNaN(setPoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid ${body.name} setpoint ${obj.setPoint || obj.heatSetpoint}`, 'body', obj));
            const tempUnits = state.temps.units;
            switch (tempUnits) {
                case 0: // fahrenheit
                    {
                        if (setPoint < 40 || setPoint > 104) {
                            logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                        }
                        if (coolSetPoint < 40 || coolSetPoint > 104) {
                            logger.warn(`Cool Setpoint of ${setPoint} is outside acceptable range.`);
                            return;
                        }
                        break;
                    }
                case 1: // celsius
                    {
                        if (setPoint < 4 || setPoint > 40) {
                            logger.warn(
                                `Setpoint of ${setPoint} is outside of acceptable range.`
                            );
                            return;
                        }
                        if (coolSetPoint < 4 || coolSetPoint > 40) {
                            logger.warn(`Cool SetPoint of ${coolSetPoint} is outside of acceptable range.`
                            );
                            return;
                        }
                        break;
                    }
            }
            const body1 = sys.bodies.getItemById(1);
            const body2 = sys.bodies.getItemById(2);
            let temp1 = body1.setPoint || tempUnits === 0 ? 40 : 4;
            let temp2 = body2.setPoint || tempUnits === 0 ? 40 : 4;
            let cool = coolSetPoint || body1.setPoint + 1;
            body.id === 1 ? temp1 = setPoint : temp2 = setPoint;
            const mode1 = body1.heatMode;
            const mode2 = body2.heatMode;
            let bstate = state.temps.bodies.getItemById(body.id);
            resolve(bstate);
        });
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
            const tempUnits = state.temps.units;
            switch (tempUnits) {
                case 0: // fahrenheit
                    if (setPoint < 40 || setPoint > 104) {
                        logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                        return;
                    }
                    break;
                case 1: // celsius
                    if (setPoint < 4 || setPoint > 40) {
                        logger.warn(
                            `Setpoint of ${setPoint} is outside of acceptable range.`
                        );
                        return;
                    }
                    break;
            }
            const body1 = sys.bodies.getItemById(1);
            const body2 = sys.bodies.getItemById(2);
            let temp1 = body1.setPoint || 100;
            let temp2 = body2.setPoint || 100;
            body.id === 1 ? temp1 = setPoint : temp2 = setPoint;
            const mode1 = body1.heatMode || 0;
            const mode2 = body2.heatMode || 0;
            let cool = body1.coolSetpoint || (body1.setPoint + 1);
            let bstate = state.temps.bodies.getItemById(body.id);
            resolve(bstate);
        });
    }
    public async setCoolSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
            // [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,Cool,2,56]
            // 165,33,16,34,136,4,89,99,7,0,2,71  Request
            // 165,33,34,16,1,1,136,1,130  Controller Response
            const tempUnits = state.temps.units;
            switch (tempUnits) {
                case 0: // fahrenheit
                    if (setPoint < 40 || setPoint > 104) {
                        logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                        return;
                    }
                    break;
                case 1: // celsius
                    if (setPoint < 4 || setPoint > 40) {
                        logger.warn(
                            `Setpoint of ${setPoint} is outside of acceptable range.`
                        );
                        return;
                    }
                    break;
            }
            const body1 = sys.bodies.getItemById(1);
            const body2 = sys.bodies.getItemById(2);
            let temp1 = body1.setPoint || 100;
            let temp2 = body2.setPoint || 100;
            const mode1 = body1.heatMode || 0;
            const mode2 = body2.heatMode || 0;
            const out = Outbound.create({
                dest: 16,
                action: 136,
                payload: [temp1, temp2, mode2 << 2 | mode1, setPoint],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    let bstate = state.temps.bodies.getItemById(body.id);
                    body.coolSetpoint = bstate.coolSetpoint = setPoint;
                    state.temps.emitEquipmentChange();
                    resolve(bstate);
                }

            });
            //conn.queueSendMessage(out);
        });
    }
}
class AquaLinkCircuitCommands extends CircuitCommands {
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        try {
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit Id is invalid', data.id, 'Feature'));
            if (id >= 255 || data.master === 1) return super.setCircuitAsync(data);
            let circuit = sys.circuits.getInterfaceById(id);
            // Alright check to see if we are adding a nixie circuit.
            if (id === -1 || circuit.master !== 0) {
                let circ = await super.setCircuitAsync(data);
                return circ;
            }
            let typeByte = parseInt(data.type, 10) || circuit.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
            let nameByte = 3; // set default `Aux 1`
            if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
            else if (typeof circuit.name !== 'undefined') nameByte = circuit.nameId;
            return new Promise<ICircuit>(async (resolve, reject) => {
                let circuit = sys.circuits.getInterfaceById(data.id);
                let cstate = state.circuits.getInterfaceById(data.id);
                circuit.nameId = cstate.nameId = nameByte;
                circuit.name = cstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
                circuit.showInFeatures = cstate.showInFeatures = typeof data.showInFeatures !== 'undefined' ? data.showInFeatures : circuit.showInFeatures || true;
                circuit.freeze = typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze;
                circuit.type = cstate.type = typeByte;
                circuit.eggTimer = typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : circuit.eggTimer || 720;
                circuit.dontStop = (typeof data.dontStop !== 'undefined') ? utils.makeBool(data.dontStop) : circuit.eggTimer === 1620;
                cstate.isActive = circuit.isActive = true;
                circuit.master = 0;
                state.emitEquipmentChanges();
                resolve(circuit);
            });
        }
        catch (err) { logger.error(`setCircuitAsync error setting circuit ${JSON.stringify(data)}: ${err}`); return Promise.reject(err); }
    }
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        let circuit = sys.circuits.getItemById(data.id);
        if (circuit.master === 1) return await super.deleteCircuitAsync(data);
        data.nameId = 0;
        data.functionId = sys.board.valueMaps.circuitFunctions.getValue('notused');
        return this.setCircuitAsync(data);
    }
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
        let c = sys.circuits.getInterfaceById(id);
        if (c.master !== 0) return await super.setCircuitStateAsync(id, val);
        if (id === 192 || c.type === 3) return await sys.board.circuits.setLightGroupThemeAsync(id - 191, val ? 1 : 0);
        if (id >= 192) return await sys.board.circuits.setCircuitGroupStateAsync(id, val);

        // for some dumb reason, if the spa is on and the pool circuit is desired to be on,
        // it will ignore the packet.
        // We can override that by emulating a click to turn off the spa instead of turning
        // on the pool
        if (sys.equipment.maxBodies > 1 && id === 6 && val && state.circuits.getItemById(1).isOn) {
            id = 1;
            val = false;
        }
        return new Promise<ICircuitState>((resolve, reject) => {
            let cstate = state.circuits.getInterfaceById(id);
            sys.board.circuits.setEndTime(c, cstate, val);
            cstate.isOn = val;
            state.emitEquipmentChanges();
            resolve(cstate);
        });
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> { return this.setCircuitGroupStateAsync(id, val); }
    public async toggleCircuitStateAsync(id: number) {
        let cstate = state.circuits.getInterfaceById(id);
        if (cstate instanceof LightGroupState) {
            return await this.setLightGroupThemeAsync(id, sys.board.valueMaps.lightThemes.getValue(cstate.isOn ? 'off' : 'on'));
        }
        return await this.setCircuitStateAsync(id, !cstate.isOn);
    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group.
            id = sys.circuitGroups.getNextEquipmentId(sys.board.equipmentIds.circuitGroups);
        }
        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit light group id exceeded`, id, 'LightGroup'));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'LightGroup'));
        group = sys.lightGroups.getItemById(id, true);

        if (typeof obj.name !== 'undefined') group.name = obj.name;
        if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
        group.dontStop = (group.eggTimer === 1440);
        group.isActive = true;
        if (typeof obj.circuits !== 'undefined') {
            for (let i = 0; i < obj.circuits.length; i++) {
                let cobj = obj.circuits[i];
                let c: LightGroupCircuit;
                if (typeof cobj.id !== 'undefined') c = group.circuits.getItemById(parseInt(cobj.id, 10), true);
                else if (typeof cobj.circuit !== 'undefined') c = group.circuits.getItemByCircuitId(parseInt(cobj.circuit, 10), true);
                else c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                //if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10); // does this belong here?
                if (typeof cobj.color !== 'undefined') c.color = parseInt(cobj.color, 10);
                if (typeof cobj.swimDelay !== 'undefined') c.swimDelay = parseInt(cobj.swimDelay, 10);
                if (typeof cobj.position !== 'undefined') c.position = parseInt(cobj.position, 10);
            }
        }
        return new Promise<LightGroup>(async (resolve, reject) => {
            try { resolve(group); }
            catch (err) { reject(err); }
        });
    }
    public async setLightThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        // Re-route this as we cannot set individual circuit themes in *Touch.
        return this.setLightGroupThemeAsync(id, theme);
    }
    public async runLightGroupCommandAsync(obj: any): Promise<ICircuitState> {
        // Do all our validation.
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightGroupCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light group command ${cmd.name} does not exist`, 'runLightGroupCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light group ${id} does not exist`, 'runLightGroupCommandAsync'));
            let grp = sys.lightGroups.getItemById(id);
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            let sgrp = state.lightGroups.getItemById(grp.id);
            sgrp.action = nop;
            sgrp.emitEquipmentChange();
            switch (cmd.name) {
                case 'colorset':
                    await this.sequenceLightGroupAsync(id, 'colorset');
                    break;
                case 'colorswim':
                    await this.sequenceLightGroupAsync(id, 'colorswim');
                    break;
                case 'colorhold':
                    await this.setLightGroupThemeAsync(id, 190);
                    break;
                case 'colorrecall':
                    await this.setLightGroupThemeAsync(id, 191);
                    break;
                case 'lightthumper':
                    await this.setLightGroupThemeAsync(id, 208);
                    break;
            }
            sgrp.action = 0;
            sgrp.emitEquipmentChange();
            return sgrp;
        }
        catch (err) { return Promise.reject(`Error runLightGroupCommandAsync ${err.message}`); }
    }
    public async runLightCommandAsync(obj: any): Promise<ICircuitState> {
        // Do all our validation.
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light command ${cmd.name} does not exist`, 'runLightCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light ${id} does not exist`, 'runLightCommandAsync'));
            let circ = sys.circuits.getItemById(id);
            if (!circ.isActive) return Promise.reject(new InvalidOperationError(`Light circuit #${id} is not active`, 'runLightCommandAsync'));
            let type = sys.board.valueMaps.circuitFunctions.transform(circ.type);
            if (!type.isLight) return Promise.reject(new InvalidOperationError(`Circuit #${id} is not a light`, 'runLightCommandAsync'));
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            let slight = state.circuits.getItemById(circ.id);
            slight.action = nop;
            slight.emitEquipmentChange();
            // Touch boards cannot change the theme or color of a single light.
            slight.action = 0;
            slight.emitEquipmentChange();
            return slight;
        }
        catch (err) { return Promise.reject(`Error runLightCommandAsync ${err.message}`); }
    }
    public async setLightGroupThemeAsync(id = sys.board.equipmentIds.circuitGroups.start, theme: number): Promise<ICircuitState> {
        return new Promise<ICircuitState>((resolve, reject) => {
            const grp = sys.lightGroups.getItemById(id);
            const sgrp = state.lightGroups.getItemById(id);
            grp.lightingTheme = sgrp.lightingTheme = theme;
            sgrp.action = sys.board.valueMaps.circuitActions.getValue('lighttheme');
            sgrp.emitEquipmentChange();
            try {
                // Let everyone know we turned these on.  The theme messages will come later.
                for (let i = 0; i < grp.circuits.length; i++) {
                    let c = grp.circuits.getItemByIndex(i);
                    let cstate = state.circuits.getItemById(c.circuit);
                    // if theme is 'off' light groups should not turn on
                }
                let isOn = sys.board.valueMaps.lightThemes.getName(theme) === 'off' ? false : true;
                sys.board.circuits.setEndTime(grp, sgrp, isOn);
                sgrp.isOn = isOn;
                switch (theme) {
                    case 0: // off
                    case 1: // on
                        break;
                    case 128: // sync
                        setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'sync'); });
                        break;
                    case 144: // swim
                        setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'swim'); });
                        break;
                    case 160: // swim
                        setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'set'); });
                        break;
                    case 190: // save
                    case 191: // recall
                        setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'other'); });
                        break;
                    default:
                        setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'color'); });
                    // other themes for magicstream?
                }
                sgrp.action = 0;
                sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
                state.emitEquipmentChanges();
                resolve(sgrp);
            }
            catch (err) {
                logger.error(`error setting intellibrite theme: ${err.message}`);
                reject(err);
            }
        });
    }
}
class AquaLinkFeatureCommands extends FeatureCommands {
    // todo: remove this in favor of setCircuitState only?
    public async setFeatureStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        return this.board.circuits.setCircuitStateAsync(id, val);
    }
    public async toggleFeatureStateAsync(id: number) {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        return this.board.circuits.toggleCircuitStateAsync(id);
    }
    public async setFeatureAsync(data: any): Promise<Feature> {
        return new Promise<Feature>((resolve, reject) => {
            let id = parseInt(data.id, 10);
            let feature: Feature;
            if (id <= 0) {
                id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
                feature = sys.features.getItemById(id, false, { isActive: true, freeze: false });
            }
            else
                feature = sys.features.getItemById(id, false);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
            if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`feature Id ${id}: is out of range.`, id, 'Feature'));
            let typeByte = data.type || feature.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
            let nameByte = 3; // set default `Aux 1`
            if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
            else if (typeof feature.name !== 'undefined') nameByte = feature.nameId;
            feature = sys.features.getItemById(id);
            let fstate = state.features.getItemById(data.id);
            feature.nameId = fstate.nameId = nameByte;
            // circuit.name = cstate.name = sys.board.valueMaps.circuitNames.get(nameByte).desc;
            feature.name = fstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
            feature.type = fstate.type = typeByte;

            feature.freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : feature.freeze);
            fstate.showInFeatures = feature.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : feature.showInFeatures);
            feature.eggTimer = typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : feature.eggTimer || 720;
            feature.dontStop = (typeof data.dontStop !== 'undefined') ? utils.makeBool(data.dontStop) : feature.eggTimer === 1620;
            let eggTimer = sys.eggTimers.find(elem => elem.circuit === id);
            state.emitEquipmentChanges();
            resolve(feature);
        });
    }
}
class AquaLinkChlorinatorCommands extends ChlorinatorCommands {
    public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        let isAdd = false;
        let chlor = sys.chlorinators.getItemById(id);
        if (id <= 0 || isNaN(id)) {
            isAdd = true;
            chlor.master = utils.makeBool(obj.master) ? 1 : 0;
            // Calculate an id for the chlorinator.  The messed up part is that if a chlorinator is not attached to the OCP, its address
            // cannot be set by the MUX.  This will have to wait.
            id = 1;
        }
        // If this is a Nixie chlorinator then go to the base class and handle it from there.
        if (chlor.master === 1) return super.setChlorAsync(obj);
        // RKS: I am not even sure this can be done with Touch as the master on the RS485 bus.
        if (typeof chlor.master === 'undefined') chlor.master = 0;
        let name = obj.name || chlor.name || 'IntelliChlor' + id;
        let superChlorHours = parseInt(obj.superChlorHours, 10);
        if (typeof obj.superChlorinate !== 'undefined') obj.superChlor = utils.makeBool(obj.superChlorinate);
        let superChlorinate = typeof obj.superChlor === 'undefined' ? undefined : utils.makeBool(obj.superChlor);
        let isDosing = typeof obj.isDosing !== 'undefined' ? utils.makeBool(obj.isDosing) : chlor.isDosing;
        let disabled = typeof obj.disabled !== 'undefined' ? utils.makeBool(obj.disabled) : chlor.disabled;
        let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : chlor.poolSetpoint;
        let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : chlor.spaSetpoint;
        let model = typeof obj.model !== 'undefined' ? obj.model : chlor.model;
        let portId = typeof obj.portId !== 'undefined' ? parseInt(obj.portId, 10) : chlor.portId;
        if (portId !== chlor.portId && sys.chlorinators.count(elem => elem.id !== chlor.id && elem.portId === portId && elem.master !== 2) > 0) return Promise.reject(new InvalidEquipmentDataError(`Another chlorinator is installed on port #${portId}.  Only one chlorinator can be installed per port.`, 'Chlorinator', portId));
        let saltTarget = typeof obj.saltTarget === 'number' ? parseInt(obj.saltTarget, 10) : chlor.saltTarget;

        let chlorType = typeof obj.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(obj.type) : chlor.type || 0;
        if (isAdd) {
            if (isNaN(poolSetpoint)) poolSetpoint = 50;
            if (isNaN(spaSetpoint)) spaSetpoint = 10;
            if (isNaN(superChlorHours)) superChlorHours = 8;
            if (typeof superChlorinate === 'undefined') superChlorinate = false;
        }
        else {
            if (isNaN(poolSetpoint)) poolSetpoint = chlor.poolSetpoint || 0;
            if (isNaN(spaSetpoint)) spaSetpoint = chlor.spaSetpoint || 0;
            if (isNaN(superChlorHours)) superChlorHours = chlor.superChlorHours;
            if (typeof superChlorinate === 'undefined') superChlorinate = utils.makeBool(chlor.superChlor);
        }
        if (typeof obj.disabled !== 'undefined') chlor.disabled = utils.makeBool(obj.disabled);
        if (typeof chlor.body === 'undefined') chlor.body = parseInt(obj.body, 10) || 32;
        // Verify the data.
        let body = sys.board.bodies.mapBodyAssociation(chlor.body);
        if (typeof body === 'undefined') {
            if (sys.equipment.shared) body = 32;
            else if (!sys.equipment.dual) body = 1;
            else return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${body}`, 'chlorinator', body));
        }
        if (poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
        if (spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));
        if (typeof obj.ignoreSaltReading !== 'undefined') chlor.ignoreSaltReading = utils.makeBool(obj.ignoreSaltReading);

        let _timeout: NodeJS.Timeout;
        try {
            let schlor = state.chlorinators.getItemById(id, true);
            chlor.disabled = disabled;
            chlor.saltTarget = saltTarget;
            schlor.isActive = chlor.isActive = true;
            schlor.superChlor = chlor.superChlor = superChlorinate;
            schlor.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
            schlor.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
            schlor.superChlorHours = chlor.superChlorHours = superChlorHours;
            schlor.body = chlor.body = body;
            chlor.address = 79 + id;
            chlor.name = schlor.name = name;
            schlor.model = chlor.model = model;
            schlor.type = chlor.type = chlorType;
            chlor.isDosing = isDosing;
            chlor.portId = portId;
            state.emitEquipmentChanges();
            return state.chlorinators.getItemById(id);
        } catch (err) {
            logger.error(`AquaLink setChlorAsync Error: ${err.message}`);
            return Promise.reject(err);
        }
    }
    public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator id is not valid: ${obj.id}`, 'chlorinator', obj.id));
        let chlor = sys.chlorinators.getItemById(id);
        if (chlor.master === 1) return await super.deleteChlorAsync(obj);
        return new Promise<ChlorinatorState>((resolve, reject) => {
            ncp.chlorinators.deleteChlorinatorAsync(id).then(() => { });
            let cstate = state.chlorinators.getItemById(id, true);
            chlor = sys.chlorinators.getItemById(id, true);
            chlor.isActive = cstate.isActive = false;
            sys.chlorinators.removeItemById(id);
            state.chlorinators.removeItemById(id);
            resolve(cstate);
        });
    }
}
class AquaLinkPumpCommands extends PumpCommands {
    public async setPumpAsync(data: any): Promise<Pump> {
        let pump: Pump;
        let ntype;
        let type;
        let isAdd = false;
        let id = (typeof data.id === 'undefined') ? -1 : parseInt(data.id, 10);
        if (typeof data.id === 'undefined' || isNaN(id) || id <= 0) {
            // We are adding a new pump
            ntype = parseInt(data.type, 10);
            type = sys.board.valueMaps.pumpTypes.transform(ntype);
            // If this is one of the pumps that are not supported by touch send it to system board.
            if (type.equipmentMaster === 1) return super.setPumpAsync(data);
            if (typeof data.type === 'undefined' || isNaN(ntype) || typeof type.name === 'undefined') return Promise.reject(new InvalidEquipmentDataError('You must supply a pump type when creating a new pump', 'Pump', data));
            isAdd = true;
            pump = sys.pumps.getItemById(id, true);
        }
        else {
            pump = sys.pumps.getItemById(id, false);
            if (data.master > 0 || pump.master > 0) return await super.setPumpAsync(data);
            ntype = typeof data.type === 'undefined' ? pump.type : parseInt(data.type, 10);
            if (isNaN(ntype)) return Promise.reject(new InvalidEquipmentDataError(`Pump type ${data.type} is not valid`, 'Pump', data));
            type = sys.board.valueMaps.pumpTypes.transform(ntype);
            // changing type?  clear out all props and add as new
            if (ntype !== pump.type) {
                isAdd = true;
                //super.setType(pump, ntype);
                pump = sys.pumps.getItemById(id, false); // refetch pump with new value
            }
        }
        // Validate all the ids since in *Touch the address is determined from the id.
        if (!isAdd) isAdd = sys.pumps.find(elem => elem.id === id) === undefined;
        // Now lets validate the ids related to the type.
        if (id === 9 && type.name !== 'ds') return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} pump must be 9`, 'Pump', data));
        else if (id === 10 && type.name !== 'ss') return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} pump must be 10`, 'Pump', data));
        else if (id > sys.equipment.maxPumps) return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} must be less than ${sys.equipment.maxPumps}`, 'Pump', data));


        // Need to do a check here if we are clearing out the circuits; id data.circuits === []
        // extend will keep the original array
        let bClearPumpCircuits = typeof data.circuits !== 'undefined' && data.circuits.length === 0;

        if (!isAdd) data = extend(true, {}, pump.get(true), data, { id: id, type: ntype });
        else data = extend(false, {}, data, { id: id, type: ntype });
        if (!isAdd && bClearPumpCircuits) data.circuits = [];
        data.name = data.name || pump.name || type.desc;
        // We will not be sending message for ss type pumps.
        if (type.name === 'ss') {
            // The OCP doesn't deal with single speed pumps.  Simply add it to the config.
            data.circuits = [];
            pump.set(pump);
            let spump = state.pumps.getItemById(id, true);
            for (let prop in spump) {
                if (typeof data[prop] !== 'undefined') spump[prop] = data[prop];
            }
            spump.emitEquipmentChange();
            return Promise.resolve(pump);
        }
        else if (type.name === 'ds') {
            // We are going to set all the high speed circuits.
            // RSG: TODO I don't know what the message is to set the high speed circuits.  The following should
            // be moved into the onComplete for the outbound message to set high speed circuits.
            for (let prop in pump) {
                if (typeof data[prop] !== 'undefined') pump[prop] = data[prop];
            }
            let spump = state.pumps.getItemById(id, true);
            for (let prop in spump) {
                if (typeof data[prop] !== 'undefined') spump[prop] = data[prop];
            }
            spump.emitEquipmentChange();
            return Promise.resolve(pump);
        }
        else {
            let arr = [];
            return new Promise<Pump>((resolve, reject) => {
                pump = sys.pumps.getItemById(id, true);
                pump.set(data); // Sets all the data back to the pump.
                let spump = state.pumps.getItemById(id, true);
                spump.name = pump.name;
                spump.type = pump.type;
                spump.emitEquipmentChange();
                resolve(pump);
            });
        }
    }
    public async deletePumpAsync(data: any): Promise<Pump> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`deletePumpAsync: Pump ${id} is not valid.`, 0, `pump`));
        let pump = sys.pumps.getItemById(id, false);
        if (pump.master === 1) return super.deletePumpAsync(data);
        return new Promise<Pump>((resolve, reject) => { resolve(sys.pumps.getItemById(id)); });
    }
}
class AquaLinkHeaterCommands extends HeaterCommands {
    public getInstalledHeaterTypes(body?: number): any {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        let inst = { total: 0 };
        for (let i = 0; i < types.length; i++) if (types[i].name !== 'none') inst[types[i].name] = 0;
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && heater.body !== 'undefined') {
                if ((heater.body !== 32 && body !== heater.body + 1) || (heater.body === 32 && body > 2)) continue;
            }
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                if (inst[type.name] === 'undefined') inst[type.name] = 0;
                inst[type.name] = inst[type.name] + 1;
                if (heater.coolingEnabled === true && type.hasCoolSetpoint === true) inst['hasCoolSetpoint'] = true;
                inst.total++;
            }
        }
        return inst;
    }
    public isSolarInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'solar':
                        return true;
                }
            }
        }
    }
    public isHeatPumpInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'heatpump':
                        return true;
                }
            }
        }
    }
    public async setHeaterAsync(obj: any): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return super.setHeaterAsync(obj);
        return new Promise<Heater>((resolve, reject) => {
            let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
            let heater: Heater;
            let address: number;
            let htype;
            heater.address = address;
            heater.master = 0;
            heater.body = sys.equipment.shared ? 32 : 0;
            sys.board.heaters.updateHeaterServices();
            sys.board.heaters.syncHeaterStates();
            resolve(heater);
        });
    }
    public async deleteHeaterAsync(obj: any): Promise<Heater> {
        if (utils.makeBool(obj.master === 1 || parseInt(obj.id, 10) > 255)) return super.deleteHeaterAsync(obj);
        return new Promise<Heater>((resolve, reject) => {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
            let heater = sys.heaters.getItemById(id);
            heater.isActive = false;
            sys.heaters.removeItemById(id);
            state.heaters.removeItemById(id);
            sys.board.heaters.updateHeaterServices();
            sys.board.heaters.syncHeaterStates();
            resolve(heater);
        });
    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let hybridInstalled = htypes.hybrid > 0;
        sys.board.valueMaps.heatModes.set(0, { name: 'off', desc: 'Off' });
        sys.board.valueMaps.heatSources.set(0, { name: 'off', desc: 'Off' });
        if (hybridInstalled) {
            // Source Issue #390
            // 1 = Heat Pump
            // 2 = Gas Heater
            // 3 = Hybrid
            // 16 = Dual 
            sys.board.valueMaps.heatModes.set(1, { name: 'heatpump', desc: 'Heat Pump' });
            sys.board.valueMaps.heatModes.set(2, { name: 'heater', desc: 'Gas Heat' });
            sys.board.valueMaps.heatModes.set(3, { name: 'heatpumppref', desc: 'Hybrid' });
            sys.board.valueMaps.heatModes.set(16, { name: 'dual', desc: 'Dual Heat' });

            sys.board.valueMaps.heatSources.set(2, { name: 'heater', desc: 'Gas Heat' });
            sys.board.valueMaps.heatSources.set(5, { name: 'heatpumppref', desc: 'Hybrid' });
            sys.board.valueMaps.heatSources.set(20, { name: 'dual', desc: 'Dual Heat' });
            sys.board.valueMaps.heatSources.set(21, { name: 'heatpump', desc: 'Heat Pump' });
        }
        else {
            if (gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(1, { name: 'heater', desc: 'Heater' });
                sys.board.valueMaps.heatSources.set(2, { name: 'heater', desc: 'Heater' });
            }
            else {
                // no heaters (virtual controller)
                sys.board.valueMaps.heatModes.delete(1);
                sys.board.valueMaps.heatSources.delete(2);
            }
            if (solarInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(2, { name: 'solarpref', desc: 'Solar Preferred' });
                sys.board.valueMaps.heatModes.set(3, { name: 'solar', desc: 'Solar Only' });
                sys.board.valueMaps.heatSources.set(5, { name: 'solarpref', desc: 'Solar Preferred' });
                sys.board.valueMaps.heatSources.set(21, { name: 'solar', desc: 'Solar Only' });
            }
            else if (heatPumpInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(2, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
                sys.board.valueMaps.heatModes.set(3, { name: 'heatpump', desc: 'Heat Pump Only' });
                sys.board.valueMaps.heatSources.set(5, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
                sys.board.valueMaps.heatSources.set(21, { name: 'heatpump', desc: 'Heat Pump Only' });
            }
            else if (ultratempInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.merge([
                    [2, { name: 'ultratemppref', desc: 'UltraTemp Pref' }],
                    [3, { name: 'ultratemp', desc: 'UltraTemp Only' }]
                ]);
                sys.board.valueMaps.heatSources.merge([
                    [5, { name: 'ultratemppref', desc: 'Ultratemp Pref', hasCoolSetpoint: htypes.hasCoolSetpoint }],
                    [21, { name: 'ultratemp', desc: 'Ultratemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]
                ])
            }
            else {
                // only gas
                sys.board.valueMaps.heatModes.delete(2);
                sys.board.valueMaps.heatModes.delete(3);
                sys.board.valueMaps.heatSources.delete(5);
                sys.board.valueMaps.heatSources.delete(21);
            }
        }
        sys.board.valueMaps.heatSources.set(32, { name: 'nochange', desc: 'No Change' });
        this.setActiveTempSensors();
    }
}

