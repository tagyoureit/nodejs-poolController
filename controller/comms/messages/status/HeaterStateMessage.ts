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
import { Inbound, Protocol } from "../Messages";
import { state, BodyTempState, HeaterState } from "../../../State";
import { sys, ControllerType, Heater } from "../../../Equipment";

export class HeaterStateMessage {
    public static process(msg: Inbound) {
        if (msg.protocol === Protocol.Heater) {
            switch (msg.action) {
                case 114: // This is a message from a master controlling the heater
                    break;
                case 115:
                    HeaterStateMessage.processHeaterStatus(msg);
                    break;
            }
        }
    }
    public static processHeaterStatus(msg: Inbound) {
        // RKS: 07-03-21 - We only know byte 2 at this point for Ultratemp for the 115 message we are processing here.  The 
        // byte  description
        // ------------------------------------------------
        // 0    Unknown (always seems to be 160 for response)
        // 1    Unknown (always 1)
        // 2    Current heater status 0=off, 1=heat, 2=cool
        // 3-9  Unknown
        
        // 114 message - outbound response
        //[165, 0, 112, 16, 114, 10][144, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 49] // OCP to Heater
        // byte  description
        // ------------------------------------------------
        // 0    Unknown (always seems to be 144 for request)
        // 1    Current heater status 0=off, 1=heat, 2=cool
        // 3    Believed to be ofset temp
        // 4-9  Unknown
        
        //   byto 0: always seems to be 144 for outbound
        //   byte 1: Sets heater mode to 0 = Off 1 = Heat 2 = Cool
        //[165, 0, 16, 112, 115, 10][160, 1, 0, 3, 0, 0, 0, 0, 0, 0][2, 70] // Heater Reply
        let heater: Heater = sys.heaters.getItemByAddress(msg.source);
        let sheater = state.heaters.getItemById(heater.id);
        let byte = msg.extractPayloadByte(2);
        sheater.isOn = byte >= 1;
        sheater.isCooling = byte === 2;
        sheater.commStatus = 0;
        state.equipment.messages.removeItemByCode(`heater:${heater.id}:comms`);
        msg.isProcessed = true;
    }
}