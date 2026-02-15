/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { Inbound, Protocol } from "../Messages";
import { state, BodyTempState, HeaterState } from "../../../State";
import { sys, ControllerType, Heater } from "../../../Equipment";
import { logger } from '../../../../logger/Logger';

export class HeaterStateMessage {
    public static process(msg: Inbound) {
        if (msg.protocol === Protocol.Heater) {
            switch (msg.action) {
                case 112: // This is a message from a master controlling MasterTemp or UltraTemp ETi
                    break;
                case 114: // This is a message from a master controlling UltraTemp
                    msg.isProcessed = true;
                    break;
                case 113:
                    HeaterStateMessage.processHybridStatus(msg);
                    break;
                case 116:
                    HeaterStateMessage.processMasterTempStatus(msg);
                    break;
                case 115:
                    HeaterStateMessage.processUltraTempStatus(msg);
                    break;
            }
        }
    }
    public static processHeaterCommand(msg: Inbound) {
        let heater: Heater = sys.heaters.getItemByAddress(msg.source);
        // At this point there is no other configuration data for ET
        if (sys.controllerType === ControllerType.EasyTouch) {
            let htype = sys.board.valueMaps.heaterTypes.transform(heater.type);
            switch (htype.name) {
                case 'hybrid':
                    heater.economyTime = msg.extractPayloadByte(3);
                    heater.maxBoostTemp = msg.extractPayloadByte(4);
                    break;
            }
        }
    }
    public static processHybridStatus(msg: Inbound) {
        //[165, 0, 16, 112, 113, 10][1, 1, 0, 0, 0, 0, 0, 0, 0, 0][1, 162]
        let heater: Heater = sys.heaters.getItemByAddress(msg.source);
        let sheater = state.heaters.getItemById(heater.id);
        sheater.isOn = msg.extractPayloadByte(0) > 0;
        if (heater.master > 0) {
            let sbody = sheater.bodyId > 0 ? state.temps.bodies.getItemById(sheater.bodyId) : undefined;
            if (typeof sbody !== 'undefined') {
                switch (msg.extractPayloadByte(1)) {
                    case 1:
                        sbody.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                        break;
                    case 2:
                        sbody.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                        break;
                    case 3:
                        sbody.heatStatus = sys.board.valueMaps.heatStatus.getValue('dual');
                        break;
                    case 4:
                        sbody.heatStatus = sys.board.valueMaps.heatStatus.getValue('dual');
                        break;
                    default:
                        sbody.heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
                        break;
                }
            }
        }
        sheater.commStatus = 0;
        state.equipment.messages.removeItemByCode(`heater:${heater.id}:comms`);
        msg.isProcessed = true;
    }
    public static processUltraTempStatus(msg: Inbound) {
        // RKS: 07-03-21 - UltraTemp RS-485 protocol reverse engineering notes.
        // The heat pump communicates via Action 114 (command) / 115 (response) messages.
        //
        // Action 115 - inbound response (heat pump -> controller, heartbeat every ~1s)
        // [165, 0, 16, 112, 115, 10][160, 1, 0, 3, 0, 0, 0, 0, 0, 0][2, 70]
        // byte  description
        // ------------------------------------------------
        // 0    Always 160 for response
        // 1    Always 1
        // 2    Current heater status: 0=off, 1=heat, 2=cool
        // 3    Believed to be offset temp
        // 4-9  Unknown
        //
        // Action 114 - outbound command (controller -> heat pump)
        // [165, 0, 112, 16, 114, 10][144, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 49]
        // byte  description
        // ------------------------------------------------
        // 0    Always 144 for request
        // 1    Sets heater mode: 0=off, 1=heat, 2=cool
        // 3    Believed to be offset temp
        // 4-9  Unknown
        let heater: Heater = sys.heaters.getItemByAddress(msg.source);
        if (typeof heater === 'undefined' || !heater.isActive) {
            // Heat pump not configured for this address
            msg.isProcessed = true;
            return;
        }
        let sheater = state.heaters.getItemById(heater.id);
        let byte = msg.extractPayloadByte(2);
        let prevOn = sheater.isOn;
        let prevCooling = sheater.isCooling;
        sheater.isOn = byte >= 1;
        sheater.isCooling = byte === 2;
        sheater.commStatus = 0;
        state.equipment.messages.removeItemByCode(`heater:${heater.id}:comms`);
        if (prevOn !== sheater.isOn || prevCooling !== sheater.isCooling) {
            logger.info(`UltraTemp heartbeat: src=${msg.source} status=${byte} (${byte === 0 ? 'OFF' : byte === 1 ? 'HEAT' : 'COOL'}) heater=${heater.name}`);
        }
        msg.isProcessed = true;
    }
    public static processMasterTempStatus(msg: Inbound) {
        //[255, 0, 255][165, 0, 16, 112, 116, 23][67, 0, 0, 0, 0, 0, 0, 0, 68, 0, 0, 0, 10, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0][2, 66]
        // Byte 1 is the indicator to which setpoint it is heating to.
        // Byte 8 increments over time when the heater is on.
        // Byte 13 looks like the mode the heater is in for instance it is in cooldown mode.
        //  0 = Normal
        //  2 = ??????
        //  6 = Cooldown
        // Byte 14 looks like the cooldown delay in minutes.
        let heater: Heater = sys.heaters.getItemByAddress(msg.source);
        let sheater = state.heaters.getItemById(heater.id);
        let byte = msg.extractPayloadByte(1);
        sheater.isOn = byte >= 1;
        sheater.isCooling = false;
        sheater.commStatus = 0;
        state.equipment.messages.removeItemByCode(`heater:${heater.id}:comms`);
        msg.isProcessed = true;
    }

}