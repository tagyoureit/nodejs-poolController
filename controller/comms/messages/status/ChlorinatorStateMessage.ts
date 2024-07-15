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
import { state, BodyTempState, ChlorinatorState } from "../../../State";
import { sys, ControllerType, Chlorinator } from "../../../Equipment";

export class ChlorinatorStateMessage {
    public static process(msg: Inbound) {
        if (msg.protocol === Protocol.Chlorinator) {
            // RKS: 03-29-22 A lot of water has gone under the bridge at this point and we know much more.  First there are two types of messages.  Those inbound
            // messages that are being sent to the chlorinator as commands and responses from the chlorinator.  We have also determined that the chlorinator does
            // not actually support a RS485 address.  So njsPC can declare as many ports as required to communicate with multiple chlorinators.
            //
            // So instead of matching the chlorinator up with a specific id we need to match on the port as well for the inbound message.  OCPs always operate on
            // portId = 0.  If the portId is > 0 then it is considered an Aux port.  At this point you can only control 1 chlorinator per port so in order to
            // control more than one chlorinator there needs to be only one chlorinator on each port.            
            let chlor: Chlorinator = sys.chlorinators.findItemByPortId(msg.portId || 0);
            if (typeof chlor === 'undefined' || chlor.isActive === false) return; // Bail out of here if we don't find an active chlorinator.
            let cstate: ChlorinatorState = state.chlorinators.getItemById(chlor.id, true);
            if (msg.dest >= 80 && msg.dest <= 83) {
                // RKS: This message is from the OCP to the chlorinator.  NOTE: We will not see these messages when the communication is coming from njsPC on any
                // comms port.  The processing for no comms is done in the Nixe control when the message is sent.
                if (typeof cstate.lastComm === 'undefined') cstate.lastComm = new Date(1970, 0, 1, 0, 0, 0, 0).getTime();
                // RG: I was getting some time deltas of 25-30s and bumped this up
                else if (cstate.lastComm + (30 * 1000) < new Date().getTime()) {
                    // We have not talked to the chlorinator in 30 seconds so we have lost communication.
                    cstate.status = 128;
                }
                // chlor = sys.chlorinators.getItemById(msg.dest - 79, true); chlor is retrieved above; don't get in incorrectly here.
                chlor.address = msg.dest; // Theoretically, this will always be 80.
                if (typeof chlor.isActive === 'undefined') cstate.isActive = chlor.isActive = true;
            }
            else {
                // Response message from chlorinator.  If the chlorinator is speaking to us then we need to hear it and clear the status when
                // the previous status was no comms.
                cstate.lastComm = new Date().getTime();
                if (cstate.status === 128) cstate.status = 0;
            }
            cstate.body = chlor.body;
            switch (msg.action) {
                case 0: // Set control OCP->Chlorinator: [16,2,80,0][0][98,16,3]
                    break;
                case 1: // Ack control Chlorinator->OCP response: [16,2,0,1][0,0][19,16,3]
                    // let chlor = sys.chlorinators.getItemById(1, true);
                    // chlor.isActive = true;
                    break;
                case 3: // Chlorinator->OCP response for Get Model: [16,2,0,3][0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48][188,16,3]
                    // RKS: 07-16-20 -- It appears that this message doesn't always come.  It is very likely that the newer versions of IntelliChlor
                    // do not respond to the 20 message.  There have been multiple instances of this with recent versions of IntelliChlor. As a result,
                    // don't overwrite the name should the user set it.
                    // Response to Get Version (20)
                    //                  I   n    t    e    l    l    i    c   h    l    o    r    -   -   4   0
                    //[16, 2, 0, 3][0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48][188, 16, 3]
                    // This is the model number of the chlorinator and the address is actually the second byte.
                    let name = msg.extractPayloadString(1, 16).trimEnd();
                    if (typeof chlor.name === 'undefined' || chlor.name === '') chlor.name = cstate.name = name;
                    if (typeof chlor.model === 'undefined' || chlor.model === 0) {
                        chlor.model = sys.board.valueMaps.chlorinatorModel.getValue(name.toLowerCase());
                        // With iChlor it does not report the model.
                        if (typeof chlor.model === 'undefined') {
                            if (name.startsWith('iChlor')) chlor.model = sys.board.valueMaps.chlorinatorModel.getValue('ichlor-ic30');
                        }
                    }
                    cstate.isActive = chlor.isActive;
                    state.emitEquipmentChanges();
                    break;
                case 17: // OCP->Chlorinator set output. [16,2,80,17][15][130,16,3]
                    // If the chlorinator is no longer talking to us then clear the current output.
                    if (cstate.status === 128) cstate.currentOutput = 0;
                    cstate.targetOutput = msg.extractPayloadByte(0);
                    if (chlor.disabled && (cstate.targetOutput !== 0 || cstate.superChlor || cstate.superChlorHours > 0)) {
                        // Some dumbass is trying to change our output.  We need to set it back to 0.
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: chlor.disabled, superChlor: false, superChlorHours: 0 });
                    }
                    else if (chlor.isDosing && cstate.targetOutput !== 100) {
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, isDosing: chlor.isDosing });
                    }
                    state.emitEquipmentChanges();
                    break;
                case 21: // Set output OCP->Chlorinator [16,2,80,21][0][119,16,3]
                    // RKS: 03-29-22 There is something absolutley wrong about the understanding of this message.  It has to do with the fact that you could never set
                    // the output percentage to anything greater than 25.6% if this were the case.  I assume this has something to do with the
                    // way IntelliChlor works.  Values between 0 and 20% can be fractional.  In this case the OCP would send a 21 instead of a 17 with
                    // the fractional value.  Anything above that value will be sent in a 17 message.
                    // Set Cell Output / 10
                    // This packet is coming through differently on the IntelliConnect.
                    // eg 13:42:31.304 VERBOSE Msg# 1531   Controller --> Salt cell: Set current output to 1.6 %: 16,2,80,21,0,119,16,3
                    // The current output here is not correct.  The reason that is is because this is a request from the OCP to the Chlorinator.
                    //cstate.currentOutput = msg.action === 17 ? msg.extractPayloadByte(0) : msg.extractPayloadByte(0) / 10;
                    cstate.targetOutput = msg.extractPayloadByte(0) / 10;
                    if (chlor.disabled && (cstate.targetOutput !== 0 || cstate.superChlor || cstate.superChlorHours > 0)) {
                        // Some dumbass is trying to change our output.  We need to set it back to 0.
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, disabled: chlor.disabled, superChlor: false, superChlorHours: 0 });
                    }
                    else if (chlor.isDosing && cstate.targetOutput !== 100) {
                        sys.board.chlorinator.setChlorAsync({ id: chlor.id, isDosing: chlor.isDosing });
                    }
                    state.emitEquipmentChanges();
                    break;
                case 18:
                    // Response to Set Salt Output (17 & 20)
                    // The most common failure with IntelliChlor is that the salt level stops reporting.  Below should allow it to be fed from an alternate
                    // source like REM.
                    if (!chlor.ignoreSaltReading) cstate.saltLevel = msg.extractPayloadByte(0) * 50 || cstate.saltLevel || 0;
                    cstate.status = (msg.extractPayloadByte(1) & 0x007F); // Strip off the high bit.  The chlorinator does not actually report this. 
                    cstate.currentOutput = chlor.disabled ? 0 : cstate.setPointForCurrentBody;
                    state.emitEquipmentChanges();
                    break;
                case 19:
                    // This is an iChlor message with no payload.  Perhaps simply a keep alive for the iChlor.
                    // [16, 2, 80, 19][117, 16, 3]
                    break;
                case 20:
                    // OCP->Chlorinator Get model [16,2,80,20][0][118,16,3]
                    if (typeof chlor.type === 'undefined') chlor.type = msg.extractPayloadByte(0);
                    cstate.type = chlor.type;
                    state.emitEquipmentChanges();
                    break;
                case 22: // Chlorinator->OCP this is actually an iChlor message and has no bearing on IntelliConnect.
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
                    if (sys.controllerType === ControllerType.Nixie) {
                        // This lets the current body use the iChlor temp probe 
                        let tbody: BodyTempState = sys.pumps.length > 0 ? state.temps.bodies.getBodyIsOn() : state.temps.bodies.getItemById(1, true);
                        if (msg.extractPayloadByte(2) >= 40 && typeof tbody !== 'undefined') tbody.temp = msg.extractPayloadByte(2);
                    }
                    state.emitEquipmentChanges();
                    break;
            }
        }
    }
}