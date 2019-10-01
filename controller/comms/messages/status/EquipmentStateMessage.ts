import {Inbound, Message} from '../Messages';
import {ControllerType} from '../../../Constants';
import {state, BodyTempState} from '../../../State';
import {sys, Body} from '../../../Equipment';
import {logger} from 'logger/Logger';

export class EquipmentStateMessage {
    private static initController(msg: Inbound) {
        Message.headerSubByte = msg.header[1];
        // defaults; set to lowest possible values
        // RKS: You cannot do this as IntelliCenter acquires the additional information
        // from another message.
        const model1 = msg.extractPayloadByte(27);
        const model2 = msg.extractPayloadByte(28);
        switch (model2) {
            case 11: // SunTouch.  Eq to IntelliCom??
                sys.controllerType = ControllerType.IntelliCom;
                sys.equipment.maxBodies = 1;
                sys.equipment.maxCircuits = 4;
                sys.equipment.shared = false;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxPumps = 2;
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxValves = 2;
                sys.equipment.maxCircuitGroups = 0;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 8;
                break;
            case 0:
                switch (model1) {
                    case 23: // IntelliCenter
                        sys.equipment.maxSchedules = 100;
                        sys.equipment.maxFeatures = 32;
                        sys.controllerType = ControllerType.IntelliCenter;
                        break;
                    default: // IntelliTouch i5+3
                        sys.controllerType = ControllerType.IntelliTouch;
                        sys.equipment.maxChlorinators = 1;
                        sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                        sys.equipment.model = 'IntelliTouch i5+3S';
                        sys.equipment.shared = true;
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxFeatures = 10;
                        sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                        sys.equipment.maxSchedules = 99;
                        sys.equipment.maxCircuits = 6; // 2 filter + 5 aux
                        sys.equipment.maxCircuitGroups = 3;
                        sys.equipment.maxLightGroups = 1;
                        break;
                }
                break;
            case 1: // IntelliTouch i7+3
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i7+3';
                sys.equipment.shared = true;
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuits = 7; // 2 filter + 5 aux
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 2: // IntelliTouch i9+3
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i9+3';
                sys.equipment.shared = true;
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 9; // 1 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 3: // IntelliTouch i5+3S
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i5+3S';
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 5; // 2 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 4: // IntelliTouch i9+3S
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i9+3S';
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 9; // 1 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 5: // IntelliTouch i10+3D
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i10+3D';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 10; // 2 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxLightGroups = 1;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 13: // EasyTouch2 Models
                sys.controllerType = ControllerType.EasyTouch;
                // sys.equipment.maxValves = 2; // EasyTouch Systems have Pool/Spa A and B.
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 2; // All EasyTouch systems can support 2 VS, VSF or VF pumps.
                sys.equipment.maxCircuitGroups = 0;
                sys.equipment.maxLightGroups = 1;
                switch(model1) {
                    case 0:
                        sys.equipment.model = 'EasyTouch2 8';
                        sys.equipment.shared = true;
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.maxFeatures = 2;
                        break;
                    case 1:
                        sys.equipment.model = 'EasyTouch2 8P';
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.shared = false;
                        sys.equipment.maxBodies = 1; // All Ps are single body
                        sys.equipment.maxFeatures = 2;
                        break;
                    case 2:
                        sys.equipment.maxChlorinators = 1;
                        sys.equipment.model = 'EasyTouch2 4';
                        sys.equipment.shared = true;
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 4;
                        sys.equipment.maxFeatures = 2;
                        sys.equipment.maxFeatures = 2;
                        break;
                    case 3:
                        sys.equipment.maxChlorinators = 1;
                        sys.equipment.model = 'EasyTouch2 4P';
                        sys.equipment.shared = false;
                        sys.equipment.maxCircuits = 4;
                        sys.equipment.maxBodies = 1; // All Ps are single body
                        sys.equipment.maxFeatures = 2;
                        break;
                }
                break;

            case 14: // EasyTouch1 Models
                sys.controllerType = ControllerType.EasyTouch;
                sys.equipment.maxValves = 4; // EasyTouch Systems have Pool/Spa A and B.
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxChlorinators = 1;
                sys.equipment.maxPumps = 2; // All EasyTouch systems can support 2 VS or VF pumps.
                sys.equipment.maxCircuitGroups = 0;
                sys.equipment.maxLightGroups = 1;
                switch(model1) {
                    case 0:
                        sys.equipment.model = 'EasyTouch1 8';
                        sys.equipment.shared = true;
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.maxFeatures = 8;
                        break;
                    case 1:
                        sys.equipment.model = 'EasyTouch1 8P';
                        sys.equipment.maxBodies = 1;
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.shared = false;
                        sys.equipment.maxFeatures = 8;
                        break;
                    case 2: // check...
                        sys.equipment.model = 'EasyTouch1 4';
                        sys.equipment.shared = true;
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 4;
                        sys.equipment.maxFeatures = 8;
                        break;
                    case 3: // check...
                        sys.equipment.model = 'EasyTouch1 4P';
                        sys.equipment.maxCircuits = 4;
                        sys.equipment.shared = false;
                        sys.equipment.maxFeatures = 8;
                        break;
                }
                break;
        }
        state.status = 1;
        // Do this here for *Touch but wait for IntelliCenter.  We do not have a complete picture yet.
        // This will not come until we request and receive the equipment configuration messages.
        if (sys.controllerType !== ControllerType.IntelliCenter) {
            state.equipment.shared = sys.equipment.shared;
            state.equipment.model = sys.equipment.model;
            state.equipment.controllerType = sys.controllerType;
            state.equipment.maxBodies = sys.equipment.maxBodies;
            state.equipment.maxCircuits = sys.equipment.maxCircuits;
            state.equipment.maxValves = sys.equipment.maxValves;
            state.equipment.maxSchedules = sys.equipment.maxSchedules;
            state.equipment.maxCircuitGroups = sys.equipment.maxCircuitGroups;
            state.equipment.maxLightGroups = sys.equipment.maxCircuitGroups;
            
            // This will let any connected clients know if anything has changed.  If nothing has ...crickets.
            state.emitControllerChange();
        }
        setTimeout(() => sys.checkConfiguration(), 300);
    }
    public static process(msg: Inbound) {
        if (!state.isInitialized) {
            // RKS: This is a placeholder for now until we get the sys and state objects normalized.
            if (msg.action !== 2) return;
            EquipmentStateMessage.initController(msg);
            return;
        }
        var ndx = 0;
        switch (msg.action) {
            case 2:
                {
                    // Shared
                    let dt = new Date();
                    state.time.hours = msg.extractPayloadByte(0);
                    state.time.minutes = msg.extractPayloadByte(1);
                    state.time.seconds = dt.getSeconds();

                    state.mode = msg.extractPayloadByte(9) & 0x81;
                    state.temps.units = msg.extractPayloadByte(9) & 0x04;
                    state.valve = msg.extractPayloadByte(10);
                    // EquipmentStateMessage.processHeatStatus(msg.extractPayloadByte(11));

                    // state.heatMode = msg.extractPayloadByte(11);
                    state.delay = msg.extractPayloadByte(12);

                    if (sys.controllerType === ControllerType.IntelliCenter) {
                        state.temps.waterSensor1 = msg.extractPayloadByte(14) + sys.general.options.waterTempAdj1;
                        if (sys.bodies.length > 2)
                            state.temps.waterSensor2 = msg.extractPayloadByte(15) + sys.general.options.waterTempAdj2;
                        // We are making an assumption here in that the circuits are always labeled the same.
                        // 1=Spa
                        // 6=Pool
                        // 12=Body3
                        // 22=Body4 -- Really not sure about this one.
                        if (sys.bodies.length > 0) {
                            // We will not go in here if this is not a shared body.
                            const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = 6;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0f;
                            if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 1) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = 1;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xf0) >> 4;
                            if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 2) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(3, true);
                            const cbody: Body = sys.bodies.getItemById(3);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0f;
                            tbody.circuit = 12;
                            if ((msg.extractPayloadByte(3) & 0x08) === 8) {
                                // This is the first circuit on the second body.
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 3) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(4, true);
                            const cbody: Body = sys.bodies.getItemById(4);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xf0) >> 4;
                            tbody.circuit = 22;
                            if ((msg.extractPayloadByte(5) & 0x20) === 32) {
                                // This is the first circuit on the third body or the first circuit on the second expansion.
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        state.temps.air = msg.extractPayloadByte(18) + sys.general.options.airTempAdj; // 18
                        state.temps.solar = msg.extractPayloadByte(19) + sys.general.options.solarTempAdj1; // 19
                        // todo: do not think this is correct - at least not for IntelliTouch
                        state.adjustDST = (msg.extractPayloadByte(23) & 0x01) === 0x01; // 23
                    }
                    else if (sys.controllerType !== ControllerType.Unknown) {
                        state.temps.waterSensor1 = msg.extractPayloadByte(14);
                        if (sys.bodies.length > 2) state.temps.waterSensor2 = msg.extractPayloadByte(15);
                        if (sys.bodies.length > 0) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = 6;
                            const heatMode = msg.extractPayloadByte(22) & 0x03;
                            tbody.heatMode = heatMode;
                            cbody.heatMode = heatMode;
                            if (tbody.isOn) {
                                const byte = msg.extractPayloadByte(10);
                                if ((byte & 0x0c) >> 2 === 3) tbody.heatStatus = 1; // Heater
                                else if ((byte & 0x30) >> 4 === 3) tbody.heatStatus = 2; // Solar
                            } else
                                tbody.heatStatus = 0; // Off
                        }
                        if (sys.bodies.length > 1) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            const heatMode = (msg.extractPayloadByte(22) & 0x0c) >> 2;
                            tbody.heatMode = heatMode;
                            cbody.heatMode = heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = 1;
                            if (tbody.isOn) {
                                const byte = msg.extractPayloadByte(10);
                                if ((byte & 0x0c) >> 2 === 3) tbody.heatStatus = 1; // Heater
                                else if ((byte & 0x30) >> 4 === 3) tbody.heatStatus = 2; // Solar
                            } else
                                tbody.heatStatus = 0; // Off
                        }
                    }
                    EquipmentStateMessage.processCircuitState(msg);
                    EquipmentStateMessage.processFeatureState(msg);
                    //EquipmentStateMessage.processEquipmentState(msg);
                    // This will toggle the group states depending on the state of the individual circuits.
                    sys.board.features.syncGroupStates();
                    state.emitControllerChange();
                    break;
                }
            case 5: // Intellitouch only.  Date/Time packet
                // [255,0,255][165,1,15,16,5,8][15,10,8,1,8,18,0,1][1,15]
                state.time.date = msg.extractPayloadByte(3);
                state.time.month = msg.extractPayloadByte(4);
                state.time.year = msg.extractPayloadByte(5);
                sys.general.options.adjustDST = state.adjustDST =
                    msg.extractPayloadByte(7) === 0x01;
                // defaults
                sys.general.options.clockMode = 12;
                sys.general.options.clockSource = 'manual';
                break;
            case 8: // IntelliTouch only.  Heat status
                // [165,x,15,16,8,13],[75,75,64,87,101,11,0, 0 ,62 ,0 ,0 ,0 ,0] ,[2,190]
                state.temps.waterSensor1 = msg.extractPayloadByte(0);
                if (sys.bodies.length > 1)
                    state.temps.waterSensor2 = msg.extractPayloadByte(1);
                state.temps.air = msg.extractPayloadByte(2);
                state.temps.solar = msg.extractPayloadByte(8);
                if (sys.bodies.length > 0) {
                    // pool
                    // We will not go in here is this is not a shared body.
                    const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                    const cbody: Body = sys.bodies.getItemById(1);
                    tbody.heatMode = cbody.heatMode = msg.extractPayloadByte(5) & 3;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(3);
                    tbody.name = cbody.name;
                    tbody.circuit = 6;
                    tbody.heatStatus = msg.extractPayloadByte(11) & 0x0f;
                    if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                        tbody.temp = state.temps.waterSensor1;
                        tbody.isOn = true;
                    } else tbody.isOn = false;
                }
                if (sys.bodies.length > 1) {
                    // spa
                    const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                    const cbody: Body = sys.bodies.getItemById(2);
                    tbody.heatMode = cbody.heatMode =
                        (msg.extractPayloadByte(5) & 12) >> 2;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(4);
                    tbody.name = cbody.name;
                    tbody.circuit = 1;
                    tbody.heatStatus = (msg.extractPayloadByte(11) & 0xf0) >> 4;
                    if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                        tbody.temp = state.temps.waterSensor1;
                        tbody.isOn = true;
                    } else tbody.isOn = false;
                }
                break;
            case 96:
                EquipmentStateMessage.processIntelliBriteMode(msg);
                break;
            case 204: // IntelliCenter only.
                state.batteryVoltage = msg.extractPayloadByte(2) / 50;
                state.comms.keepAlives = msg.extractPayloadInt(4);
                state.time.date = msg.extractPayloadByte(6);
                state.time.month = msg.extractPayloadByte(7);
                state.time.year = msg.extractPayloadByte(8);
                if (msg.extractPayloadByte(37, 255) !== 255) {
                    const chlor = state.chlorinators.getItemById(1);
                    chlor.superChlorRemaining =
                        msg.extractPayloadByte(37) * 3600 + msg.extractPayloadByte(38) * 60;
                    chlor.emitEquipmentChange();
                } else {
                    const chlor = state.chlorinators.getItemById(1);
                    chlor.superChlorRemaining = 0;
                    chlor.superChlor = false;
                    chlor.emitEquipmentChange();
                }
                state.emitControllerChange();
                break;
        }
    }
    private static processFeatureState(msg: Inbound) {
        // Somewhere in this packet we need to find support for 32 bits of features.
        // Turning on the first defined feature set by 7 to 16
        // Turning on the second defined feature set byte 7 to 32
        // This means that the first 4 feature circuits are located at byte 7 on the 4 most significant bits.  This leaves 28 bits
        // unaccounted for when it comes to a total of 32 features.

        // We do know that the first 6 bytes are accounted for so byte 8, 10, or 11 are potential candidates.
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                for (let i = 1; i <= sys.features.length; i++)
                    // Use a case statement here since we don't know where to go after 4.
                    switch (i) {
                        case 1:
                        case 2:
                        case 3:
                        case 4:{
                            const byte = msg.extractPayloadByte(7);
                            const feature = sys.features.getItemById(i);
                            const fstate = state.features.getItemById(i, feature.isActive);
                            fstate.isOn = (byte >> 4 & 1 << (i - 1)) > 0;
                            fstate.emitEquipmentChange();
                            fstate.name = feature.name;
                            break;
                        }
                    }

                break;
            case ControllerType.IntelliCom:
            case ControllerType.EasyTouch:
            case ControllerType.IntelliTouch:
                {
                const count = Math.min(Math.floor(sys.features.length / 8), 5) + 12;
                let featureId = 9;
                for (let i = 3; i < msg.payload.length && i <= count; i++) {
                    const byte = msg.extractPayloadByte(i);
                    // Shift each bit getting the circuit identified by each value.
                    for (let j = 0; j < 8; j++) {
                        const feature = sys.features.getItemById(featureId);
                        if (feature.isActive) {
                            const fstate = state.features.getItemById(
                                featureId,
                                feature.isActive
                            );
                            fstate.isOn = (byte & 1 << j) >> j > 0;
                            fstate.name = feature.name;
                            fstate.emitEquipmentChange();
                        }
                        featureId++;
                    }
                }
                break;
            }
        }
    }
    private static processCircuitState(msg: Inbound) {
        // The way this works is that there is one byte per 8 circuits for a total of 5 bytes or 40 circuits.  The
        // configuration already determined how many available circuits we have by querying the model of the panel
        // and any installed expansion panel models.  Only the number of available circuits will appear in this
        // array.
        const count = Math.min(Math.floor(sys.circuits.length / 8), 5) + 2;
        let circuitId = 1;
        let body = 0; // Off
        for (let i = 2; i < msg.payload.length && i <= count; i++) {
            const byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                const circuit = sys.circuits.getItemById(circuitId);
                if (circuit.isActive) {
                    const cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                    cstate.isOn = (byte & 1 << j) >> j > 0;
                    cstate.name = circuit.name;
                    cstate.showInFeatures = circuit.showInFeatures;
                    cstate.type = circuit.type;
                    if (cstate.isOn && circuitId === 6) body = 6;
                    if (cstate.isOn && circuitId === 1) body = 1;
                    if (sys.controllerType === ControllerType.IntelliCenter)
                        // intellitouch sends a separate msg with themes
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
                    cstate.emitEquipmentChange();
                }
                circuitId++;
            }
        }
        state.body = body;
    }
    private static processIntelliBriteMode(msg: Inbound) {
        // eg RED: [165,16,16,34,96,2],[195,0],[2,12]
        // data[0] = color
        // TODO: RKS This is incorrect.  The lighting theme is a different set
        // than the color set values which are applied. I believe this to be the message that contains the
        // color set values. (eg lightColors vs lightThemes)

        // RG - No, this is actually the lightTheme.  colorSet is defined in the 167 packet (being processed in the CircuitMessage file.) 
        const color = msg.extractPayloadByte(0);
        for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
            const ib = sys.intellibrite.circuits.getItemByIndex(i);
            const cstate = state.circuits.getItemById(ib.circuit, true);
            const circuit = sys.circuits.getItemById(ib.circuit, true);
            switch (color) {
                case 0: // off
                case 1: // on
                case 190: // save
                case 191: // recall
                    break;
                case 160: // color set (pre-defined colors)
                    cstate.lightingTheme = circuit.lightingTheme = ib.color;
                    break;
                default:
                    // intellibrite themes
                    cstate.lightingTheme = circuit.lightingTheme = color;
                    break;
            }
        }
    }
}
