import { Inbound } from "../Messages";
import { sys, Feature, Body } from"../../../Equipment";
import { state, BodyTempState } from "../../../State";
import { setTimeout } from "timers";
export class ExternalMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(0)) {
            case 0: // Setpoints/HeatMode
                ExternalMessage.processTempSettings(msg);
                break;
            case 1: // Circuit Changes
                ExternalMessage.processCircuit(msg);
                break;
            case 2: // Unkown
                break;
            case 3: // Schedule Changes
                ExternalMessage.processSchedules(msg);
                break;
            case 4: // Pump Information
                ExternalMessage.processPump(msg);
                break;
            case 5: // Unknown
            case 6:
                break;
            case 7: // Chlorinator
                ExternalMessage.processChlorinator(msg);
                break;
            case 8: // Unknown
                break;
            case 9: // Valves
                break;
            case 10: // Heaters
                ExternalMessage.processHeater(msg);
                break;
            case 11: // Unknown
                break;
            case 12: // Pool Settings Alias, owner...etc.
                break;
            case 13: // Bodies (Manual heat, capacities)
                ExternalMessage.processBodies(msg);
                break;
            case 14:
                break;
            case 15: // Circuit, feature, group, and schedule States
                ExternalMessage.processCircuitState(msg);
                ExternalMessage.processFeatureState(msg);
                ExternalMessage.processScheduleState(msg);
                break;
        }
    }
    private static processHeater(msg: Inbound) {
        // So a user is changing the heater info.  Lets
        // hijack it and get it ourselves.
        let heater = sys.heaters.getItemById(msg.extractPayloadByte(2));
        heater.efficiencyMode = msg.extractPayloadByte(27);
        heater.type = msg.extractPayloadByte(3);
        heater.address = msg.extractPayloadByte(10);
        heater.name = msg.extractPayloadString(11, 16);
        heater.body = msg.extractPayloadByte(4);
        heater.differentialTemp = msg.extractPayloadByte(5);
        heater.coolingEnabled = msg.extractPayloadByte(8) > 0;
        heater.economyTime = msg.extractPayloadByte(29);
        if (heater.type === 0) sys.heaters.removeItemById(heater.id);
        // Check anyway to make sure we got it all.
        setTimeout(() => sys.checkConfiguration(), 500);
    }
    private static processCircuitState(msg: Inbound) {
        if (msg.extractPayloadByte(34) === 0) {
            let circuitId = 1;
            let body = 0; // Off
            for (let i = 3; i < msg.payload.length && circuitId <= state.circuits.length; i++) {
                let byte = msg.extractPayloadByte(i);
                // Shift each bit getting the circuit identified by each value.
                for (let j = 0; j < 8; j++) {
                    let circuit = sys.circuits.getItemById(circuitId);
                    if (circuit.isActive) {
                        var cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                        cstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                        cstate.name = circuit.name;
                        cstate.showInFeatures = circuit.showInFeatures;
                        cstate.type = circuit.type;
                        if (cstate.isOn && circuit.type === 12) body = 6;
                        if (cstate.isOn && circuit.type === 13) body = 1;
                        switch (circuit.type) {
                            case 6: // Globrite
                            case 5: // Magicstream
                            case 8: // Intellibrite
                            case 10: // Colorcascade
                                cstate.lightingTheme = circuit.lightingTheme;
                                break;
                            case 9:
                                cstate.level = circuit.level;
                                break;
                        }
                    }
                    cstate.emitEquipmentChange();
                    circuitId++;
                }
            }
            state.body = body;
        }
    }
    private static processScheduleState(msg: Inbound) {
        if (msg.extractPayloadByte(34) === 0) {
            let scheduleId = 1;
            for (let i = 15; i < msg.payload.length && scheduleId <= state.schedules.length; i++) {
                let byte = msg.extractPayloadByte(i);
                // Shift each bit getting the schedule identified by each value.
                for (let j = 0; j < 8; j++) {
                    let schedule = sys.schedules.getItemById(scheduleId);
                    if (schedule.isActive) {
                        var sstate = state.schedules.getItemById(scheduleId, schedule.isActive);
                        sstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                    }
                    sstate.emitEquipmentChange();
                    scheduleId++;
                }
            }
        }
    }
    private static processFeatureState(msg: Inbound) {
        if (msg.extractPayloadByte(34) === 0) {
            let featureId = 1;
            for (let i = 9; i < msg.payload.length && featureId <= state.features.length; i++) {
                let byte = msg.extractPayloadByte(i);
                // Shift each bit getting the feature identified by each value.
                for (let j = 0; j < 8; j++) {
                    let feature = sys.features.getItemById(featureId);
                    if (feature.isActive) {
                        var fstate = state.features.getItemById(featureId, feature.isActive);
                        fstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                        fstate.name = feature.name;
                    }
                    fstate.emitEquipmentChange();
                    featureId++;
                }
            }
        }
    }

    private static processBodies(msg: Inbound) {
        let bodyId = 0;
        let cbody: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0:
            case 1:
            case 2:
            case 3:
                bodyId = msg.extractPayloadByte(2);
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                cbody.name = msg.extractPayloadString(3, 16);
                state.temps.bodies.getItemById(bodyId, false).name = cbody.name;
                state.temps.emitEquipmentChange();
                break;
            case 4:
            case 5:
            case 6:
            case 7:
                bodyId = msg.extractPayloadByte(2) - 4;
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                cbody.capacity = msg.extractPayloadByte(3) * 1000;
                break;
            case 13: // Pump notifications
                break;
            case 14: // Heater notifications
                break;
            case 15: // Chlorinator notifications
                break;
        }

    }
    private static processSchedules(msg: Inbound) {
        let schedId = msg.extractPayloadByte(2) + 1;
        let cfg = sys.schedules.getItemById(schedId);
        let s = state.schedules.getItemById(schedId);
        cfg.startTime = msg.extractPayloadInt(3);
        cfg.endTime = msg.extractPayloadInt(5);
        cfg.circuit = msg.extractPayloadByte(7) + 1;
        cfg.runOnce = msg.extractPayloadByte(8);
        cfg.scheduleDays = msg.extractPayloadByte(9);
        cfg.startMonth = msg.extractPayloadByte(10);
        cfg.startDay = msg.extractPayloadByte(11);
        cfg.startYear = msg.extractPayloadByte(12);
        cfg.heatSource = msg.extractPayloadByte(13);
        cfg.heatSetpoint = msg.extractPayloadByte(14);
        cfg.flags = msg.extractPayloadByte(15);
        s.startTime = cfg.startTime;
        s.endTime = cfg.endTime;
        s.circuit = cfg.circuit;
        s.scheduleType = cfg.runOnce;
        s.scheduleDays = ((cfg.runOnce & 128) > 0) ? cfg.scheduleDays : cfg.runOnce;
        s.heatSetpoint = cfg.heatSetpoint;
        s.heatSource = cfg.heatSource;
        s.startDate = cfg.startDate;
        // If we are setting the startTime to 0 then we need to remove the schedule from
        // the config and state.
        if (cfg.startTime === 0) {
            sys.schedules.removeItemById(cfg.id);
            state.schedules.removeItemById(cfg.id);
        }
        s.emitEquipmentChange();
    }

    private static processChlorinator(msg: Inbound) {
        let chlorId = msg.extractPayloadByte(2) + 1;
        let cfg = sys.chlorinators.getItemById(chlorId);
        let s = state.chlorinators.getItemById(chlorId);
        cfg.body = msg.extractPayloadByte(3);
        cfg.poolSetpoint = msg.extractPayloadByte(5);
        cfg.spaSetpoint = msg.extractPayloadByte(6);
        cfg.superChlor = msg.extractPayloadByte(7) > 0;
        cfg.superChlorHours = msg.extractPayloadByte(8);
        s.poolSetpoint = cfg.poolSetpoint;
        s.spaSetpoint = cfg.spaSetpoint;
        s.superChlorHours = cfg.superChlorHours;
        s.body = cfg.body;
        s.emitEquipmentChange();
    }
    private static processPump(msg: Inbound) {
        let pumpId = msg.extractPayloadByte(2) + 1;
        if (msg.extractPayloadByte(1) === 0) {
            let type = msg.extractPayloadByte(3);
            let cpump = sys.pumps.getItemById(pumpId, type > 0);
            let spump = state.pumps.getItemById(pumpId, type > 0);
            cpump.type = type;
            spump.type = type;
            if (cpump.type > 2) {
                cpump.address = msg.extractPayloadByte(5);
                cpump.minSpeed = msg.extractPayloadInt(6);
                cpump.maxSpeed = msg.extractPayloadInt(8);
                cpump.minFlow = msg.extractPayloadByte(10)
                cpump.maxFlow = msg.extractPayloadByte(11);
                cpump.flowStepSize = msg.extractPayloadByte(12);
                cpump.primingSpeed = msg.extractPayloadInt(13);
                cpump.speedStepSize = msg.extractPayloadByte(15) * 10;
                cpump.primingTime = msg.extractPayloadByte(16);
                cpump.circuits.clear()
                for (let i = 18; i < msg.payload.length && i <= 25; i++)
                {
                    let circuitId = msg.extractPayloadByte(i);
                    if (circuitId !== 255) {
                        let circuit = cpump.circuits.getItemById(i - 17, true);
                        circuit.circuit = circuitId + 1;
                        circuit.units = msg.extractPayloadByte(i + 8);
                    }
                }
            }
            else if (cpump.type === 1) {
                cpump.circuits.clear();
                cpump.circuits.add({ id: 1, body: msg.extractPayloadByte(18) });
            }
            if (cpump.type === 0) {
                sys.pumps.removeItemById(cpump.id);
                state.pumps.removeItemById(cpump.id);
            }
        }
        else if (msg.extractPayloadByte(1) === 1) {
            let cpump = sys.pumps.getItemById(pumpId);
            let spump = state.pumps.getItemById(pumpId);
            cpump.name = msg.extractPayloadString(19, 16);
            spump.name = cpump.name;
            if (cpump.type > 2) {
                for (let i = 3, circuitId = 1; i < msg.payload.length && i <= 18; circuitId++) {
                    let circuit = cpump.circuits.getItemById(circuitId);
                    let sp = msg.extractPayloadInt(i);
                    if (sp < 450)
                        circuit.flow = sp;
                    else
                        circuit.speed = sp;
                    i += 2;
                }
            }
            spump.emitData('pumpExt', spump.getExtended()); // Do this so clients can delete them.
        }
    }
    private static processCircuit(msg: Inbound) {
        let circuitId = msg.extractPayloadByte(2) + 1;
        let circuit = sys.circuits.getItemById(circuitId, false);
        let cstate = state.circuits.getItemById(circuitId, false);
        circuit.showInFeatures = msg.extractPayloadByte(5) > 0;
        circuit.freeze = msg.extractPayloadByte(4) > 0;
        circuit.name = msg.extractPayloadString(10, 16);
        circuit.type = msg.extractPayloadByte(3);
        circuit.eggTimer = (msg.extractPayloadByte(7) * 60) + msg.extractPayloadByte(8);
        circuit.showInFeatures = msg.extractPayloadByte(5) > 0;
        cstate.type = circuit.type;
        cstate.showInFeatures = circuit.showInFeatures;
        cstate.name = circuit.name;
        switch (circuit.type) {
            case 5:
            case 6:
            case 8:
                circuit.lightingTheme = msg.extractPayloadByte(6);
                cstate.lightingTheme = circuit.lightingTheme;
                break;
            case 9:
                circuit.level = msg.extractPayloadByte(6);
                cstate.level = circuit.level;
                break;
        }
        cstate.emitEquipmentChange();
    }
    private static processTempSettings(msg: Inbound) {
        // What the developers did is supply an offset index into the payload for the byte that is
        // changing.  I suppose this may have been easier but we are not using that logic.  We want the
        // information to remain decoded so that we aren't guessing which byte does what.
        // payLoadIndex = byte(2) + 3 where the first 3 bytes indicate what value changed.
        let body: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0: // Water Sensor 2 Adj
                sys.general.options.waterTempAdj2 = (msg.extractPayloadByte(3) & 0x007F) * (((msg.extractPayloadByte(3) & 0x0080) > 0) ? -1 : 1);
                break;
            case 1: // Water Sensor 1 Adj
                sys.general.options.waterTempAdj1 = (msg.extractPayloadByte(4) & 0x007F) * (((msg.extractPayloadByte(4) & 0x0080) > 0) ? -1 : 1);
                break;
            case 2: // Solar Sensor 1 Adj
                sys.general.options.solarTempAdj1 = (msg.extractPayloadByte(5) & 0x007F) * (((msg.extractPayloadByte(5) & 0x0080) > 0) ? -1 : 1);
                break;
            case 3: // Air Sensor Adj
                sys.general.options.airTempAdj = (msg.extractPayloadByte(6) & 0x007F) * (((msg.extractPayloadByte(6) & 0x0080) > 0) ? -1 : 1);
                break;
            case 5:
                sys.general.options.solarTempAdj2 = (msg.extractPayloadByte(7) & 0x007F) * (((msg.extractPayloadByte(7) & 0x0080) > 0) ? -1 : 1);
                break;
            case 18: // Body 1 Setpoint
                body = sys.bodies.getItemById(1, false);
                body.setPoint = msg.extractPayloadByte(21);
                state.temps.bodies.getItemById(1).setPoint = body.setPoint;
                break;
            case 19: // Body 3 Setpoint
                body = sys.bodies.getItemById(3, false);
                body.setPoint = msg.extractPayloadByte(22);
                state.temps.bodies.getItemById(3).setPoint = body.setPoint;
                break;
            case 20: // Body 2 Setpoint
                body = sys.bodies.getItemById(2, false);
                body.setPoint = msg.extractPayloadByte(23);
                state.temps.bodies.getItemById(2).setPoint = body.setPoint;
                break;
            case 21: // Body 4 Setpoint
                body = sys.bodies.getItemById(4, false);
                body.setPoint = msg.extractPayloadByte(24);
                state.temps.bodies.getItemById(4).setPoint = body.setPoint;
                break;
            case 22: // Body 1 Heat Mode
                body = sys.bodies.getItemById(1, false);
                body.heatMode = msg.extractPayloadByte(25);
                state.temps.bodies.getItemById(1).heatMode = body.heatMode;
                break;
            case 23: // Body 2 Heat Mode
                body = sys.bodies.getItemById(2, false);
                body.heatMode = msg.extractPayloadByte(26);
                state.temps.bodies.getItemById(2).heatMode = body.heatMode;
                break;
            case 24: // Body 3 Heat Mode
                body = sys.bodies.getItemById(3, false);
                body.heatMode = msg.extractPayloadByte(27);
                state.temps.bodies.getItemById(3).heatMode = body.heatMode;
                break;
            case 25: // Body 4 Heat Mode
                body = sys.bodies.getItemById(4, false);
                body.heatMode = msg.extractPayloadByte(28);
                state.temps.bodies.getItemById(4).heatMode = body.heatMode;
                break;
        }
    }

}