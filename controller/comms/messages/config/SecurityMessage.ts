import { Inbound } from "../Messages";
import { sys, SecurityRole } from "../../../Equipment";

export class SecurityMessage {
    public static process(msg: Inbound): void {
        var role: SecurityRole;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                sys.security.enabled = (msg.extractPayloadByte(3) & 1) === 1;
                sys.security.roles.clear();
                break;
        }
        if ((msg.extractPayloadByte(3) & 2) === 2) {
            role = sys.security.roles.getItemById(msg.extractPayloadByte(1) + 1, true);
            role.name = msg.extractPayloadString(4, 16);
            role.timeout = msg.extractPayloadByte(20);
            role.flag1 = msg.extractPayloadByte(2);
            role.flag2 = msg.extractPayloadByte(3);
            role.pin = msg.extractPayloadByte(21).toString() + msg.extractPayloadByte(22).toString() + msg.extractPayloadByte(23).toString() + msg.extractPayloadByte(24).toString();
        }
    }
}