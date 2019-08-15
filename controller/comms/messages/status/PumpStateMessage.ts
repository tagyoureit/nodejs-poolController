import { Inbound } from "../Messages";
import { state } from "../../../State";
import { sys } from"../../../Equipment";

export class PumpStateMessage {
    public static process(msg: Inbound) {
        let pumpId = msg.source - 96 + 1;
        let pump = state.pumps.getItemById(pumpId, true);
        let pumpCfg = sys.pumps.getItemById(pumpId);
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
                pump.rpm = (msg.extractPayloadByte(5) * 256) + msg.extractPayloadByte(6);
                pump.flow = msg.extractPayloadByte(7);
                pump.ppc = msg.extractPayloadByte(8);
                pump.status = (msg.extractPayloadByte(11) * 256) + msg.extractPayloadByte(12); // 16-bits of error codes.
                pump.name = pumpCfg.name;
                // Byte 14 ticks up every minute while byte 13 ticks up every 59 minutes.
                pump.runTime = (msg.extractPayloadByte(13)) * 60 + msg.extractPayloadByte(14);
                pump.type = pumpCfg.type;
                pump.emitEquipmentChange();
                break;
        }
    }
}