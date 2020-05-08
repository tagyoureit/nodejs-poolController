import {Inbound} from "../Messages";
import {sys, Heater} from "../../../Equipment";
import {ControllerType} from "../../../Constants";
import {BoardCommands} from "controller/boards/SystemBoard";
export class HeaterMessage {
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
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
                        HeaterMessage.processAddress(msg);
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
                    case 13:
                        HeaterMessage.processEfficiencyMode(msg);
                        break;
                }
                break;
            case ControllerType.IntelliTouch:
            case ControllerType.EasyTouch:
                HeaterMessage.processIntelliTouch(msg);
        }
    }
    private static processIntelliTouch(msg: Inbound) {
        // *Touch assumes gas heater assumed on Pool (or shared) body
        // Gas heater setup in EquipmentStateMessage upon *Touch discovery
        switch (msg.action) {
            // 1 = gas heater, 2 = solar, 3 = heat pump
            case 34:
            case 162:
                // byte 0
                // 21 = solar or heat pump disabled
                // 23 = solar or heat pump enabled
                // probably a mask here, but not sure of the other values

                // byte 1
                // bit 1 = heating
                // bit 2 = cooling
                // bit 8 (128) = freeze prot 

                // byte 2
                // bit 1 ?
                // bits 2,3,4 = start temp delta
                // bits 5, 6 = on/on (48) = heat pump
                //             on/off (16) = solar as a heat pump
                // bits 7,8 = stop temp delta

                if (msg.extractPayloadByte(0) === 21) {
                    let solar: Heater = sys.heaters.getItemById(2);
                    solar.isActive = false;
                    sys.board.equipmentIds.invalidIds.remove(20); // include Aux Extra
                    let heatPump: Heater = sys.heaters.getItemById(3);
                    heatPump.isActive = false;
                    return;
                }
                if ((msg.extractPayloadByte(2) & 0x30) === 0) {
                    // solar
                    let solar: Heater = sys.heaters.getItemById(2, true);
                    solar.name = 'Solar Heater';
                    solar.type = 2;
                    solar.isActive = true;
                    sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
                    sys.board.circuits.deleteCircuit(20); 
                    solar.body = 32;
                    solar.freeze = (msg.extractPayloadByte(1) & 0x80) >> 7 === 1; 
                    solar.coolingEnabled = (msg.extractPayloadByte(1) & 0x20) >> 5 === 1; 
                    solar.startTempDelta = ((msg.extractPayloadByte(2) & 0xE) >> 1) + 3;
                    solar.stopTempDelta = ((msg.extractPayloadByte(2) & 0xC0) >> 6) + 2;
                    let heatPump = sys.heaters.getItemById(3);
                    heatPump.isActive = false;
                }
                else if ((msg.extractPayloadByte(2) & 0x10) === 16) {
                    let heatPump: Heater = sys.heaters.getItemById(3, true);
                    heatPump.type = 3;
                    heatPump.isActive = true;
                    heatPump.heatingEnabled = (msg.extractPayloadByte(1) & 0x1) === 1;
                    heatPump.coolingEnabled = (msg.extractPayloadByte(1) & 0x2) >> 1 === 1 || ((msg.extractPayloadByte(2) & 0x10) === 16);
                    let solar = sys.heaters.getItemById(2);
                    solar.isActive = false;
                    sys.board.equipmentIds.invalidIds.remove(20); // include Aux Extra
                }
                for (var i = 0; i <= sys.heaters.length; i++){
                    let heater = sys.heaters.getItemByIndex(i);
                    if (!heater.isActive){sys.heaters.removeItemByIndex(i);}
                }

                break;
            case 114:
                // something to do with heat pumps... need equipment or other packets to decipher
                // [ 255, 0, 255], [165, 0, 112, 16, 114, 10], [144, 2, 0, 0, 0, 0, 0, 0, 0, 0], [2, 51 ]heat + cool
                // [165,0,112,16,114,10][144,0,0,0,0,0,0,0,0,0][2,49] == no Heater, no cool
                // [165,0,112,16,114,10][144,2,0,0,0,0,0,0,0,0][2,51] == no heat, cooling
                // this might be heatStatus not heatMode?
                break;
        }
    }
    private static processHeaterTypes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i, msg.extractPayloadByte(i + 1) > 0);
            heater.type = msg.extractPayloadByte(i + 1);
            if (heater.type === 0) sys.heaters.removeItemById(i);
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
            heater.coolingEnabled = msg.extractPayloadByte(i + 1) > 0;
            heater.differentialTemp = msg.extractPayloadByte(i + 18);
        }
    }
    private static processAddress(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.address = msg.extractPayloadByte(i + 1);
        }
    }
    private static processEfficiencyMode(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.efficiencyMode = msg.extractPayloadByte(i + 1);
        }
    }

    private static processHeaterNames(msg: Inbound) {
        var heaterId = ((msg.extractPayloadByte(1) - 5) * 2) + 1;
        if (heaterId <= sys.equipment.maxHeaters) sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(2, 16);
        if (heaterId <= sys.equipment.maxHeaters) sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(18, 16);
    }
}