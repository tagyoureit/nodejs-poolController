import { Inbound } from "../Messages";
import { sys } from"../../../Equipment";
export class IntellichemMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0:
            case 1:
            case 2:
                break;
        }
    }
}