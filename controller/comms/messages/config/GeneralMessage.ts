import { Inbound } from "../Messages";
import { sys, General } from"../../../Equipment";
export class GeneralMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0:
                sys.general.alias = msg.extractPayloadString(2, 16);
                sys.general.owner.name = msg.extractPayloadString(18, 16);
                sys.general.location.zip = msg.extractPayloadString(34, 6);
                break;
            case 1:
                sys.general.owner.phone = msg.extractPayloadString(2, 20);
                sys.general.owner.phone2 = msg.extractPayloadString(21, 15);
                break;
            case 2:
                sys.general.location.address = msg.extractPayloadString(2, 32);
                break;
            case 3:
                sys.general.owner.email = msg.extractPayloadString(2, 32);
                break;
            case 4:
                sys.general.owner.email2 = msg.extractPayloadString(2, 32);
                break;
            case 5:
                sys.general.location.country = msg.extractPayloadString(2, 32);
                break;
            case 6:
                sys.general.location.city = msg.extractPayloadString(2, 32);
                break;
            case 7:
                sys.general.location.state = msg.extractPayloadString(2, 32);
                break;
        }
    }
}