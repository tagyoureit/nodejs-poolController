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
import { Inbound } from '../Messages';
import { sys, Equipment, ExpansionPanel, Body } from '../../../Equipment';
import { state, BodyTempState } from '../../../State';
import { ControllerType } from '../../../Constants';
import { logger } from "../../../../logger/Logger";
export class EquipmentMessage {
    public static process(msg: Inbound): void {
        let pnl: ExpansionPanel;
        let bodyId: number;
        let body: Body;
        let sbody: BodyTempState;
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                switch (msg.extractPayloadByte(1)) {
                    case 0:
                        sys.equipment.name = msg.extractPayloadString(2, 16);
                        sys.equipment.type = msg.extractPayloadByte(35);
                        pnl = sys.equipment.expansions.getItemById(1, true);
                        pnl.type = msg.extractPayloadByte(36);
                        pnl.name = msg.extractPayloadString(18, 16);
                        pnl.isActive = false; //pnl.type !== 0 && pnl.type !== 255;  RKS: We will have to see what a system looks like with an expansion panel installed.
                                                // A system withouth any expansion panels installed has been shown to have a 1 in byte(38) i10PS.
                        pnl = sys.equipment.expansions.getItemById(2, true);
                        pnl.type = msg.extractPayloadByte(37);
                        pnl.isActive = false; //pnl.type !== 0 && pnl.type !== 255;
                        pnl = sys.equipment.expansions.getItemById(3, true);
                        pnl.type = msg.extractPayloadByte(38);
                        pnl.isActive = false; //pnl.type !== 0 && pnl.type !== 255;
                        body = sys.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
                        sbody = state.temps.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
                        sbody.type = body.type = msg.extractPayloadByte(39);
                        body.capacity = msg.extractPayloadByte(34) * 1000;
                        if (body.isActive && sys.equipment.maxBodies === 0) sys.bodies.removeItemById(1);
                        body.isActive = sys.equipment.maxBodies > 0;
                        break;
                    case 1:
                        pnl = sys.equipment.expansions.getItemById(2);
                        pnl.name = msg.extractPayloadString(2, 16);
                        bodyId = 2;
                        if (sys.equipment.maxBodies >= bodyId) {
                            body = sys.bodies.getItemById(bodyId, true);
                            sbody = state.temps.bodies.getItemById(bodyId, true);
                            sbody.type = body.type = msg.extractPayloadByte(35);
                            body.capacity = msg.extractPayloadByte(34) * 1000;
                            body.isActive = true;
                        }
                        else {
                            sys.bodies.removeItemById(bodyId);
                            state.temps.bodies.removeItemById(bodyId);
                        }
                        pnl = sys.equipment.expansions.getItemById(3);
                        pnl.name = msg.extractPayloadString(18, 16);
                        break;
                    case 2:
                        // The first name is the first body in this packet and the second is the third.  Go figure.
                        bodyId = 1;
                        body = sys.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                        sbody = state.temps.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                        sbody.name = body.name = msg.extractPayloadString(2, 16);
                        bodyId = 3;
                        if (sys.equipment.maxBodies >= bodyId) {
                            body = sys.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody = state.temps.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody.type = body.type = msg.extractPayloadByte(35);
                            body.capacity = msg.extractPayloadByte(34) * 1000;
                            body.isActive = bodyId <= sys.equipment.maxBodies;
                            sbody.name = body.name = msg.extractPayloadString(18, 16);
                            body.isActive = bodyId <= sys.equipment.maxBodies;
                        }
                        else {
                            sys.bodies.removeItemById(bodyId);
                            state.temps.bodies.removeItemById(bodyId);
                        }
                        break;
                    case 3:
                        // The first name is the second body and the 2nd is the 4th.  This packet also contains
                        // any additional information related to bodies 3 & 4 that were not previously included.
                        bodyId = 2;
                        if (sys.equipment.maxBodies >= bodyId) {
                            body = sys.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody = state.temps.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody.name = body.name = msg.extractPayloadString(2, 16);
                        }
                        else {
                            sys.bodies.removeItemById(bodyId);
                            state.temps.bodies.removeItemById(bodyId);
                        }
                        bodyId = 4;
                        if (sys.equipment.maxBodies >= bodyId) {
                            body = sys.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody = state.temps.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody.name = body.name = msg.extractPayloadString(18, 16);
                            sbody.type = body.type = msg.extractPayloadByte(37);
                            body.capacity = msg.extractPayloadByte(36) * 1000;
                            if (body.isActive && bodyId > sys.equipment.maxBodies) sys.bodies.removeItemById(bodyId);
                            body.isActive = bodyId <= sys.equipment.maxBodies;
                        }
                        else {
                            sys.bodies.removeItemById(bodyId);
                            state.temps.bodies.removeItemById(bodyId);
                        }
                        bodyId = 3;
                        if (sys.equipment.maxBodies >= bodyId) {
                            body = sys.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody = state.temps.bodies.getItemById(bodyId, bodyId <= sys.equipment.maxBodies);
                            sbody.type = body.type = msg.extractPayloadByte(35);
                            body.capacity = msg.extractPayloadByte(34) * 1000;
                            if (body.isActive && bodyId > sys.equipment.maxBodies) sys.bodies.removeItemById(bodyId);
                            body.isActive = bodyId <= sys.equipment.maxBodies;
                        }
                        else {
                            sys.bodies.removeItemById(bodyId);
                            state.temps.bodies.removeItemById(bodyId);
                        }
                        state.equipment.shared = sys.equipment.shared;
                        state.equipment.model = sys.equipment.model;
                        state.equipment.controllerType = sys.controllerType;
                        state.equipment.maxBodies = sys.equipment.maxBodies;
                        state.equipment.maxCircuits = sys.equipment.maxCircuits;
                        state.equipment.maxValves = sys.equipment.maxValves;
                        state.equipment.maxSchedules = sys.equipment.maxSchedules;
                        state.equipment.maxPumps = sys.equipment.maxPumps;
                        break;
                    default:
                        logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                        break;
                }
                break;
            case ControllerType.IntelliCom:
            case ControllerType.EasyTouch:
            case ControllerType.IntelliTouch:
                switch (msg.action) {
                    case 252:
                        EquipmentMessage.processSoftwareVersion(msg);
                        break;
                }
                break;
        }
    }
    private static processSoftwareVersion(msg: Inbound) {
        // sample packet
        // [165,33,15,16,252,17],0,{2,90},0,0,{1,10},0,0,0,0,0,0,0,0,0,0],[2,89]
        sys.equipment.bootloaderVersion = `${msg.extractPayloadByte(5)}.${msg.extractPayloadByte(6) < 100 ? '0' + msg.extractPayloadByte(6) : msg.extractPayloadByte(6)}`;
        sys.equipment.controllerFirmware = `${msg.extractPayloadByte(1)}.${msg.extractPayloadByte(2) < 100 ? '0' + msg.extractPayloadByte(2) : msg.extractPayloadByte(2)}`;
    }
    //private static calcModel(eq: Equipment) {
    //    eq.shared = (eq.type & 8) === 8;
    //    eq.maxPumps = 16;
    //    eq.maxLightGroups = 40;
    //    eq.maxCircuitGroups = 16;
    //    eq.maxValves = EquipmentMessage.calcMaxValves(eq);
    //    eq.maxCircuits = EquipmentMessage.calcMaxCircuits(eq);
    //    eq.maxBodies = EquipmentMessage.calcMaxBodies(eq);
    //    eq.model = 'IntelliCenter i' + (eq.maxCircuits + (eq.shared ? -1 : 0)).toString() + 'P' + (eq.shared ? 'S' : '');
    //}
    //private static calcMaxBodies(eq: Equipment): number {
    //    let max: number = eq.shared ? 2 : 1;
    //    for (let i = 0; i < eq.expansions.length; i++) {
    //        const exp: ExpansionPanel = eq.expansions.getItemById(i + 1);
    //        if (exp.type === 0) continue;
    //        max += (exp.type & 8) === 8 ? 2 : 1;
    //    }
    //    return max;
    //}
    //private static calcMaxValves(eq: Equipment): number {
    //    let max: number = 4;
    //    max += (eq.type & 1) === 1 ? 6 : 0;
    //    for (let i = 0; i < eq.expansions.length; i++) {
    //        const exp: ExpansionPanel = eq.expansions.getItemById(i + 1);
    //        max += (exp.type & 1) === 1 ? 6 : 0;
    //    }
    //    return max;
    //}
    //private static calcMaxCircuits(eq: Equipment): number {
    //    let max: number = 6;
    //    max += (eq.type & 2) === 2 ? 2 : 0;
    //    max += (eq.type & 4) === 4 ? 2 : 0;
    //    max += eq.shared ? 1 : 0;
    //    for (let i = 0; i < eq.expansions.length; i++) {
    //        const exp: ExpansionPanel = eq.expansions.getItemById(i + 1);
    //        max += (exp.type & 2) === 2 ? 5 : 0;
    //        max += (exp.type & 4) === 2 ? 5 : 0;
    //    }
    //    return max;
    //}
}
