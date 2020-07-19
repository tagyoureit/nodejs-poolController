import { sys, Chlorinator } from "../../../Equipment";
import { Inbound } from "../Messages";
import { state } from "../../../State";
import { logger } from "../../../../logger/Logger"
export class ChlorinatorMessage {
    public static process(msg: Inbound): void {
        var chlorId;
        var chlor: Chlorinator;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                chlorId = 1;
                for (let i = 0; i < 4 && i + 30 < msg.payload.length; i++) {
                    let isActive = msg.extractPayloadByte(i + 22) === 1;
                    if (i >= sys.equipment.maxChlorinators || !isActive) {
                        sys.chlorinators.removeItemById(chlorId);
                        state.chlorinators.removeItemById(chlorId);
                    }
                    else {
                        chlor = sys.chlorinators.getItemById(chlorId, isActive);
                        chlor.body = msg.extractPayloadByte(i + 2);
                        chlor.type = msg.extractPayloadByte(i + 6);
                        chlor.poolSetpoint = msg.extractPayloadByte(i + 10);
                        chlor.spaSetpoint = msg.extractPayloadByte(i + 14);
                        chlor.superChlor = msg.extractPayloadByte(i + 18) === 1;
                        chlor.isActive = msg.extractPayloadByte(i + 22) === 1;
                        chlor.superChlorHours = msg.extractPayloadByte(i + 26);
                        chlor.address = 80 + i;
                        let schlor = state.chlorinators.getItemById(chlor.id, isActive);
                        schlor.body = chlor.body;
                        schlor.poolSetpoint = chlor.poolSetpoint;
                        schlor.spaSetpoint = chlor.spaSetpoint;
                        schlor.type = chlor.type;
                        schlor.superChlorHours = chlor.superChlorHours;
                        state.emitEquipmentChanges();
                    }
                    chlorId++;
                }
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
}