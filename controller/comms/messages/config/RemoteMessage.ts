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
import {Inbound} from "../Messages";
import {sys, Remote} from "../../../Equipment";
import {ControllerType} from "../../../Constants";
export class RemoteMessage {
    private static maxCircuits: number=8;
    public static process(msg: Inbound): void {
        if (sys.controllerType === ControllerType.IntelliCenter) {
            /* Types
                    0 = Not installed
                    1 = is4
                    2 = is10
                    3 = QuickTouch (hopefully this isn't otherwise used by IntelliCenter)
                    4 = Spa Command */
            switch (msg.extractPayloadByte(1)) {
                case 0:
                    RemoteMessage.processRemoteType(msg);
                    break;
                case 1:
                    RemoteMessage.processIsActive(msg);
                    break;
                case 2:
                    RemoteMessage.processPumpId(msg);
                    break;
                case 3:
                    RemoteMessage.processAddress(msg);
                    break;
                case 4:
                    RemoteMessage.processBody(msg);
                    break;
                case 5: // Only names & buttons in these.
                case 6:
                case 7:
                case 8:
                    break;
            }
            RemoteMessage.processRemoteName(msg);
        }
        else if (sys.controllerType !== ControllerType.Unknown)
            RemoteMessage.processRemote_IT(msg);

    }
    public static processRemote_IT(msg: Inbound) {
        /*      process Spa-side remotes
                    for is4  [165,33,16,34,33,11],[id,button1,button2,button3,button4,5,6,7,8,9,10],[chkh,chkl]
                    for is10:[165,33,16,34,323,11],[id,button1,button2,button3,button4,btn5,btn1bot,btn2bot,btn3bot,btn4bot,btn5bot],[chkh,chkl]
                    [255, 0, 255], [165, 33, 15, 16, 32, 11], [0, 1, 5, 18, 13, 5, 6, 7, 8, 9, 10], [1, 98]
                    [255, 0, 255], [165, 33, 15, 16, 32, 11], [1, 8, 2, 7, 7, 5, 8, 9, 8, 9, 3], [1, 83]
                    for quicktouch:
                    [255, 0, 255], [165, 33, 15, 16, 33, 4], [12, 7, 14, 5], [1, 48]
                    
                    samples from i10d
                    {"type":"packet","packet":[255,255,255,255,255,255,255,255,0,255,165,1,15,16,32,11,1,0,0,0,0,0,0,0,0,0,0,0,241],"direction":"inbound","level":"info","message":"","timestamp":"2019-10-03T17:00:51.623Z"}
                    {"type":"packet","packet":[255,255,255,255,255,255,255,255,0,255,165,1,15,16,32,11,2,21,22,23,24,25,26,27,28,29,30,1,241],"direction":"inbound","level":"info","message":"","timestamp":"2019-10-03T17:00:51.684Z"}
                    {"type":"packet","packet":[255,255,255,255,255,255,255,255,0,255,165,1,15,16,32,11,3,0,0,0,0,0,0,0,0,0,0,0,243],"direction":"inbound","level":"info","message":"","timestamp":"2019-10-03T17:00:51.763Z"}

                    from IT manual: 
                    Note: For systems with four iS10/SpaCommand remotes, adding one or two iS4 remotes will affect button function assignments as follows: Assigned button functions 1 - 4 on iS4 #1 are linked with the same functions to buttons 1 - 4 (top row) of iS10 #4. Also, buttons 1 - 4 on iS4 #2 are linked to buttons 6 - 10 (bottom row) of iS10 #4. For example, button 6 on the bottom row of iS10 #4 is linked to button 1 of iS4 #2, button 7 on iS10 #4 is linked to button 2 of iS4 #2, etc.

                    Not sure how packets will come through with 6 controllers on it.

                    Fixing ID's for lack of having better info.
                    0-3 = is10
                    4-5 = is4
                    6 = QuickTouch
                    7 = Spa Command (can multiple be present?  are these tied to is10?)
                    */
        switch (msg.action) {
            case 33: // quicktouch
                {
                    const remoteId = 6; // what determines 2nd is4?
                    const remote: Remote = sys.remotes.getItemById(remoteId, true);
                    remote.type = remoteId;
                    remote.button1 = msg.extractPayloadByte(0);
                    remote.button2 = msg.extractPayloadByte(1);
                    remote.button3 = msg.extractPayloadByte(2);
                    remote.button4 = msg.extractPayloadByte(3);
                    if (!remote.button1 && !remote.button2 && !remote.button3 && !remote.button4) remote.isActive = false;
                    else remote.isActive = true;
                    remote.name = "QuickTouch";
                    break;
                }
            case 32: // is4/is10
                {
                    const remoteId = msg.extractPayloadByte(0) + 1;
                    let remote: Remote = sys.remotes.getItemById(remoteId, true);
                    let bActive = false;
                    let bIS10 = false;
                    for (let i = 1; i <= msg.payload.length - 1; i++) {
                        remote["button" + i] = msg.extractPayloadByte(i);
                        bActive = bActive || remote["button" + i] > 0;
                        if (i >= 4 && !bIS10) {
                            bIS10 = bIS10 || remote["button" + i] > 0;
                        }
                    }
                    remote.isActive = bActive;
                    if (bIS10) // is10  
                    {
                        remote.type = 2;
                        remote.name = "is10";
                    }
                    else // is4
                    {
                        
                        remote.type = 1;
                        remote.name = "is4";
                    }
                    break;
                }
            case 22: // Spa Command spa side remote additional config
                {
                    // sample packet from EasyTouch
                    // [165,33,16,34,150,16],[0,1,7,8,0,2,250,10,1,144,13,122,15,130,0,0],[4,93]
                    // note: spa command may be tied to an already present is10.  Need to clarify.
                    const remoteId = 7;
                    const remote: Remote = sys.remotes.getItemById(remoteId, true);
                    remote.pumpId = msg.extractPayloadByte(5);
                    remote.stepSize = msg.extractPayloadByte(6);
                    remote.type = 7;
                    break;
                }
        }
    }
    private static processRemoteType(msg: Inbound) {
        let remoteId = 1;
        for (let i = 28; i < msg.payload.length && remoteId <= sys.equipment.maxRemotes; i++) {
            const remote: Remote = sys.remotes.getItemById(remoteId++, msg.extractPayloadByte(i) !== 0);
            remote.type = msg.extractPayloadByte(i);
            if (remote.isActive && remote.type === 0) sys.remotes.removeItemById(remote.id);
        }
    }
    private static processIsActive(msg: Inbound) {
        let remoteId = 1;
        for (let i = 28; i < msg.payload.length && remoteId <= sys.equipment.maxRemotes; i++) {
            const remote: Remote = sys.remotes.getItemById(remoteId++);
            remote.isActive = msg.extractPayloadByte(i) === 1;
        }
    }
    private static processPumpId(msg: Inbound) {
        let remoteId = 1;
        for (let i = 28; i < msg.payload.length && remoteId <= sys.equipment.maxRemotes; i++) {
            const remote: Remote = sys.remotes.getItemById(remoteId++, false, { isActive: false });
            if (remote.isActive === false) continue;
            remote.pumpId = msg.extractPayloadByte(i);
        }
    }
    private static processAddress(msg: Inbound) {
        let remoteId = 1;
        for (let i = 28; i < msg.payload.length && remoteId <= sys.equipment.maxRemotes; i++) {
            const remote: Remote = sys.remotes.getItemById(remoteId++, false, { isActive: false });
            if (remote.isActive === false) continue;
            remote.address = Math.max(msg.extractPayloadByte(i) - 63, 0);
        }
    }
    private static processBody(msg: Inbound) {
        let remoteId = 1;
        for (let i = 28; i < msg.payload.length && remoteId <= sys.equipment.maxRemotes; i++) {
            const remote: Remote = sys.remotes.getItemById(remoteId++, false, { isActive: false });
            if (remote.isActive === false) continue;
            remote.body = msg.extractPayloadByte(i);
        }
    }
    private static processRemoteName(msg: Inbound) {
        const remoteId = msg.extractPayloadByte(1) + 1;
        const remote: Remote = sys.remotes.getItemById(remoteId, false, { isActive: false });
        remote.name = msg.extractPayloadString(12, 16);
        let type = sys.board.valueMaps.remoteTypes.transform(remote.type);
        for (let i = 0; i < msg.payload.length && i < 10; i++) {
            if (i >= type.maxButtons) {
                remote['button' + (i + 1)] = undefined;
                continue;
            }
            remote["button" + (i + 1)] = msg.extractPayloadByte(i + 2);
        }
    }
}
