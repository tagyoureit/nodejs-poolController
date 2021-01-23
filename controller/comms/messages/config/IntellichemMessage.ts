/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
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
            // RKS: Ask Russ what the config message looks like for *Touch.


        }
    }
    private static processIntelliChemConfig(msg: Inbound) {
        // Two messages are sent by the OCP for config of IntelliChem for up to 4 total intelliChems.
        switch (msg.extractPayloadByte(1)) {
            case 0:
                for (let i = 0; i < 4; i++) {
                    let isActive = msg.extractPayloadByte(i + 14) === 1;
                    let id = i + 1;
                    if (isActive) {
                        let controller = sys.chemControllers.getItemById(id, isActive, { id: i + 1, type: 1 });
                        let scontroller = state.chemControllers.getItemById(controller.id, isActive);
                        scontroller.isActive = controller.isActive = true;
                        controller.isVirtual = false;
                        if (!controller.isActive) {
                            sys.chemControllers.removeItemById(controller.id);
                            state.chemControllers.removeItemById(controller.id);
                        }
                        else {
                            scontroller.address = controller.address = msg.extractPayloadByte(i + 10);
                            scontroller.type = controller.type = 2;
                            scontroller.body = controller.body = msg.extractPayloadByte(i + 2);
                            if (typeof scontroller.name === 'undefined') controller.name = 'IntelliChem ' + (i + 1);
                            scontroller.name = controller.name;
                            controller.cyanuricAcid = msg.extractPayloadInt((i * 2) + 26);
                            scontroller.ph.tank.capacity = scontroller.orp.tank.capacity = controller.ph.tank.capacity = controller.orp.tank.capacity = 6;
                            scontroller.ph.tank.units = scontroller.orp.tank.units = controller.ph.tank.units = controller.orp.tank.units = '';
                        }
                    }
                    else {
                        sys.chemControllers.removeItemById(id);
                        if (typeof state.chemControllers.find(elem => elem.id === id) !== 'undefined') {
                            let schem = state.chemControllers.getItemById(id);
                            schem.isActive = false; // Allow the system to remove the item.
                            state.chemControllers.removeItemById(id);
                        }
                    }
                }
                break;
            case 1:
                for (let i = 0; i < 4; i++) {
                    let controller = sys.chemControllers.getItemById(i + 1, false);
                    if (controller.isActive) {
                        let scontroller = state.chemControllers.getItemById(i + 1, false);
                        controller.ph.setpoint = scontroller.ph.setpoint = msg.extractPayloadInt((i * 2) + 2) / 100;
                        controller.orp.setpoint = scontroller.orp.setpoint = msg.extractPayloadInt((i * 2) + 10);
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