import { Inbound, Outbound } from "../Messages";
import { sys, ControllerType } from "../../../Equipment";
import {state} from "../../../State";
export class IntellichemMessage {
    public static process(msg: Inbound): void {
        if (sys.controllerType === ControllerType.IntelliCenter) {
            switch (msg.action) {
                case 30:
                    IntellichemMessage.processIntelliChemConfig(msg);
                    break;
            }
        }
        else {
            // RKS: Ask Russ what the config message looks like.


        }
    }
    private static processIntelliChemConfig(msg: Inbound) {
        switch (msg.extractPayloadByte(1)) {
            case 0:
                for (let i = 0; i < 4; i++) {
                    let isActive = msg.extractPayloadByte(i + 14) === 1;
                    let controller = sys.chemControllers.getItemById(i + 1, isActive, { id:i + 1, type: 1 });
                    controller.isActive = msg.extractPayloadByte(i + 14) === 1;
                    
                    if (!controller.isActive) {
                        sys.chemControllers.removeItemById(controller.id);
                        state.chemControllers.removeItemById(controller.id);
                    }
                    else {
                        let scontroller = state.chemControllers.getItemById(controller.id, true);
                        scontroller.address = controller.address = msg.extractPayloadByte(i + 10);
                        scontroller.type = controller.type = 1;
                        if (typeof scontroller.name === 'undefined') controller.name = 'IntelliChem ' + (i + 1);
                        scontroller.name = controller.name;
                        controller.cyanuricAcid = msg.extractPayloadInt((i * 2) + 26);
                    }
                }
                break;
            case 1:
                for (let i = 0; i < 4; i++) {
                    let controller = sys.chemControllers.getItemById(i + 1, false);
                    if (controller.isActive) {
                        controller.pHSetpoint = msg.extractPayloadInt((i * 2) + 2) / 100;
                        controller.orpSetpoint = msg.extractPayloadInt((i * 2) + 10);
                        controller.calciumHardness = msg.extractPayloadInt((i * 2) + 18);
                        controller.alkalinity = msg.extractPayloadInt((i * 2) + 26);
                    }
                }
                break;
        }
    }
    // RKS: Moved this to IntelliChemStateMessage.  The only processing in this file should be us capturing configurations from OCP and
    // the IntelliChem controller.
    //private static processTouch(msg: Inbound){}
}