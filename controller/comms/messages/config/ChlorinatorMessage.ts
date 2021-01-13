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
import { sys, Chlorinator } from "../../../Equipment";
import { Inbound } from "../Messages";
import { state } from "../../../State";
import { logger } from "../../../../logger/Logger"
export class ChlorinatorMessage {
    public static process(msg: Inbound): void {
        var chlorId;
        var chlor: Chlorinator;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                chlorId = 1;
                for (let i = 0; i < 4 && i + 30 < msg.payload.length; i++) {
                    let isActive = msg.extractPayloadByte(i + 22) === 1;
                    let chlor = sys.chlorinators.getItemById(chlorId, isActive);
                    let schlor = state.chlorinators.getItemById(chlor.id, isActive);
                    chlor.isActive = schlor.isActive = isActive;
                    if (i >= sys.equipment.maxChlorinators || !isActive) {
                        sys.chlorinators.removeItemById(chlorId);
                        state.chlorinators.removeItemById(chlorId);
                    }
                    else {
                        chlor.body = msg.extractPayloadByte(i + 2);
                        chlor.type = msg.extractPayloadByte(i + 6);
                        if (!chlor.disabled) {
                            // RKS: We don't want to change the setpoints if our chem controller disabled
                            // the chlorinator.  These should be 0.
                            chlor.poolSetpoint = msg.extractPayloadByte(i + 10);
                            chlor.spaSetpoint = msg.extractPayloadByte(i + 14);
                        }
                        chlor.superChlor = msg.extractPayloadByte(i + 18) === 1;
                        chlor.isActive = msg.extractPayloadByte(i + 22) === 1;
                        chlor.superChlorHours = msg.extractPayloadByte(i + 26);
                        chlor.address = 80 + i;
                        schlor.body = chlor.body;
                        schlor.poolSetpoint = chlor.poolSetpoint;
                        schlor.spaSetpoint = chlor.spaSetpoint;
                        schlor.type = chlor.type;
                        schlor.isActive = chlor.isActive;
                        schlor.superChlorHours = chlor.superChlorHours;
                        state.emitEquipmentChanges();
                    }
                    chlorId++;
                }
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
    public static processTouch(msg: Inbound) {
        // This is for the 25 message that is broadcast from the OCP.
        let isActive = (msg.extractPayloadByte(0) & 0x01) === 1;
        let chlor = sys.chlorinators.getItemById(1, isActive);
        let schlor = state.chlorinators.getItemById(1, isActive);
        chlor.isActive = schlor.isActive = isActive;
        if (isActive) {
            if (!chlor.disabled) {
                // RKS: We don't want these setpoints if our chem controller disabled the
                // chlorinator.  These should be 0 anyway.
                schlor.poolSetpoint = chlor.spaSetpoint = msg.extractPayloadByte(0) >> 1;
                schlor.spaSetpoint = chlor.poolSetpoint = msg.extractPayloadByte(1);
                chlor.address = chlor.id + 79;
                schlor.body = chlor.body = sys.equipment.maxBodies >= 1 || sys.equipment.shared === true ? 32 : 0;
            }
            schlor.name = chlor.name = msg.extractPayloadString(6, 16);
            schlor.saltLevel = msg.extractPayloadByte(3) * 50 || schlor.saltLevel;
            schlor.status = msg.extractPayloadByte(4) & 0x007F; // Strip off the high bit.  The chlorinator does not actually report this.;
            schlor.superChlor = msg.extractPayloadByte(5) > 0;
            schlor.superChlorHours = msg.extractPayloadByte(5);
            if (schlor.superChlor) {
                schlor.superChlorRemaining = schlor.superChlorHours * 3600;                // }
            }
            else {
                schlor.superChlorRemaining = 0;
                chlor.superChlorHours = 1;
            }
            if (state.temps.bodies.getItemById(1).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.poolSetpoint;
            else if (state.temps.bodies.getItemById(2).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.spaSetpoint;
        }
        else {
            sys.chlorinators.removeItemById(1);
            state.chlorinators.removeItemById(1);
        }
    }
}