import { Inbound, Message } from '../Messages';
import { ControllerType } from '../../../Constants';
import { state, BodyTempState } from '../../../State';
import { sys, Body, ExpansionPanel, Heater, ConfigVersion, Circuit, Feature } from '../../../Equipment';
import { logger } from 'logger/Logger';
import { IntelliCenterBoard } from 'controller/boards/IntelliCenterBoard';

export class EquipmentStateMessage {
    private static initIntelliCenter(msg: Inbound) {
        sys.controllerType = ControllerType.IntelliCenter;
        sys.equipment.maxSchedules = 100;
        sys.equipment.maxFeatures = 32;
    }
    public static initDefaults() {
        // defaults; set to lowest possible values.  Each *Touch will extend this once we know the model.
        sys.equipment.maxBodies = 1;
        sys.equipment.maxCircuits = 4;
        sys.equipment.maxSchedules = 12;
        sys.equipment.maxPumps = 2;
        sys.equipment.maxSchedules = 12;
        sys.equipment.maxValves = 2;
        sys.equipment.maxCircuitGroups = 0;
        sys.equipment.maxLightGroups = 1;
        sys.equipment.maxIntelliBrites = 8;
        sys.equipment.maxChlorinators = 1;
        sys.equipment.maxCustomNames = 10;
    }
    private static initTouch(msg: Inbound, model1: number, model2: number) {
        switch (model2) {
            case 11: // SunTouch.  Eq to IntelliCom??
                sys.controllerType = ControllerType.IntelliCom;
                sys.equipment.model = 'Suntouch/Intellicom';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxFeatures = 4;
                sys.equipment.maxValves = 2;
                sys.equipment.maxSchedules = 4;
                sys.equipment.maxCircuits = 4; // 2 filter + 2 aux
                sys.equipment.maxCircuitGroups = 0;
                break;
            case 0:
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i5+3S';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 6; // 2 filter + 5 aux
                sys.equipment.maxCircuitGroups = 3;
                break;
            case 1: // IntelliTouch i7+3
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i7+3';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuits = 7; // 2 filter + 5 aux
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 2: // IntelliTouch i9+3
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i9+3';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 9; // 1 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 3: // IntelliTouch i5+3S
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i5+3S';
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 5; // 2 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 4: // IntelliTouch i9+3S
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i9+3S';
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 9; // 1 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxIntelliBrites = 10;
                break;
            case 5: // IntelliTouch i10+3D
                sys.controllerType = ControllerType.IntelliTouch;
                sys.equipment.maxPumps = 8; // All IntelliTouch systems can support 8VF pumps or 4VS and 4VF pumps.
                sys.equipment.model = 'IntelliTouch i10+3D';
                sys.equipment.maxBodies = 2;
                sys.equipment.maxValves = 4; // This needs to be looked at as 3 additional valves can be added with the valve expansion.
                sys.equipment.maxSchedules = 99;
                sys.equipment.maxCircuits = 10; // 2 filter + 8 aux
                sys.equipment.maxFeatures = 10;
                sys.equipment.maxCircuitGroups = 3;
                sys.equipment.maxIntelliBrites = 10;
                sys.equipment.dual = true;
                sys.equipment.shared = false;
                break;
            case 13: // EasyTouch2 Models
                sys.controllerType = ControllerType.EasyTouch;
                // sys.equipment.maxValves = 2; // EasyTouch Systems have Pool/Spa A and B.
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxPumps = 2; // All EasyTouch systems can support 2 VS, VSF or VF pumps.
                sys.equipment.maxCircuitGroups = 0;
                sys.board.equipmentIds.invalidIds.add(10); // exclude invalid circuit
                sys.board.equipmentIds.invalidIds.add(19); // exclude invalid circuit
                // will exclude AUX EXTRA 
                switch (model1) {
                    case 0:
                        sys.equipment.model = 'EasyTouch2 8';
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.maxFeatures = 8;
                        break;
                    case 1:
                        sys.equipment.model = 'EasyTouch2 8P';
                        sys.equipment.maxCircuits = 8;
                        sys.equipment.maxBodies = 1; // All Ps are single body
                        sys.equipment.maxFeatures = 8;
                        sys.board.equipmentIds.invalidIds.add(1); // exclude spa
                        break;
                    case 2:
                        sys.equipment.model = 'EasyTouch2 4';
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 6;
                        sys.equipment.maxFeatures = 2;
                        sys.board.equipmentIds.invalidIds.add(7); // exclude Aux5
                        sys.board.equipmentIds.invalidIds.add(8); // exclude Aux6
                        sys.board.equipmentIds.invalidIds.add(9); // exclude Aux7
                        break;
                    case 3:
                        /*  RG 5/2020
                        Per #167, updated the number of maxCircuits for EasyTouch2 4*.
                        It was originally set as 4 (with Id's 1-4) but with pool id=6
                        that clearly was wrong.  Not sure if they go 2-6 or 2-7 or something else.
                        */
                        sys.equipment.model = 'EasyTouch2 4P';
                        sys.equipment.maxCircuits = 6;
                        sys.equipment.maxBodies = 1; // All Ps are single body
                        sys.equipment.maxFeatures = 2;
                        sys.board.equipmentIds.invalidIds.add(1); // exclude spa
                        // sys.board.equipmentIds.invalidIds.add(7); // exclude Aux5
                        sys.board.equipmentIds.invalidIds.add(8); // exclude Aux6
                        sys.board.equipmentIds.invalidIds.add(9); // exclude Aux7
                        break;
                }
                break;

            case 14: // EasyTouch1 Models
                sys.controllerType = ControllerType.EasyTouch;
                sys.equipment.maxValves = 2; // EasyTouch Systems have Pool/Spa A and B.
                sys.equipment.maxSchedules = 12;
                sys.equipment.maxPumps = 2; // All EasyTouch systems can support 2 VS or VF pumps.
                sys.equipment.maxCircuitGroups = 0;
                sys.equipment.maxFeatures = 8;
                switch (model1) {
                    case 0:
                        sys.equipment.model = 'EasyTouch1 8';
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 8;
                        break;
                    case 1:
                        sys.equipment.model = 'EasyTouch1 8P';
                        sys.equipment.maxBodies = 1;
                        sys.equipment.maxCircuits = 8;
                        break;
                    case 2: // check...
                        sys.equipment.model = 'EasyTouch1 4';
                        sys.equipment.maxBodies = 2;
                        sys.equipment.maxCircuits = 6;
                        break;
                    case 3: // check...
                        sys.equipment.model = 'EasyTouch1 4P';
                        sys.equipment.maxCircuits = 6;
                        break;
                }
                break;
        }
        if (sys.controllerType === ControllerType.IntelliTouch) {
            sys.equipment.maxCustomNames = 20;
            sys.equipment.maxCircuitGroups = 10;
            let pnl: ExpansionPanel;
            pnl = sys.equipment.expansions.getItemById(1, true);
            pnl.type = msg.extractPayloadByte(9) & 0x20;
            pnl.name = pnl.type === 32 ? 'i10X' : 'none';
            pnl.isActive = pnl.type !== 0;
            // if type is i9 or i10 we can have up to 3 expansion boards
            if (pnl.isActive) {
                sys.equipment.maxCircuits += 10;
                sys.equipment.maxValves += 3;
            }
            pnl = sys.equipment.expansions.getItemById(2, true);
            pnl.type = 0; // msg.extractPayloadByte(9) & 0x20;
            pnl.name = pnl.type === 1 ? 'i10X' : 'none';
            pnl.isActive = pnl.type !== 0;
            if (pnl.isActive) {
                sys.equipment.maxCircuits += 10;
                sys.equipment.maxValves += 3;
            }
            pnl = sys.equipment.expansions.getItemById(3, true);
            pnl.type = 0; // msg.extractPayloadByte(9) & 0x20;
            pnl.name = pnl.type === 1 ? 'i10X' : 'none';
            pnl.isActive = pnl.type !== 0;
            if (pnl.isActive) {
                sys.equipment.maxCircuits += 10;
                sys.equipment.maxValves += 3;
            }
        }
        state.equipment.model = sys.equipment.model;
        state.equipment.controllerType = sys.controllerType;
        ['S', 'P', 'D'].includes(sys.equipment.model.slice(-1)) ? state.equipment.shared = sys.equipment.shared = false : state.equipment.shared = sys.equipment.shared = true;
        sys.equipment.shared ? sys.board.equipmentIds.circuits.start = 1 : sys.board.equipmentIds.circuits.start = 2;
        // shared equipment frees up one physical circuit
        sys.equipment.maxCircuits += sys.equipment.shared ? 1 : 0;
        state.equipment.maxBodies = sys.equipment.maxBodies;
        let heater = sys.heaters.getItemById(1, true);
        heater.isActive = true;
        heater.type = 1;
        heater.name = "Gas Heater";
        sys.equipment.shared ? heater.body = 32 : heater.body = 0;
        sys.equipment.setEquipmentIds();
        // This will let any connected clients know if anything has changed.  If nothing has ...crickets.
        state.emitControllerChange();
    }
    public static initVirtual() {
        state.equipment.controllerType = sys.controllerType = ControllerType.Virtual;
        state.equipment.model = sys.equipment.model = 'Virtual Controller';
        state.status = 1;
        sys.equipment.maxFeatures = 10;
        sys.equipment.maxCircuits = 0;
        sys.equipment.maxSchedules = 0;
        sys.equipment.maxValves = 0;
        sys.equipment.maxIntelliBrites = 0;
        sys.equipment.maxLightGroups = 0;
        sys.equipment.maxCustomNames = 10;
        sys.customNames.getItemById(1, true, { id: 1, name: "Generic", isActive: true });
        // setup pool circuit
        let pool = sys.circuits.getItemById(6, true);
        let spool = state.circuits.getItemById(6, true);
        pool.name = spool.name = 'Pool';
        pool.type = spool.type = 6;
        pool.isActive = true;
        spool.isOn = false;
        pool.type = spool.type = 6;
        sys.bodies.getItemById(1, true, { id: 1, isActive: true, name: "Pool" });
        sys.general.options.clockMode = 12;
        sys.general.options.clockSource = "manual";
        state.equipment.maxBodies = sys.equipment.maxBodies;
        state.mode = 0;
        state.status = 1;
        state.temps.units = 0;
        sys.equipment.setEquipmentIds();
        state.emitControllerChange();

    }
    private static initController(msg: Inbound) {
        state.status = 1;
        Message.headerSubByte = msg.header[1];
        const model1 = msg.extractPayloadByte(27);
        const model2 = msg.extractPayloadByte(28);
        if (model2 === 0 && (model1 === 23 || model1 === 40)) {
            state.equipment.controllerType = 'intellicenter';
            sys.controllerType = ControllerType.IntelliCenter;
            console.log(`Found Controller Board ${ state.equipment.model }, awaiting installed modules.`);
            EquipmentStateMessage.initIntelliCenter(msg);
        }
        else {
            EquipmentStateMessage.initTouch(msg, model1, model2);
            console.log(`Found Controller Board ${ state.equipment.model }`);
            setTimeout(function() { sys.checkConfiguration(); }, 300);
        }
    }
    public static process(msg: Inbound) {
        if (!state.isInitialized) {
            if (msg.action === 2) EquipmentStateMessage.initController(msg);
            else return;
        }
        else if (!sys.board.modulesAcquired) {
            if (msg.action === 204) {
                let board = sys.board as IntelliCenterBoard;
                // We have determined that the 204 message now contains the information
                // related to the installed expansion boards.
                console.log(`INTELLICENTER MODULES DETECTED, REQUESTING STATUS!`);
                board.initExpansionModules(msg.extractPayloadByte(13), msg.extractPayloadByte(14),
                    msg.extractPayloadByte(15),
                    msg.extractPayloadByte(16),
                    msg.extractPayloadByte(17));
                sys.equipment.setEquipmentIds();
            }
            else return;
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
                    state.freeze = (msg.extractPayloadByte(9) & 0x08) === 0x08;
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
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(6, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 6;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0f;
                            if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 1) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 1;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xf0) >> 4;
                            if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 2) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(10, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(3, true);
                            const cbody: Body = sys.bodies.getItemById(3);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0f;
                            tbody.circuit = cbody.circuit = 12;
                            if ((msg.extractPayloadByte(3) & 0x08) === 8) {
                                // This is the first circuit on the second body.
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 3) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(19, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(4, true);
                            const cbody: Body = sys.bodies.getItemById(4);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xf0) >> 4;
                            tbody.circuit = cbody.circuit = 22;
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
                    else {
                        state.temps.waterSensor1 = msg.extractPayloadByte(14);
                        if (sys.bodies.length > 2) state.temps.waterSensor2 = msg.extractPayloadByte(15);
                        if (sys.bodies.length > 0) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(6, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 6;
                            const heatMode = msg.extractPayloadByte(22) & 0x03;
                            tbody.heatMode = cbody.heatMode = heatMode;
                            const heaterActive = (msg.extractPayloadByte(10) & 0x0C) === 12;
                            const solarActive = (msg.extractPayloadByte(10) & 0x30) === 48;
                            if (tbody.isOn && (heaterActive || solarActive)) {
                                switch (heatMode) {
                                    // todo: add cooling in here if it ever shows up
                                    case 1: // heater
                                    case 3: // solar
                                        tbody.heatStatus = heatMode;
                                        break;
                                    case 2: // solarpref
                                        if (heaterActive) tbody.heatStatus = 1; else if (solarActive) tbody.heatStatus = 3;
                                        break;
                                }
                            } else
                                tbody.heatStatus = 0; // Off
                        }
                        if (sys.bodies.length > 1) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            const heatMode = (msg.extractPayloadByte(22) & 0x0c) >> 2;
                            tbody.heatMode = cbody.heatMode = heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 1;
                            const heaterActive = (msg.extractPayloadByte(10) & 0x0C) === 12;
                            const solarActive = (msg.extractPayloadByte(10) & 0x30) === 48;
                            if (tbody.isOn && (heaterActive || solarActive)) {
                                switch (heatMode) {
                                    // todo: add cooling in here if it ever shows up
                                    case 1: // heater
                                    case 3: // solar
                                        tbody.heatStatus = heatMode;
                                        break;
                                    case 2: // solarpref
                                        if (heaterActive) tbody.heatStatus = 1; else if (solarActive) tbody.heatStatus = 3;
                                        break;
                                }
                            } else
                                tbody.heatStatus = 0; // Off
                        }
                    }
                    switch (sys.controllerType) {
                        case ControllerType.IntelliCenter:
                            {
                                EquipmentStateMessage.processCircuitState(msg);
                                EquipmentStateMessage.processFeatureState(msg);
                                let ver: ConfigVersion =
                                    typeof (sys.configVersion) === 'undefined' ? new ConfigVersion({}) : sys.configVersion;
                                ver.equipment = msg.extractPayloadInt(25);
                                sys.processVersionChanges(ver);
                                state.emitControllerChange();
                                state.emitEquipmentChanges();
                                sys.board.circuits.syncVirtualCircuitStates();
                                break;
                            }
                        case ControllerType.IntelliCom:
                        case ControllerType.EasyTouch:
                        case ControllerType.IntelliTouch:
                            {
                                this.processTouchCircuits(msg);
                            }
                            // This will toggle the group states depending on the state of the individual circuits.
                            sys.board.features.syncGroupStates();
                            sys.board.circuits.syncVirtualCircuitStates();
                            //state.emitControllerChange();
                            //state.emitEquipmentChanges();
                            break;
                    }
                }
                break;
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
                state.emitControllerChange();
                state.emitEquipmentChanges();
                break;
            case 8: {
                // IntelliTouch only.  Heat status
                // [165,x,15,16,8,13],[75,75,64,87,101,11,0, 0 ,62 ,0 ,0 ,0 ,0] ,[2,190]
                state.temps.waterSensor1 = msg.extractPayloadByte(0);

                state.temps.air = msg.extractPayloadByte(2);
                let solar: Heater = sys.heaters.getItemById(2);
                if (solar.isActive) state.temps.solar = msg.extractPayloadByte(8);
                // pool
                let tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                let cbody: Body = sys.bodies.getItemById(1);
                tbody.heatMode = cbody.heatMode = msg.extractPayloadByte(5) & 3;
                tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(3);
                tbody.temp = state.temps.waterSensor1;

                cbody = sys.bodies.getItemById(2);
                if (cbody.isActive) {
                    // spa
                    tbody = state.temps.bodies.getItemById(2, true);
                    tbody.heatMode = cbody.heatMode =
                        (msg.extractPayloadByte(5) & 12) >> 2;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(4);
                    tbody.temp = state.temps.waterSensor2 = msg.extractPayloadByte(1);
                }
                // state.emitEquipmentChanges();
                break;
            }
            case 96:
                EquipmentStateMessage.processIntelliBriteMode(msg);
                break;
            case 197: {
                // request for date/time on *Touch.  Use this as an indicator
                // that SL has requested config and update lastUpdated date/time
                if (msg.dest === 16) {
                    if (sys.controllerType !== ControllerType.IntelliCenter) {
                        let ver: ConfigVersion =
                            typeof (sys.configVersion) === 'undefined' ? new ConfigVersion({}) : sys.configVersion;
                        ver.lastUpdated = new Date();
                        sys.processVersionChanges(ver);
                    }
                }
                break;
            }
            case 204: // IntelliCenter only.
                state.batteryVoltage = msg.extractPayloadByte(2) / 50;
                state.comms.keepAlives = msg.extractPayloadInt(4);
                state.time.date = msg.extractPayloadByte(6);
                state.time.month = msg.extractPayloadByte(7);
                state.time.year = msg.extractPayloadByte(8);
                sys.equipment.controllerFirmware = (msg.extractPayloadByte(42)
                    + (msg.extractPayloadByte(43) / 1000)).toString();
                if (msg.extractPayloadByte(37, 255) !== 255) {
                    const chlor = state.chlorinators.getItemById(1);
                    chlor.superChlorRemaining =
                        msg.extractPayloadByte(37) * 3600 + msg.extractPayloadByte(38) * 60;
                } else {
                    const chlor = state.chlorinators.getItemById(1);
                    chlor.superChlorRemaining = 0;
                    chlor.superChlor = false;
                }
                // state.emitControllerChange();
                // state.emitEquipmentChanges();
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

        // TODO: To RKS, can we combine this and processCircuitState for IntelliCenter?  
        // Not exactly sure why we are hardcoding byte 7 here.
        // I combined the *touch circuits and features in processTouchCircuits below.
        let featureId = sys.board.equipmentIds.features.start;
        for (let i = 1; i <= sys.features.length; i++) {
            // Use a case statement here since we don't know where to go after 4.
            switch (i) {
                case 1:
                case 2:
                case 3:
                case 4: {
                    const byte = msg.extractPayloadByte(7);
                    const feature = sys.features.getItemById(featureId);
                    const fstate = state.features.getItemById(featureId, feature.isActive);
                    fstate.isOn = (byte >> 4 & 1 << (i - 1)) > 0;
                    fstate.name = feature.name;
                    break;
                }
            }
            featureId++;
        }
    }
    private static processCircuitState(msg: Inbound) {
        // The way this works is that there is one byte per 8 circuits for a total of 5 bytes or 40 circuits.  The
        // configuration already determined how many available circuits we have by querying the model of the panel
        // and any installed expansion panel models.  Only the number of available circuits will appear in this
        // array.
        let count = Math.min(Math.floor(sys.circuits.length / 8), 5) + 2;
        let circuitId = sys.board.equipmentIds.circuits.start;
        let body = 0; // Off
        for (let i = 2; i < msg.payload.length && i <= count; i++) {
            const byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                let circuit = sys.circuits.getItemById(circuitId);
                if (circuit.isActive) {
                    let cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                    cstate.isOn = (byte & 1 << j) >> j > 0;
                    cstate.name = circuit.name;
                    cstate.nameId = circuit.nameId;
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
                                cstate.level = circuit.level || 0;
                                break;
                        }
                }
                circuitId++;
            }
        }
        state.body = body;
        // state.emitControllerChange();
        // state.emitEquipmentChanges();
    }
    private static processTouchCircuits(msg: Inbound) {
        const count = sys.board.equipmentIds.features.end;
        let circId = 1;
        let body = 0;
        for (let i = 2; i < msg.payload.length && i <= count; i++) {
            const byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                const circ = sys.circuits.getInterfaceById(circId);
                if (!sys.board.equipmentIds.invalidIds.isValidId(circId)) {
                    circ.isActive = false;
                    if (circ instanceof Circuit) {
                        sys.circuits.removeItemById(circId);
                    }
                    else if (circ instanceof Feature) {
                        sys.features.removeItemById(circId);
                    }
                }
                if (circ.isActive) {
                    const cstate = state.circuits.getInterfaceById(
                        circId,
                        circ.isActive
                    );
                    if (cstate.isOn && circId === 6) body = 6;
                    if (cstate.isOn && circId === 1) body = 1;
                    cstate.showInFeatures = circ.showInFeatures;
                    cstate.isOn = (byte & 1 << j) >> j > 0;
                    cstate.name = circ.name;
                    cstate.type = circ.type;
                    cstate.nameId = circ.nameId;
                }
                circId++;
            }
        }
        state.body = body;
        //state.emitControllerChange();
        state.emitEquipmentChanges();
    }
    private static processIntelliBriteMode(msg: Inbound) {
        // eg RED: [165,16,16,34,96,2],[195,0],[2,12]
        // data[0] = color
        const theme = msg.extractPayloadByte(0);
        switch (theme) {
            case 0: // off
            case 1: // on
            case 190: // save
                // case 191: // recall
                // RKS: TODO hold may be in this list since I see the all on and all off command here.  Sync is probably in the colorset message that includes the timings. 
                // do nothing as these don't actually change the state.
                break;

            default:
                {
                    // intellibrite themes
                    // This is an observed message in that no-one asked for it.  *Touch does not report the theme and in fact, it is not even
                    // stored.  Once the message is sent then it throws away the data.  When you turn the light
                    // on again it will be on at whatever theme happened to be set at the time it went off.  We keep this
                    // as a best guess so when the user turns on the light it will likely be the last theme observed.
                    state.intellibrite.lightingTheme = sys.intellibrite.lightingTheme = theme;
                    const grp = sys.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
                    const sgrp = state.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
                    grp.lightingTheme = sgrp.lightingTheme = theme;
                    for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
                        let ib = sys.intellibrite.circuits.getItemByIndex(i);
                        const sgrp = state.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
                        let circuit = sys.circuits.getItemById(ib.circuit);
                        let cstate = state.circuits.getItemById(ib.circuit);
                        if (cstate.isOn) cstate.lightingTheme = circuit.lightingTheme = theme;
                    }
                    for (let i = 0; i < grp.circuits.length; i++) {
                        let c = grp.circuits.getItemByIndex(i);
                        let cstate = state.circuits.getItemById(c.circuit);
                        let circuit = sys.circuits.getInterfaceById(c.circuit);
                        if (cstate.isOn) cstate.lightingTheme = circuit.lightingTheme = theme;
                    }
                    switch (theme) {
                        case 128: // sync
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'sync');
                            break;
                        case 144: // swim
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'swim');
                            break;
                        case 160: // swim
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'set');
                            break;
                        case 190: // save
                        case 191: // recall
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'other');
                            break;
                        default:
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'color');
                        // other themes for magicstream?
        
                    }
                    break;
                }
        }
    }
}
