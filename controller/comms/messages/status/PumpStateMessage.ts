/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { Inbound } from "../Messages";
import { state } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";
export class PumpStateMessage {
    public static process(msg: Inbound) {
        if (sys.controllerType === ControllerType.Unknown) return;

        // We only want to process the messages that are coming from the pump not to the pump.  At some point
        // this filter was removed.  Any messages that are coming from the panel are simply requests to the pump
        // asking for the information we want. We are simply observers of the result information.  If this is standalone
        // then this is still true since the pumps will respond with what we are looking for.
        if (msg.source < 96) return;

        let pumpId = msg.source - 96 + 1;
        let pump = state.pumps.getItemById(pumpId, true);
        let pumpCfg = sys.pumps.getItemById(pumpId);
        let ptype = sys.board.valueMaps.pumpTypes.transform(pumpCfg.type);
        // let pump2 = state.pumps.getPumpByAddress(msg.source, true);
        // let pumpCfg2 = sys.pumps.getPumpByAddress(msg.source);
        switch (msg.action) {
            case 7:
                //[165, 63, 15, 16, 2, 29][11, 47, 32, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 59, 59, 0, 241, 56, 121, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 219]
                //[165, 0, 96, 16, 1, 4][2, 196, 7, 58][2, 33]
                //[165, 0, 16, 96, 7, 15][10, 2, 2, 1, 71, 7, 58, 0, 0, 0, 0, 0, 1, 15, 36][1, 246]
                //[165, 0, 16, 96, 7, 15][10, 2, 2, 2, 139, 9, 146, 0, 0, 0, 0, 0, 1, 17, 59][2, 174]
                pump.command = msg.extractPayloadByte(0);
                pump.mode = msg.extractPayloadByte(1);
                pump.driveState = msg.extractPayloadByte(2);
                pump.watts = (msg.extractPayloadByte(3) * 256) + msg.extractPayloadByte(4);
                pump.rpm = (typeof ptype !== 'undefined' && ptype.maxSpeed > 0) ? (msg.extractPayloadByte(5) * 256) + msg.extractPayloadByte(6) : 0;
                pump.flow = (typeof ptype !== 'undefined' && ptype.maxFlow > 0) ? msg.extractPayloadByte(7) : 0;
                pump.ppc = msg.extractPayloadByte(8);
                pump.status = (msg.extractPayloadByte(11) * 256) + msg.extractPayloadByte(12); // 16-bits of error codes.
                pump.name = pumpCfg.name;
                // Byte 14 ticks up every minute while byte 13 ticks up every 59 minutes.
                pump.time = (msg.extractPayloadByte(13)) * 60 + msg.extractPayloadByte(14);
                pump.type = pumpCfg.type;
                break;
        }
        state.emitEquipmentChanges();
        // if (msg.action !== 7) this.processDirectPumpMessages(msg);
    }

    public static processDirectPumpMessages(msg: Inbound) {

        if (msg.payload.length === 2) {

            console.log(`we received an ack/response from pump ${ msg.source }.  Payload: ${ msg.toShortPacket() }`);
        }
        switch (msg.action) {
            case 1:
            case 9:
            case 10:
                {
                    if (msg.payload.length === 4) {

                        // Response to set speed?
                        // Msg# 2319   Main --> Pump 1: Set Speed to 1500 rpm: [165,0][,96,16,1,4],[2,196,5,220],2,193]
                        // Msg# 158   Main --> Pump 2: Set Speed to 30 rpm:    [165,0][,97,16,1,4],[2,228,0,30],2,31]
                        // theory... if [4]=1 then VS of VF; [4]=9 then VSF receiving GPM;  [4]=10 then VSF receiving RPM

                        // [4]=1
                        //            11000100           11100100
                        //  or maybe    ^                  ^      just the specific bit
                        //  is Rpm/Gpm?

                        // [4]=9 or [4]=10 then payload[1] is always 196

                        // another example -- what is this one?
                        // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,96,16,1,4][3,0,30,0][1,59]],"ts":"2020-04-19T16:26:23.434-0700"}
                        // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,16,96,1,2][30,0][1,54]],"ts":"2020-04-19T16:26:23.435-0700"}

                        var rpmGpm;
                        switch (msg.action) {
                            case 1:
                                rpmGpm = (msg.extractPayloadByte(2) & 32) >> 5 === 0 ? 'RPM' : 'GPM';
                                break;
                            case 9:
                                // VF Pump?
                                rpmGpm = 'GPM';
                                break;
                            case 10:
                                // VSF Pump RPM
                                rpmGpm = 'RPM';
                                break;
                            default:
                                console.log(`whtat's missing`)
                        }
                        let setAmount = 0;
                        if (rpmGpm === 'RPM') {
                            setAmount = msg.extractPayloadByte(2) * 256 + msg.extractPayloadByte(3);
                        }
                        else {
                            setAmount = msg.extractPayloadByte(2);
                        }

                        console.log(`Msg:   ${ msg.source } --> ${ msg.dest }: Set Speed to ${ setAmount } ${ rpmGpm }`);
                    }
                    else {
                        console.log(`Msg: ${ msg.source } --> ${ msg.dest }: Response to Set Speed ${ msg.toShortPacket() }`);
                    }
                    break;
                }

            case 2:
                {
                    console.log(`Direct pump packet with ${ msg.action }: ${ msg.payload }`);
                    break;
                }
            case 4:
                {
                    // Remote control
                    // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,97,16,4,1][255][2,26]],"ts":"2020-04-19T16:26:25.203-0700"}
                    // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,16,97,4,1][255][2,26]],"ts":"2020-04-19T16:26:25.204-0700"}
                    if (msg.dest >= 96) {
                        // to pump
                        const pump = sys.pumps.getItemById(msg.dest - 96 + 1);
                        const isRemoteControl = msg.extractPayloadByte(0) === 255;
                        console.log(`Controller setting pump ${ pump.id } control panel to ${ isRemoteControl ? 'remote contol' : 'local control' }`);
                    }
                    else {
                        // response to controller
                        const pump = sys.pumps.getItemById(msg.source - 96 + 1);
                        const isRemoteControl = msg.extractPayloadByte(0) === 255;
                        console.log(`Pump  ${ pump.id } responding to controller control panel to ${ isRemoteControl ? 'remote contol' : 'local control' }`);
                    }
                    break;
                }
            case 5:
                {
                    // run mode; only for intellicom.  Shouldn't see these;
                    console.log(`Seeing pump run mode packet:  ${ msg.toShortPacket() }`);

                    break;
                }
            case 6:
                {
                    // set Power
                    // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,96,16,6,1][10][1,38]],"ts":"2020-04-19T17:00:32.419-0700"}
                    // info: {"valid":true,"dir":"in","proto":"pump","pkt":[[][255,0,255][165,0,16,96,6,1][10][1,38]],"ts":"2020-04-19T17:00:32.419-0700"}
                    if (msg.dest >= 96) {
                        // to pump
                        const pump = sys.pumps.getItemById(msg.dest - 96 + 1);
                        const powerOn = msg.extractPayloadByte(0) === 10;
                        console.log(`Controller setting pump ${ pump.id } power mode to ${ powerOn ? 'on' : 'off' }`);
                    }
                    else {
                        // response to controller
                        const pump = sys.pumps.getItemById(msg.source - 96 + 1);
                        const powerOn = msg.extractPayloadByte(0) === 10;
                        console.log(`Pump  ${ pump.id } responding to controller power mode to ${ powerOn ? 'on' : 'off' }`);
                    }
                    break;
                }
            case 255:
                {
                    console.log(`Pump rejecting ${msg.toShortPacket()}`);
                    break;
                }
            default:
                {
                    console.log(`missing ${ msg.toShortPacket() }`);
                }

        }
    }
}