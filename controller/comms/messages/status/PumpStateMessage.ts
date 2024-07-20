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
import { Inbound, Outbound, Protocol } from "../Messages";
import { state } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";
import { conn } from "../../Comms";
import { logger } from "../../../../logger/Logger";

export class PumpStateMessage {
    private static detectPumpType(msg: Inbound) {
        let pumpType = -1;
        switch (msg.action) {
            case 1:
                {
                    let speed = (msg.extractPayloadByte(2) * 256) + msg.extractPayloadByte(3);
                    if (speed > 0) {
                        pumpType = speed < 300 ? sys.board.valueMaps.pumpTypes.getValue('vf') : sys.board.valueMaps.pumpTypes.getValue('vs');
                    }
                }
                break;
            case 9:
            case 10:
                pumpType = sys.board.valueMaps.pumpTypes.getValue('vsf');
                break;
        }
        if (pumpType > 0) {
            let pump = sys.pumps.find(x => x.address === msg.dest);
            if (typeof pump === 'undefined') {
                let id = sys.pumps.filter(elem => elem.master === 0).getMaxId(false, 0) + 1;
                pump = sys.pumps.getItemById(id, true);
                pump.name = `Pump ${msg.dest - 95}`;
                pump.address = msg.dest;
                pump.isActive = true;
                pump.type = pumpType;
                pump.master = 0;
            }
            let spump = state.pumps.getItemById(pump.id, true);
            spump.address = pump.address;
            spump.type = pump.type;
            spump.isActive = pump.isActive;
            spump.name = pump.name;
            spump.type = pump.type;
        }
    }
    public static process(msg: Inbound) {
        if (sys.controllerType === ControllerType.Unknown) return;
        if (msg.dest >= 96 && sys.controllerType === ControllerType.SunTouch) PumpStateMessage.detectPumpType(msg);

        // We only want to process the messages that are coming from the pump not to the pump.  At some point
        // this filter was removed.  Any messages that are coming from the panel are simply requests to the pump
        // asking for the information we want. We are simply observers of the result information.  If this is standalone
        // then this is still true since the pumps will respond with what we are looking for.
        if (msg.source < 96) return;

        // Boo.  The id should not be mapped like this.  We need to find the pump by address.
        let pumpCfg = sys.pumps.getPumpByAddress(msg.source, false, { isActive: false });
        let pumpId = pumpCfg.id;
        let ptype = sys.board.valueMaps.pumpTypes.transform(pumpCfg.type);
        let pump = state.pumps.getItemById(pumpId, pumpCfg.isActive === true);
        switch (msg.action) {
            case 1:
                if (msg.source === 96 && sys.controllerType === ControllerType.EasyTouch) {
                    if (sys.equipment.modules.getItemByIndex(0, false).type >= 128) {
                        // EasyTouch Version 1 controllers do not request the current information about rpms or wattage from the pump.  We need to ask in
                        // its stead.
                        let out = Outbound.create({
                                portId: pumpCfg.portId || 0,
                                protocol: Protocol.Pump,
                                dest: pumpCfg.address,
                                action: 7,
                                payload: [],
                                retries: 1,
                                response: true,
                                onComplete: (err, _) => {
                                    if (err) {
                                        logger.error(`EasyTouch 1 request pump status failed for ${pump.name}: ${err.message}`);
                                    }
                                }
                            });
                        conn.queueSendMessage(out);
                    }
                }
                break;
            case 7:
                //[165, 63, 15, 16, 2, 29][11, 47, 32, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 59, 59, 0, 241, 56, 121, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 219]
                //[165, 0, 96, 16, 1, 4][2, 196, 7, 58][2, 33]
                //[165, 0, 16, 96, 7, 15][10, 2, 2, 1, 71, 7, 58, 0, 0, 0, 0, 0, 1, 15, 36][1, 246]
                //[165, 0, 16, 96, 7, 15][10, 2, 2, 2, 139, 9, 146, 0, 0, 0, 0, 0, 1, 17, 59][2, 174]
                pump.command = msg.extractPayloadByte(0);
                pump.mode = msg.extractPayloadByte(1);
                pump.driveState = msg.extractPayloadByte(2);
                pump.watts = (msg.extractPayloadByte(3) * 256) + msg.extractPayloadByte(4);
                pump.rpm = (typeof ptype !== 'undefined' && (ptype.maxSpeed > 0 || ptype.name === 'vf')) ? (msg.extractPayloadByte(5) * 256) + msg.extractPayloadByte(6) : 0;
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
    public static processHayward(msg: Inbound) {
        switch (msg.action) {
            case 12: // This is a pump status message
                PumpStateMessage.processHaywardStar(msg);
                break;
        }
    }
    public static processHaywardStar(msg: Inbound) {
        //             src   act   dest             
        //[0x10, 0x02, 0x00, 0x0C, 0x00][0x00, 0x62, 0x17, 0x81][0x01, 0x18, 0x10, 0x03]
        //[0x10, 0x02, 0x00, 0x0C, 0x00][0x00, 0x2D, 0x02, 0x36][0x00, 0x83, 0x10, 0x03] -- Response from pump
        let ptype = sys.board.valueMaps.pumpTypes.transformByName('hwvs');
        let address = msg.source + 96;
        //console.log({ src: msg.source, dest: msg.dest, action: msg.action, address: address });

        let pump = sys.pumps.find(elem => elem.address === address && elem.type === 6);
        if (typeof pump !== 'undefined') {
            let pstate = state.pumps.getItemById(pump.id, true);
            // 3450 * .5
            pstate.rpm = Math.round(ptype.maxSpeed * (msg.extractPayloadByte(1) / 100));
            // This is really goofy as the watts are actually the hex string from the two bytes.
            pstate.watts = parseInt(msg.extractPayloadByte(2).toString(16) + msg.extractPayloadByte(3).toString(16), 10);
            pstate.isActive = true;
            pstate.command = (pstate.rpm > 0 || pstate.watts > 0) ? 10 : 0;
            pstate.driveState
            state.emitEquipmentChanges();
        }
    }
    public static processDirectPumpMessages(msg: Inbound) {

        if (msg.payload.length === 2)
            console.log(`we received an ack/response from pump ${ msg.source }.  Payload: ${ msg.toShortPacket() }`);
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
                        const pump = sys.pumps.getPumpByAddress(msg.dest);
                        const isRemoteControl = msg.extractPayloadByte(0) === 255;
                        console.log(`Controller setting pump ${ pump.id } control panel to ${ isRemoteControl ? 'remote contol' : 'local control' }`);
                    }
                    else {
                        // response to controller
                        const pump = sys.pumps.getPumpByAddress(msg.source);
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
                        const pump = sys.pumps.getPumpByAddress(msg.dest);
                        const powerOn = msg.extractPayloadByte(0) === 10;
                        console.log(`Controller setting pump ${ pump.id } power mode to ${ powerOn ? 'on' : 'off' }`);
                    }
                    else {
                        // response to controller
                        const pump = sys.pumps.getPumpByAddress(msg.source);
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