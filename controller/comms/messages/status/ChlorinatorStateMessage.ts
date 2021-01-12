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
import { state, BodyTempState } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";

export class ChlorinatorStateMessage {
    public static process(msg: Inbound) {
        if (msg.protocol === Protocol.Chlorinator) {
            let chlor;
            let cstate;
            if (msg.dest >= 1 && msg.dest <= 4) {
                // RKS: The dest for these message are 80+ in raw terms.  The msg object translates these into 1-4 for the installed chlorinators.  This message
                // is from the OCP to the chlorinator.
                cstate = state.chlorinators.getItemById(msg.dest, true);
                if (typeof cstate.lastComm === 'undefined') cstate.lastComm = new Date(1970, 0, 1, 0, 0, 0, 0).getTime();
                // RG: I was getting some time deltas of 25-30s and bumped this up
                else if (cstate.lastComm + (30 * 1000) < new Date().getTime()) {
                    // We have not talked to the chlorinator in 30 seconds so we have lost communication.
                    cstate.status = 128;
                }
                chlor = sys.chlorinators.getItemById(msg.dest, true);
                chlor.address = msg.dest + 79;
                if (typeof chlor.isActive === 'undefined') cstate.isActive = chlor.isActive = true;
            }
            else {
                // Message from chlorinator
                cstate = state.chlorinators.getItemById(msg.dest + 1, true);
                chlor = sys.chlorinators.getItemById(msg.dest + 1, true);
                cstate.lastComm = new Date().getTime();
            }
            switch (msg.action) {
                case 0: // request status (0): [16,2,80,0][0][98,16,3]
                    break;
                case 1: // response to request status: [16,2,0,1][0,0][19,16,3]
                    {
                        // let chlor = sys.chlorinators.getItemById(1, true);
                        // chlor.isActive = true;
                        break;
                    }
                case 3: {
                    // RKS: 07-16-20 -- It appears that this message doesn't always come.  It is very likely that the newer versions of IntelliChlor
                    // do not respond to the 20 message.  There have been multiple instances of this with recent versions of IntelliChlor. As a result,
                    // don't overwrite the name should the user set it.
                    // Response to Get Version (20)
                    //                  I   n    t    e    l    l    i    c   h    l    o    r    -   -   4   0
                    //[16, 2, 0, 3][0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48][188, 16, 3]
                    // This is the model number of the chlorinator and the address is actually the second byte.
                    if (typeof chlor.name === 'undefined' || chlor.name === '') chlor.name = msg.extractPayloadString(1, 16);
                    cstate.name = chlor.name;
                    cstate.isActive = chlor.isActive;
                    state.emitEquipmentChanges();
                    break;
                }
                case 17: {
                    // If the chlorinator is no longer talking to us then clear the current output.
                    if (cstate.status === 128) cstate.currentOutput = 0;
                    cstate.targetOutput = msg.extractPayloadByte(0);
                    if (chlor.disabled && cstate.targetOutput !== 0) {
                        // Some dumbass is trying to change our output.  We need to set it back to 0.
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                    }
                    state.emitEquipmentChanges();
                    break;
                }
                case 21: {
                    // Set Cell Output / 10
                    // This packet is coming through differently on the IntelliConnect.
                    // eg 13:42:31.304 VERBOSE Msg# 1531   Controller --> Salt cell: Set current output to 1.6 %: 16,2,80,21,0,119,16,3
                    // The current output here is not correct.  The reason that is is because this is a request from the OCP to the Chlorinator.
                    //cstate.currentOutput = msg.action === 17 ? msg.extractPayloadByte(0) : msg.extractPayloadByte(0) / 10;
                    cstate.targetOutput = msg.extractPayloadByte(0) / 10;
                    if (chlor.disabled && cstate.targetOutput !== 0) {
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                    }
                    state.emitEquipmentChanges();
                    break;
                }
                case 18: {
                    // Response to Set Salt Output (17 & 20)
                    // The most common failure with IntelliChlor is that the salt level stops reporting.  Below should allow it to be fed from an alternate
                    // source like REM.
                    cstate.saltLevel = msg.extractPayloadByte(0) * 50 || cstate.saltLevel || 0;
                    cstate.status = (msg.extractPayloadByte(1) & 0x007F); // Strip off the high bit.  The chlorinator does not actually report this. 
                    cstate.currentOutput = chlor.disabled ? 0 : cstate.setPointForCurrentBody;
                    state.emitEquipmentChanges();
                    break;
                }
                case 19: {
                    // This is an iChlor message with no payload.  Perhaps simply a keep alive for the iChlor.
                    // [16, 2, 80, 19][117, 16, 3]
                    break;
                }
                case 20: {
                    // Get version
                    chlor.type = cstate.type = msg.extractPayloadByte(0);
                    state.emitEquipmentChanges();
                    break;
                }
                case 22: {
                    // temp and output as seen from IntelliConnect.  
                    // Issue #157 - https://github.com/tagyoureit/nodejs-poolController/issues/157
                    // [10 02, 10, 16], [00, 0f, 49, 00,05, 10], [85,  10,03] = hex
                    // [16, 2, 16, 22], [00, 15, 73, 00, 5, 16], [133, 16, 3]
                    // I was at 15% and the temp was 73 F
                    // 0f49 - 15 and 73
                    cstate.currentOutput = msg.extractPayloadByte(1);
                    if (chlor.disabled && cstate.currentOutput !== 0) {
                        // Set it back to disabled.  Some asshole is futzing with the chlorinator output.
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: true });
                    }
                    const tbody: BodyTempState = state.temps.bodies.getBodyIsOn();
                    if (msg.extractPayloadByte(2) >= 40) tbody.temp = msg.extractPayloadByte(2);
                    state.emitEquipmentChanges();
                    break;
                }
            }
        }
        // question: does IntelliCenter ever broadcast Chlorinator packet?  Answer: Never.  My guess is that this is actually 
        // a configuration message rather than a status message.  Also, IntelliCenter has a 204 extension status that contains
        // the current countdown timer for the superChlor in the last 2 bytes.  Perhaps this is the equivalent.
        //else if (msg.protocol === Protocol.Broadcast) {
        //    if (!state.isInitialized) return;
        //    // sample packet
        //    // [165,33,15,16,25,22],[1,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48],[7,231]
        //    let chlorId = 1;
        //    let chlor = sys.chlorinators.getItemById(chlorId, true);
        //    if (chlor.isVirtual) { return; } // shouldn't get here except for testing Chlor on *Touch system.
        //    // installed = (aaaaaaa)1 so 1 = installed
        //    chlor.isActive = (msg.extractPayloadByte(0) & 0x01) === 1;
        //    if (chlor.isActive) {
        //        // RSG : making the assumption here that the chlorinator will be tied to the pool in any system that is not a shared body
        //        sys.equipment.maxBodies >= 1 || sys.equipment.shared === true ? chlor.body = 32 : chlor.body = 0;
        //        // outputSpaPercent field is aaaaaaab (binary) where aaaaaaa = % and b===installed (0=no,1=yes)
        //        // eg. a value of 41 is 00101001
        //        // spa percent = 0010100(b) so 10100 = 20
        //        if (!chlor.disabled) {
        //            // RKS: We don't want these setpoints if our chem controller disabled the
        //            // chlorinator.  These should be 0 anyway.
        //            chlor.spaSetpoint = msg.extractPayloadByte(0) >> 1;
        //            chlor.poolSetpoint = msg.extractPayloadByte(1);
        //        }
        //        chlor.address = chlor.id + 79;
        //        chlor.superChlor = msg.extractPayloadByte(5) > 0;
        //        chlor.superChlorHours = msg.extractPayloadByte(5);
        //        chlor.name = msg.extractPayloadString(6, 16);
        //        let schlor = state.chlorinators.getItemById(chlorId, true);
        //        // The most common failure with IntelliChlor is that the salt level stops reporting.  Below should allow it to be fed from an alternate
        //        // source like REM.
        //        schlor.saltLevel = msg.extractPayloadByte(3) * 50 || schlor.saltLevel || 0;
        //        schlor.status = msg.extractPayloadByte(4) & 0x007F; // Strip off the high bit.  The chlorinator does not actually report this.;
        //        schlor.lastComm = new Date().getTime();  // rely solely on "true" chlor messages for this?
        //        schlor.poolSetpoint = chlor.poolSetpoint;
        //        schlor.spaSetpoint = chlor.spaSetpoint;
        //        schlor.superChlor = chlor.superChlor;
        //        schlor.superChlorHours = chlor.superChlorHours;
        //        schlor.name = chlor.name;
        //        schlor.body = chlor.body;
        //        if (state.temps.bodies.getItemById(1).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.poolSetpoint;
        //        else if (state.temps.bodies.getItemById(2).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.spaSetpoint;
        //        state.emitEquipmentChanges();
        //    }
        //    else {
        //        sys.chlorinators.removeItemById(chlorId);
        //        state.chlorinators.removeItemById(chlorId);
        //    }
        //}
    }
}