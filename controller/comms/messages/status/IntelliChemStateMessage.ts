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
import { logger } from "../../../../logger/Logger";
import { webApp } from "../../../../web/Server";
export class IntelliChemStateMessage {
    public static process(msg: Inbound) {
        if (sys.controllerType === ControllerType.Unknown) return;
        if (msg.source < 144 || msg.source > 158) return;
        switch (msg.action) {
            case 19: // OCP is returning the status that ic currently has.
                break;
            case 146: // OCP is telling IntelliChem that it needs to change its settings to...
                break;
            case 210: // OCP is asking IntelliChem controller for it's current status info.
                break;
            case 18: // IntelliChem is sending us it's status.
                IntelliChemStateMessage.processState(msg);
                break;
            case 147: // IntelliChem is telling the controller that it needs to change it's settings to...  Need to change our settings if virtual.
                if (msg.dest < 144 || msg.dest > 158) return;
                IntelliChemStateMessage.processControllerChange(msg);
                break;
            case 211: // IntelliChem is asking OCP for its status.  Need to respond if we are a virtual controller.
                break;
        }
        state.emitEquipmentChanges();
    }
    private static processControllerChange(msg: Inbound) {
        logger.info(`Incoming message from IntelliChem ${msg.toShortPacket()}`);
    }
    private static processState(msg: Inbound) {
        if (msg.source < 144 || msg.source > 158) return;
        /*
        //Status 0x12 (18) - Intellichem Status (length 41)
        example:
                              02 E3 02  AF 02  EE  02  BC 00  00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01 90 00  00 00 96 14  00  51 00 00 65 20 3C  01 00 00 00

                               0   1 2   3 4   5 6   7 8 9 10 11 12 13 14  15 16 17 18 19 20 21  22 23  24 25 26 27  28 29 30  31 32 33  34  35 36  37 38 39 40 
        [165,16,15,16,18 41], [2 227 2 175 2 238 2 188 0 0  0  2  0  0  0  42  0  4  0 92  6  5  24  1 144  0  0  0 150 20  0  81  0  0 101  32 60   1  0  0  0]
                               ph--- orp-- ph--- orp--                                     tanks     CH---    CYA TA---    Wtr          MODE
        0-1 pH(1-2) / ORP(8-9) reading
        02 E3 - pH 2*256 + e3(227) = 739
        02 AF - ORP 2*256 + af(175) = 687

        4-5 pH settings
        D0 = 7.2 (hi/lo bits - 720 = 7.2pH)
        DA = 7.3
        E4 = 7.4
        EE = 7.5
        F8 = 7.6

        6-7 ORP settings
        02 BC = 700 (hi/lo bits)

        20-21 Tank levels; 21 is acid? 22 is chlorine?
        06 and 05

        23-24 Calcimum Hardness
        90 is CH (90 = 400; 8b = 395) hi/lo bits

        26
        00 is CYA (00 = 0; 9 = 9; c9 = 201) (does not appear to have hi/lo - 201 is max

        27-28 - Total Alkalinity
        96 is TA (96 = 150)

        30 - Water Flow Alarm (00 is ok; 01 is no flow)
        00 flow is OK
        01 flow is Alarm on (Water STOPPED)

        // todo: these are probably 2-byte status message but need to confirm
        36 Mode
        0x25 dosing (auto)?
        0x45 dosing acid (manually?)
        0x55 mixing???
        0x65 monitoring
        0x02 (12 when mixing) and 04 (27 when mixing) related???

        37
        20 Nothing
        22 Dosing Chlorine(?)
        */
        let address = msg.source;
        // The address is king here.  The id is not.
        let controller = sys.chemControllers.getItemByAddress(address, true);
        let scontroller = state.chemControllers.getItemById(controller.id, true);
        scontroller.lastComm = new Date().getTime();
        scontroller.address = controller.address;
        scontroller.pHLevel = msg.extractPayloadIntBE(0) / 100;
        scontroller.orpLevel = msg.extractPayloadIntBE(2);
        controller.pHSetpoint = msg.extractPayloadIntBE(4) / 100;
        controller.orpSetpoint = msg.extractPayloadIntBE(6);
        scontroller.type = controller.type = sys.board.valueMaps.chemControllerTypes.getValue('intellichem');

        // These are a guess as the byte mapping is not yet complete.
        scontroller.pHDosingTime = (msg.extractPayloadByte(9) * 60) + msg.extractPayloadByte(11);
        scontroller.orpDosingTime = (msg.extractPayloadByte(13) * 60) + msg.extractPayloadByte(15);

        // Missing information on the related bytes.
        // Bytes 8-14 (Probably Total Dissolved Solids in here if no IntelliChlor)
        // controller.waterVolume = msg.extractPayloadByte(15) * 1000;
        // Bytes 16-19
        scontroller.acidTankLevel = msg.extractPayloadByte(20);
        scontroller.orpTankLevel = msg.extractPayloadByte(21);
        controller.calciumHardness = msg.extractPayloadIntBE(23);
        scontroller.status2 = msg.extractPayloadByte(25);
        controller.cyanuricAcid = msg.extractPayloadByte(26);
        controller.alkalinity = msg.extractPayloadIntBE(27);
        // Byte 29
        scontroller.waterFlow = msg.extractPayloadByte(30); // This is probably the temp units.
        scontroller.tempUnits = 0;//msg.extractPayloadByte(30);  See Above.  This is probably the units.
        scontroller.temp = msg.extractPayloadByte(31);

        scontroller.status1 = msg.extractPayloadByte(34);

        // RKS: This should really match against the body for the chlorinator when *Chem thinks it has been provided TDS.
        if (sys.chlorinators.length > 0) {
            let chlor = state.chlorinators.find(elem => elem.id === 1);
            scontroller.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(29) * 50;
        }
        else scontroller.saltLevel = 0;
        
        // manually emit extended values
        webApp.emitToClients('chemController', scontroller.getExtended()); // emit extended data
        scontroller.hasChanged = false; // try to avoid duplicate emits
    }
}