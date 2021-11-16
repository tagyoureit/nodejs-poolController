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
import { Inbound } from "../Messages";
import { sys, Heater } from "../../../Equipment";
import { ControllerType } from "../../../Constants";
import { logger } from "../../../../logger/Logger";
import { state } from "../../../State";
import { ncp } from "../../../nixie/Nixie";
export class HeaterMessage {
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                switch (msg.extractPayloadByte(1)) {
                    case 0: // Heater Type
                        HeaterMessage.processHeaterTypes(msg);
                        break;
                    case 1:
                        HeaterMessage.processCooldownDelay(msg);
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
                    case 14:
                        HeaterMessage.processMaxBoostTemp(msg);
                        break;
                    default:
                        logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
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
                // #179 - seeing a value of 5; RSG always has a value of 21.  
                // 5 = 00101; 21 = 10101.
                // 23 (no solar) = 10111.  
                // 10 (2) seems to be the mask.  See issue.

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

                // gas heater only; solar/heatpump/ultratemp disabled
                if ((msg.extractPayloadByte(0) & 0x2) === 0) {
                    let heater = sys.heaters.getItemById(1);
                    if (heater.master === 1) {
                        heater.master = 0;
                        (async function () {
                            try {
                                await ncp.heaters.deleteHeaterAsync(1);
                                logger.debug(`Gas heater control returned to OCP.`);
                            }
                            catch (err) { logger.error(`Error with OCP reclaiming control over gas heater: ${err}`) }
                        })();
                    }
                    heater.master = 0;
                    sys.heaters.getItemById(2).isActive = false;
                    sys.heaters.getItemById(3).isActive = false;
                    sys.heaters.getItemById(4).isActive = false;
                    sys.board.equipmentIds.invalidIds.remove(20); // include Aux Extra
/*                     sys.equipment.setEquipmentIds();
                    for (let i = 0; i < sys.bodies.length; i++) {
                        let body = sys.bodies.getItemByIndex(i);
                        let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
                        let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
                        btemp.heaterOptions = opts;
                    }
                    return; */
                }
                // Ultratemp (+ cooling?); 
                else if ((msg.extractPayloadByte(2) & 0x30) === 0x30) {
                    let heatPump: Heater = sys.heaters.getItemById(4, true);
                    if (heatPump.master === 1) {
                        heatPump.master = 0;
                        (async function () {
                            try {
                                await ncp.heaters.deleteHeaterAsync(4);
                                logger.debug(`Ultratemp control returned to OCP.`);
                            }
                            catch (err) { logger.error(`Error with OCP reclaiming control over Ultratemp: ${err}`) }
                        })();
                    }
                    heatPump.master = 0;
                    heatPump.name = 'Ultratemp';
                    heatPump.body = 32;
                    heatPump.type = 4;
                    heatPump.isActive = true;
                    heatPump.heatingEnabled = true
                    heatPump.coolingEnabled = (msg.extractPayloadByte(1) & 0x3) === 3;
                    sys.heaters.getItemById(2).isActive = false;
                    sys.heaters.getItemById(3).isActive = false;
                    sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
                    let hstate = state.heaters.getItemById(heatPump.id, true);
                    hstate.name = heatPump.name;
                }
                // 0x10 = 16 = heat pump (solar as a heat pump)
                else if ((msg.extractPayloadByte(2) & 0x10) === 0x10) {
                    let heatPump: Heater = sys.heaters.getItemById(3, true);
                    if (heatPump.master === 1) {
                        heatPump.master = 0;
                        (async function () {
                            try {
                                await ncp.heaters.deleteHeaterAsync(3);
                                logger.debug(`Heat pump control returned to OCP.`);
                            }
                            catch (err) { logger.error(`Error with OCP reclaiming control over heat pump: ${err}`) }
                        })();
                    }
                    heatPump.master = 0;
                    heatPump.name = 'Heat Pump';
                    heatPump.body = 32;
                    heatPump.type = 3;
                    heatPump.isActive = true;
                    heatPump.heatingEnabled = true;
                    heatPump.coolingEnabled = false;
                    heatPump.freeze = (msg.extractPayloadByte(1) & 0x80) >> 7 === 1;
                    sys.heaters.getItemById(2).isActive = false;
                    sys.heaters.getItemById(4).isActive = false;
                    sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
                    let hstate = state.heaters.getItemById(heatPump.id, true);
                    hstate.name = heatPump.name;
                }
                else if ((msg.extractPayloadByte(2) & 0x30) === 0) {
                    // solar
                    let solar: Heater = sys.heaters.getItemById(2, true);
                    if (solar.master === 1) {
                        solar.master = 0;
                        (async function () {
                            try {
                                await ncp.heaters.deleteHeaterAsync(2);
                                logger.debug(`Solar heater control returned to OCP.`);
                            }
                            catch (err) { logger.error(`Error with OCP reclaiming control over solar heater: ${err}`) }
                        })();
                    }
                    solar.master = 0;
                    solar.name = 'Solar Heater';
                    solar.type = 2;
                    solar.isActive = true;
                    // solar.isVirtual = false;
                    sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
                    sys.features.removeItemById(20); // if present
                    state.features.removeItemById(20); // if present
                    sys.board.circuits.deleteCircuit(20);
                    solar.body = 32;
                    solar.freeze = (msg.extractPayloadByte(1) & 0x80) >> 7 === 1;
                    solar.coolingEnabled = (msg.extractPayloadByte(1) & 0x20) >> 5 === 1;
                    solar.startTempDelta = ((msg.extractPayloadByte(2) & 0xE) >> 1) + 3;
                    solar.stopTempDelta = ((msg.extractPayloadByte(2) & 0xC0) >> 6) + 2;
                    let sstate = state.heaters.getItemById(solar.id, true);
                    sstate.name = solar.name;
                    sys.heaters.getItemById(3).isActive = false;
                    sys.heaters.getItemById(4).isActive = false;
                }
                for (var i = 0; i < sys.heaters.length; i++) {
                    let heater = sys.heaters.getItemByIndex(i);
                    if (!heater.isActive) { sys.heaters.removeItemByIndex(i); }
                }
                sys.board.heaters.updateHeaterServices();
                for (let i = 0; i < sys.bodies.length; i++) {
                    let body = sys.bodies.getItemByIndex(i);
                    let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
                    let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
                    btemp.heaterOptions = opts;
                }
                sys.board.heaters.syncHeaterStates();
                sys.equipment.setEquipmentIds();
                msg.isProcessed = true;
                break;
            case 168:
                {
                    // IntelliChem Installed
                    if ((msg.extractPayloadByte(3) & 0x01) === 1) {
                        // only support for 1 ic with EasyTouch
                        let chem = sys.chemControllers.getItemByAddress(144, true);
                        let schem = state.chemControllers.getItemById(chem.id, true);
                        chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
                        chem.ph.tank.units = chem.orp.tank.units = '';

                    }
                    else {
                        let chem = sys.chemControllers.getItemByAddress(144);
                        state.chemControllers.removeItemById(chem.id);
                        sys.chemControllers.removeItemById(chem.id);
                    }
                    // Spa Manual Heat on/off
                    sys.general.options.manualHeat = msg.extractPayloadByte(4) === 1 ? true : false;
                    msg.isProcessed = true;
                }
        }
    }
    private static processCooldownDelay(msg: Inbound) {
        for (let i = 0; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters - 1; i++) {
            var heater: Heater = sys.heaters.getItemById(i + 1);
            heater.cooldownDelay = msg.extractPayloadByte(i + 2);
            // heater.isVirtual = false;
            if (heater.master === 1) {
                heater.master = 0;
                (async function () {
                    try {
                        await ncp.heaters.deleteHeaterAsync(i + 1);
                        logger.debug(`Heater control returned to OCP.`);
                    }
                    catch (err) { logger.error(`Error with OCP reclaiming control over heater: ${err}`) }
                })();
            }
        }
        msg.isProcessed = true;
    }

    //private static processBody(msg: Inbound) {
    //    for (let i = 0; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters - 1; i++) {
    //        let heater: Heater = sys.heaters.getItemById(i + 18);
    //        let hstate = state.heaters.getItemById(i + 1);
    //        heater.body = msg.extractPayloadByte(i + 18);
    //        hstate.isVirtual = heater.isVirtual = false;
    //    }
    //}
    private static processHeaterTypes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            let heater: Heater = sys.heaters.getItemById(i, msg.extractPayloadByte(i + 1) > 0);
            heater.type = msg.extractPayloadByte(i + 1);
            if (heater.type === 0) {
                sys.heaters.removeItemById(i);
                state.heaters.removeItemById(i);
            }
            else {
                heater.isActive = heater.type > 0;
                heater.body = msg.extractPayloadByte(i + 17);
                // heater.isVirtual = false;
                if (heater.master === 1) {
                    heater.master = 0;
                    (async function () {
                        try {
                            await ncp.heaters.deleteHeaterAsync(2);
                            logger.debug(`Heater control returned to OCP.`);
                        }
                        catch (err) { logger.error(`Error with OCP reclaiming control over heater: ${err}`) }
                    })();
                }
                heater.master = 0;
                let hstate = state.heaters.getItemById(i);
                // hstate.isVirtual = false;
                hstate.name = heater.name;
            }

        }
        sys.board.heaters.updateHeaterServices();
        msg.isProcessed = true;
    }
    private static processMaxBoostTemp(msg: Inbound) {
        for (let i = 0; i < msg.payload.length - 1 && i < sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i + 1);
            heater.maxBoostTemp = msg.extractPayloadByte(i + 2);
        }
        msg.isProcessed = true;
    }
    private static processStartStopDelta(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.startTempDelta = msg.extractPayloadByte(i + 1);
            heater.stopTempDelta = msg.extractPayloadByte(i + 18);
        }
        msg.isProcessed = true;
    }
    private static processCoolingSetTemp(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.coolingEnabled = msg.extractPayloadByte(i + 1) > 0;
            heater.differentialTemp = msg.extractPayloadByte(i + 18);
        }
        msg.isProcessed = true;
    }
    private static processAddress(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.address = msg.extractPayloadByte(i + 1);
        }
        msg.isProcessed = true;
    }
    private static processEfficiencyMode(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxHeaters; i++) {
            var heater: Heater = sys.heaters.getItemById(i);
            heater.efficiencyMode = msg.extractPayloadByte(i + 1);
        }
        msg.isProcessed = true;
    }
    private static processHeaterNames(msg: Inbound) {
        var heaterId = ((msg.extractPayloadByte(1) - 5) * 2) + 1;
        if (heaterId <= sys.equipment.maxHeaters) {
            let hstate = state.heaters.getItemById(heaterId);
            hstate.name = sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(2, 16);
        }
        if (heaterId <= sys.equipment.maxHeaters) {
            let hstate = state.heaters.getItemById(heaterId);
            hstate.name = sys.heaters.getItemById(heaterId++).name = msg.extractPayloadString(18, 16);
        }
        msg.isProcessed = true;
    }
}