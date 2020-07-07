import { sys, Chlorinator } from "../../../Equipment";
import { Inbound } from "../Messages";
import { state } from "../../../State";
import { logger } from "../../../../logger/Logger"
export class ChlorinatorMessage {
    public static process(msg: Inbound): void {
        var chlorinatorId;
        var chlor: Chlorinator;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                chlorinatorId = 1;
                for (var i = 0; i < sys.equipment.maxChlorinators && i + 30 < msg.payload.length; i++) {
                    chlor = sys.chlorinators.getItemById(chlorinatorId++, msg.extractPayloadByte(i + 22) === 1);
                    chlor.body = msg.extractPayloadByte(i + 2);
                    chlor.type = msg.extractPayloadByte(i + 6);
                    chlor.poolSetpoint = msg.extractPayloadByte(i + 10);
                    chlor.spaSetpoint = msg.extractPayloadByte(i + 14);
                    chlor.superChlor = msg.extractPayloadByte(i + 18) === 1;
                    chlor.isActive = msg.extractPayloadByte(i + 22) === 1;
                    chlor.superChlorHours = msg.extractPayloadByte(i + 26);
                    chlor.address = 80 + i;
                    let schlor = state.chlorinators.getItemById(chlor.id, true);
                    schlor.body = chlor.body;
                    schlor.poolSetpoint = chlor.poolSetpoint;
                    schlor.spaSetpoint = chlor.spaSetpoint;
                    schlor.type = chlor.type;
                    schlor.superChlorHours = chlor.superChlorHours;
                    state.emitEquipmentChanges();
                }
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
}