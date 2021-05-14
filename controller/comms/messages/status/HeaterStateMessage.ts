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
        let heater: Heater;
        heater = sys.heaters.getItemByAddress(msg.source);

        // We need to decode the message.  For a 2 of
        //[165, 1, 15, 16, 2, 29][16, 42, 3, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 88, 88, 0, 241, 95, 100, 24, 246, 0, 0, 0, 0, 0, 40, 0][4, 221]
        //[165, 0, 112, 16, 114, 10][144, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 49] // OCP to Heater
        //[165, 0, 16, 112, 115, 10][160, 1, 0, 3, 0, 0, 0, 0, 0, 0][2, 70] // Heater Reply
        msg.isProcessed = true;
    }
}