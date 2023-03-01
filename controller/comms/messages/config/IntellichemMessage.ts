/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { state } from "../../../State";
import { webApp } from "../../../../web/Server";

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
            switch (msg.action) {
                case 147:
                    IntellichemMessage.processTouch(msg);
                    break;
            }

        }
    }
    // When IntelliChem is attached to a Touch controller the OCP emits a 147 message that is separate from the normal
    // 18 message coming directly from the controller.  We process this message but it should alway jive with the 18 message
    // that is processed in IntelliChemState message.  The only difference here is that byte 0 is appended to the front.  We have
    // only witnessed this byte as 0 but this HAS to be the address offset byte for the controller.
    private static processTouch(msg: Inbound) {
        // RKS: This is actually the inbound message for the IntelliChem Installation
        //[165, 1, 15, 16, 147, 42][0, 2, 238, 2, 193, 2, 248, 2, 188, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 35, 3, 3, 157, 0, 25, 0, 0, 0, 90, 20, 0, 85, 0, 0, 165, 0, 60, 1, 1, 0, 0][7, 130]
        //[165, 0, 16, 144, 18, 41][   2, 238, 2, 193, 2, 248, 2, 188, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 35, 3, 3, 157, 0, 25, 0, 0, 0, 90, 20, 0, 85, 0, 0, 165, 0, 60, 1, 1, 0, 0][7, 128]
        //let isActive = msg.extractPayloadByte(0);
        // RKS: Apparently this message is only sent when the IntelliChem is actually installed so it will always be active?
        let addr = msg.extractPayloadByte(0) + 144;
        let isActive = addr < 160;
        if (isActive) {
            let chem = sys.chemControllers.getItemByAddress(addr, true);
            let schem = state.chemControllers.getItemById(chem.id, true);
            schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.getValue('intellichem');

            chem.isActive = schem.isActive = true;
            schem.ph.probe.level = ((msg.extractPayloadByte(1) * 256) + msg.extractPayloadByte(2)) / 100;
            schem.orp.probe.level = (msg.extractPayloadByte(3) * 256) + msg.extractPayloadByte(4);
            chem.ph.setpoint = schem.ph.setpoint = ((msg.extractPayloadByte(5) * 256) + msg.extractPayloadByte(6)) / 100;
            chem.orp.setpoint = schem.orp.setpoint = (msg.extractPayloadByte(7) * 256) + msg.extractPayloadByte(8);
            chem.ph.maxDosingTime = (msg.extractPayloadByte(12) * 256) + msg.extractPayloadByte(13);
            chem.orp.maxDosingTime = (msg.extractPayloadByte(15) * 256) + msg.extractPayloadByte(16);
            chem.ph.maxDosingVolume = (msg.extractPayloadByte(17) * 256) + msg.extractPayloadByte(18);
            chem.orp.maxDosingVolume = (msg.extractPayloadByte(19) * 256) + msg.extractPayloadByte(20);
            chem.ph.tank.capacity = 6;
            schem.ph.tank.level = Math.max(msg.extractPayloadByte(21) - 1, 0);
            schem.orp.tank.level = Math.max(msg.extractPayloadByte(22) - 1, 0);
            chem.ph.enabled = (msg.extractPayloadByte(21) > 0);
            chem.orp.enabled = (msg.extractPayloadByte(22) > 0);
            let lsi = msg.extractPayloadByte(23);
            schem.saturationIndex = (lsi & 0x80) === 0x80 ? (256 - lsi) / -100 : lsi / 100;
            chem.calciumHardness = (msg.extractPayloadByte(24) * 256) + msg.extractPayloadByte(25);
            chem.cyanuricAcid = msg.extractPayloadByte(27);
            chem.alkalinity = (msg.extractPayloadByte(28) * 256) + msg.extractPayloadByte(29);
            if (sys.chlorinators.length > 0) {
                let chlor = state.chlorinators.find(elem => elem.id === 1);
                schem.orp.probe.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(30) * 50;
            }
            else schem.orp.probe.saltLevel = 0;
            schem.ph.probe.temperature = msg.extractPayloadByte(32);
            schem.ph.probe.tempUnits = state.temps.units;
            let alarms = schem.alarms;
            let byte = msg.extractPayloadByte(33);
            alarms.flow = byte & 0x01;
            alarms.pH = byte & 0x06;
            alarms.orp = byte & 0x18;
            alarms.pHTank = byte & 0x20;
            alarms.orpTank = byte & 0x40;
            alarms.probeFault = byte & 0x80;
            let warnings = schem.warnings;
            byte = msg.extractPayloadByte(34);
            warnings.pHLockout = byte & 0x01;
            warnings.pHDailyLimitReached = byte & 0x02;
            warnings.orpDailyLimitReached = byte & 0x04;
            warnings.invalidSetup = byte & 0x08;
            warnings.chlorinatorCommError = byte & 0x10;

            schem.ph.dosingStatus = (msg.extractPayloadByte(35) & 0x30) >> 4; // mask 00xx0000 and shift bit 5 & 6
            schem.orp.dosingStatus = (msg.extractPayloadByte(35) & 0xC0) >> 6; // mask xx000000 and shift bit 7 & 8
            schem.status = msg.extractPayloadByte(36) & 0x80 >> 7; // to be verified as comms lost
            schem.ph.manualDosing = (msg.extractPayloadByte(36) & 0x08) === 1 ? true : false;
            chem.orp.useChlorinator = (msg.extractPayloadByte(36) & 0x10) === 1 ? true : false;
            chem.HMIAdvancedDisplay = (msg.extractPayloadByte(36) & 0x20) === 1 ? true : false;
            chem.ph.phSupply = (msg.extractPayloadByte(36) & 0x40) === 1 ? true : false; // acid pH dosing = 1; base pH dosing = 0;
            chem.firmware = `${msg.extractPayloadByte(38)}.${msg.extractPayloadByte(37).toString().padStart(3, '0')}`
            schem.warnings.waterChemistry = msg.extractPayloadByte(39);
            schem.lastComm = new Date().getTime();
            if(typeof chem.body === 'undefined') chem.body = schem.body = 0;
            schem.name = chem.name || 'IntelliChem';
            schem.ph.pump.isDosing = schem.ph.dosingStatus === 0 && chem.ph.enabled;
            schem.orp.pump.isDosing = schem.orp.dosingStatus === 0 && chem.orp.enabled;
            // manually emit extended values
            webApp.emitToClients('chemController', schem.getExtended()); // emit extended data
            schem.hasChanged = false; // try to avoid duplicate emits
        }
        else {
            sys.chemControllers.removeItemById(1);
            let schem = state.chemControllers.getItemById(1);
            if (schem.isActive) {
                schem.isActive = false;
                webApp.emitToClients('chemController', schem.getExtended()); // emit extended data
                schem.hasChanged = false; // try to avoid duplicate emits
            }
            state.chemControllers.removeItemById(1);
        }
        msg.isProcessed = true;
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
                        // controller.isVirtual = false;
                        controller.master = 0;
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
                msg.isProcessed = true;
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
                msg.isProcessed = true;
                break;
        }
    }
    // RKS: Moved this to IntelliChemStateMessage.  The only processing in this file should be us capturing configurations from OCP and
    // the IntelliChem controller.
    //private static processTouch(msg: Inbound){}
}