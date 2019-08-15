import { Inbound } from "../Messages";
import { sys, Heater } from"../../../Equipment";
export class HeaterMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0: // Heater Type
                HeaterMessage.processHeaterTypes(msg);
                break;
            case 1:
                HeaterMessage.processMaxBoostTemp(msg);
                break;
            case 2:
                HeaterMessage.processStartStopDelta(msg);
                break;
            case 3:
                HeaterMessage.processCoolingSetTemp(msg);
                break;
            case 4:
                HeaterMessage.processAddrEffMode(msg);
                break;
            case 5:
            case 6:
            case 7:
            case 8:
            case 9:
            case 10:
            case 11:
            case 12:
                HeaterMessage.processHeaterNames(msg);
                break;
        }
    }
    private static processHeaterTypes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i, msg.extractPayloadByte(i + 1) > 0);
            heater.type = msg.extractPayloadByte(i + 1);
            if (heater.isActive && heater.type !== 0) sys.heaters.removeItemById(i);
            heater.isActive = heater.type > 0;
            heater.body = msg.extractPayloadByte(i + 17);
        }
    }
    private static processMaxBoostTemp(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.maxBoostTemp = msg.extractPayloadByte(i + 1);
        }
    }
    private static processStartStopDelta(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.startTempDelta = msg.extractPayloadByte(i + 1);
            heater.stopTempDelta = msg.extractPayloadByte(i + 18);
        }
    }
    private static processCoolingSetTemp(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.cooling = msg.extractPayloadByte(i + 1) > 0;
            heater.setTemp = msg.extractPayloadByte(i + 18);
        }
    }
    private static processAddrEffMode(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.address = msg.extractPayloadByte(i + 1);
            heater.efficiencyMode = msg.extractPayloadByte(i + 18);
        }
    }
    private static processHeaterNames(msg: Inbound) {
        var heaterId = ((msg.extractPayloadByte(1) - 5) * 2) + 1;
        if (heaterId <= sys.equipment.maxHeaters) sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(2, 16);
        if (heaterId <= sys.equipment.maxHeaters) sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(18, 16);
    }
}