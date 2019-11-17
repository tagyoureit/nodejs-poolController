import { Inbound } from "../Messages";
import { sys, ControllerType } from "../../../Equipment";
import {state} from "../../../State";
export class IntellichemMessage {
    public static process(msg: Inbound): void {
        if (sys.controllerType === ControllerType.IntelliCenter)
        switch (msg.extractPayloadByte(1)) {
            case 0:
            case 1:
            case 2:
                break;
        }
        else IntellichemMessage.processTouch(msg);
    }

    private static processTouch(msg: Inbound){
        /*
        //Status 0x12 (18) - Intellichem Status (length 41)
        example:
                            0  1  2  3  4  5  6   7  8   9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25  26 27 28 29  30  31 32 33 34 35 36  37 38 39 40 41 
                            E3 02  AF 02  EE  02  BC 00  00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01 90 00  00 00 96 14  00  51 00 00 65 20 3C  01 00 00 00
        [165,16,15,16,18 41], [2 227  2 175  2   238 2  188 0  0  0  2  0  0  0  42 0  4  0  92 6  5  24 1  144 0  0  0   150 20 0  81 0  0  101 32 60 1  0  0  0]
                            ph--- orp---  ph---- orp---                                      tanks ch----   CYA TA----    Wtr                MODE--
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

        23-24 Chlorine settings
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
        let intellichem = sys.intellichem;
        if (!intellichem.isActive) intellichem.isActive = true;
        let readings = state.intellichem;
        readings.pH = ((msg.extractPayloadByte(0) * 256) + msg.extractPayloadByte(1)) / 100;
        readings.ORP = (msg.extractPayloadByte(2) * 256) + msg.extractPayloadByte(3);
        readings.waterFlow = msg.extractPayloadByte(30);
        readings.salt = (sys.chlorinators.length && sys.chlorinators.getItemById(1).isActive)
         ? state.chlorinators.getItemById(1).saltLevel : 0;
        readings.tank1Level = msg.extractPayloadByte(20);
        readings.tank2Level = msg.extractPayloadByte(21);
        readings.status1 = msg.extractPayloadByte(34);
        readings.status2 = msg.extractPayloadByte(25);
        intellichem.pH = ((msg.extractPayloadByte(4) * 256) + msg.extractPayloadByte(5)) / 100;
        intellichem.ORP = (msg.extractPayloadByte(6) * 256) + msg.extractPayloadByte(7);
        intellichem.CYA = msg.extractPayloadByte(26);
        intellichem.CH = (msg.extractPayloadByte(3) * 256) + msg.extractPayloadByte(4);
        intellichem.TA = (msg.extractPayloadByte(27) * 256) + msg.extractPayloadByte(28);
    }
}