import { Inbound, Protocol } from "../Messages";
import { state, BodyTempState } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";

export class ChlorinatorStateMessage {
    public static process(msg: Inbound) {

        if (msg.protocol === Protocol.Chlorinator) {
            if (msg.dest >= 1) {
                let cstate = state.chlorinators.getItemById(msg.dest, true);
                if (typeof cstate.lastComm === 'undefined') cstate.lastComm = new Date(1970, 0, 1, 0, 0, 0, 0).getTime();
                // RG: I was getting some time deltas of 25-30s and bumped this up
                else if (cstate.lastComm + (30 * 1000) < new Date().getTime()) {
                    // We have not talked to the chlorinator in 20 seconds so we have lost communication.
                    cstate.status = 128;
                }
                let chlor = sys.chlorinators.getItemById(msg.dest, true)
                chlor.address = msg.dest + 79;
                chlor.isActive = true;
            }
            else {
                // message to controller
                let cstate = state.chlorinators.getItemById(1, true);
                cstate.lastComm = new Date().getTime();
            }
            // switch (msg.extractPayloadByte(1)) {
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
                    // Response to Get Version (20)
                    //                  I   n    t    e    l    l    i    c   h    l    o    r    -   -   4   0
                    //[16, 2, 0, 3][0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48][188, 16, 3]
                    // This is the model number of the chlorinator and the address is actually the second byte.
                    let cstate = state.chlorinators.getItemById(1, true);
                    let chlor = sys.chlorinators.getItemById(1, true);
                    cstate.name = chlor.name = msg.extractPayloadString(1, 16);
                    break;
                }
                case 17:
                case 21: {
                    // Set Salt Output / 10
                    // This packet is coming through differently on the IntelliConnect.
                    // eg 13:42:31.304 VERBOSE Msg# 1531   Controller --> Salt cell: Set current output to 1.6 %: 16,2,80,21,0,119,16,3
                    let cstate = state.chlorinators.getItemById(1, true);
                    cstate.currentOutput = msg.action === 17 ? msg.extractPayloadByte(0) : msg.extractPayloadByte(0) / 10;
                    cstate.targetOutput = cstate.setPointForCurrentBody;
                    break;
                }
                case 18: {
                    // Response to Set Salt Output (17 & 20)
                    let cstate = state.chlorinators.getItemById(1, true);
                    cstate.saltLevel = msg.extractPayloadByte(0) * 50;
                    cstate.status = (msg.extractPayloadByte(1) & 0x007F); // Strip off the high bit.  The chlorinator does not actually report this. 
                    break;
                }
                case 20: {
                    // Get version
                    let c = sys.chlorinators.getItemById(1, true);
                    let chlor = state.chlorinators.getItemById(1, true);
                    chlor.type = c.type = msg.extractPayloadByte(0);
                    break;
                }
                case 22: {
                    // temp and output as seen from IntelliConnect.  
                    // Issue #157 - https://github.com/tagyoureit/nodejs-poolController/issues/157
                    // [10 02, 10, 16], [00, 0f, 49, 00,05, 10], [85,  10,03] = hex
                    // [16, 2, 16, 22], [00, 15, 73, 00, 5, 16], [133, 16, 3]
                    // I was at 15% and the temp was 73 F
                    // 0f49 - 15 and 73
                    let chlor = state.chlorinators.getItemById(1, true);
                    chlor.currentOutput = msg.extractPayloadByte(1);
                    const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                    tbody.temp = msg.extractPayloadByte(2);
                    break;
                }
            }
            state.emitEquipmentChanges();
        }
        // question: does IntelliCenter ever broadcast Chlorinator packet?  Answer: Never.  My guess is that this is actually 
        // a configuration message rather than a status message.  Also, IntelliCenter has a 204 extension status that contains
        // the current countdown timer for the superChlor in the last 2 bytes.  Perhaps this is the equivalent.
        else if (msg.protocol === Protocol.Broadcast) {
            if (!state.isInitialized) return;
            // sample packet
            // [165,33,15,16,25,22],[1,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48],[7,231]
            let chlorId = 1;
            let chlor = sys.chlorinators.getItemById(chlorId, true);
            // installed = (aaaaaaa)1 so 1 = installed
            chlor.isActive = (msg.extractPayloadByte(0) & 0x01) === 1;
            if (chlor.isActive) {
                // RSG : making the assumption here that the chlorinator will be tied to the pool in any system that is not a shared body
                sys.equipment.maxBodies >= 1 || sys.equipment.shared === true ? chlor.body = 32 : chlor.body = 0;
                // outputSpaPercent field is aaaaaaab (binary) where aaaaaaa = % and b===installed (0=no,1=yes)
                // eg. a value of 41 is 00101001
                // spa percent = 0010100(b) so 10100 = 20
                chlor.spaSetpoint = msg.extractPayloadByte(0) >> 1;
                chlor.poolSetpoint = msg.extractPayloadByte(1);
                chlor.address = chlor.id + 79;
                chlor.superChlor = msg.extractPayloadByte(5) > 0;
                chlor.superChlorHours = msg.extractPayloadByte(5);
                chlor.name = msg.extractPayloadString(6, 16);
                let schlor = state.chlorinators.getItemById(chlorId, true);
                schlor.saltLevel = msg.extractPayloadByte(3) * 50;
                schlor.status = msg.extractPayloadByte(4) & 0x007F; // Strip off the high bit.  The chlorinator does not actually report this.;
                schlor.lastComm = new Date().getTime();  // rely solely on "true" chlor messages for this?
                schlor.poolSetpoint = chlor.poolSetpoint;
                schlor.spaSetpoint = chlor.spaSetpoint;
                schlor.superChlor = chlor.superChlor;
                schlor.superChlorHours = chlor.superChlorHours;
                schlor.name = chlor.name;
                schlor.body = chlor.body;
                if (state.body === 6) schlor.targetOutput = chlor.poolSetpoint;
                else if (state.body === 1) schlor.targetOutput = chlor.spaSetpoint;
            }
            else {
                sys.chlorinators.removeItemById(chlorId);
                state.chlorinators.removeItemById(chlorId);
            }
        }
    }
}