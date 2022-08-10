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
import { IntelliCenterBoard } from 'controller/boards/IntelliCenterBoard';
import { EasyTouchBoard } from 'controller/boards/EasyTouchBoard';
import { IntelliTouchBoard } from 'controller/boards/IntelliTouchBoard';
import { SunTouchBoard } from "controller/boards/SunTouchBoard";

import { logger } from '../../../../logger/Logger';
import { ControllerType } from '../../../Constants';
import { Body, Circuit, ExpansionPanel, Feature, Heater, sys } from '../../../Equipment';
import { BodyTempState, ScheduleState, State, state } from '../../../State';
import { ExternalMessage } from '../config/ExternalMessage';
import { Inbound, Message } from '../Messages';

export class EquipmentStateMessage {
    private static initIntelliCenter(msg: Inbound) {
        sys.controllerType = ControllerType.IntelliCenter;
        sys.equipment.maxSchedules = 100;
        sys.equipment.maxFeatures = 32;
        // Always get equipment since this is volatile between loads. Everything else takes care of itself.
        sys.configVersion.equipment = 0;
    }
    public static initDefaults() {
        // defaults; set to lowest possible values.  Each *Touch will extend this once we know the model.
        sys.equipment.maxBodies = 1;
        sys.equipment.maxCircuits = 6;
        sys.equipment.maxSchedules = 12;
        sys.equipment.maxPumps = 2;
        sys.equipment.maxSchedules = 12;
        sys.equipment.maxValves = 2;
        sys.equipment.maxCircuitGroups = 0;
        sys.equipment.maxLightGroups = 1;
        sys.equipment.maxIntelliBrites = 8;
        sys.equipment.maxChemControllers = sys.equipment.maxChlorinators = 1;
        sys.equipment.maxCustomNames = 10;
        sys.equipment.maxChemControllers = 4;
        sys.equipment.maxFeatures = 8;
        sys.equipment.model = 'Unknown';
    }
    private static initTouch(msg: Inbound) {
        let model1 = msg.extractPayloadByte(27);
        let model2 = msg.extractPayloadByte(28);
        switch (model2) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
                logger.info(`Found IntelliTouch Controller`);
                sys.controllerType = ControllerType.IntelliTouch;
                model1 = msg.extractPayloadByte(28);
                model2 = msg.extractPayloadByte(9);
                (sys.board as IntelliTouchBoard).initExpansionModules(model1, model2);
                break;
            case 11:
                logger.info(`Found SunTouch Controller`);
                sys.controllerType = ControllerType.SunTouch;
                (sys.board as SunTouchBoard).initExpansionModules(model1, model2);
                break;
            case 13:
            case 14:
                logger.info(`Found EasyTouch Controller`);
                sys.controllerType = ControllerType.EasyTouch;
                (sys.board as EasyTouchBoard).initExpansionModules(model1, model2);
                break;
            default:
                logger.error(`Unknown Touch Controller ${msg.extractPayloadByte(28)}:${msg.extractPayloadByte(27)}`);
                break;
        }
        //let board = sys.board as EasyTouchBoard;
        //board.initExpansionModules(model1, model2);
    }
    private static initController(msg: Inbound) {
        state.status = 1;
        const model1 = msg.extractPayloadByte(27);
        const model2 = msg.extractPayloadByte(28);
        // RKS: 06-15-20 -- While this works for now the way we are detecting seems a bit dubious.  First, the 2 status message
        // contains two model bytes.  Right now the ones witness in the wild include 23 = fw1.023, 40 = fw1.040, 47 = fw1.047.
        // RKS: 07-21-22 -- Pentair is about to release fw1.232.  Unfortunately, the byte mapping for this has changed such that
        // the bytes [27,28] are [0,2] respectively.  This looks like it might be in conflict with IntelliTouch but it is not.  Below
        // are the combinations of 27,28 we have seen for IntelliTouch
        // [1,0] = i5+3
        // [0,1] = i7+3
        // [1,3] = i5+3s
        // [1,4] = i9+3s
        // [1,5] = i10+3d
        if ((model2 === 0 && (model1 === 23 || model1 >= 40)) ||
            (model2 === 2 && model1 == 0)) {
            state.equipment.controllerType = 'intellicenter';
            sys.board.modulesAcquired = false;
            sys.controllerType = ControllerType.IntelliCenter;
            logger.info(`Found Controller Board ${state.equipment.model || 'IntelliCenter'}, awaiting installed modules.`);
            EquipmentStateMessage.initIntelliCenter(msg);
        }
        else {
            EquipmentStateMessage.initTouch(msg);
            sys.board.needsConfigChanges = true;
            setTimeout(function () { sys.checkConfiguration(); }, 300);
        }
    }
    public static process(msg: Inbound) {
        Message.headerSubByte = msg.header[1];
        //console.log(process.memoryUsage());
        if (msg.action === 2 && state.isInitialized && sys.controllerType === ControllerType.Nixie) {
            // Start over because we didn't have communication before but we now do.  This will fall into the if
            // below so that it goes through the intialization process.  In this case we didn't see an OCP when we started
            // but there clearly is one now.
            sys.controllerType = ControllerType.Unknown;
            state.status = 0;
        }
        if (!state.isInitialized) {
            msg.isProcessed = true;
            if (msg.action === 2) EquipmentStateMessage.initController(msg);
            else return;
        }
        else if (!sys.board.modulesAcquired) {
            msg.isProcessed = true;
            if (msg.action === 204) {
                let board = sys.board as IntelliCenterBoard;
                // We have determined that the 204 message now contains the information
                // related to the installed expansion boards.
                console.log(`INTELLICENTER MODULES DETECTED, REQUESTING STATUS!`);
                // Master = 13-14
                // EXP1 = 15-16
                // EXP2 = 17-18
                let pc = msg.extractPayloadByte(40);
                board.initExpansionModules(msg.extractPayloadByte(13), msg.extractPayloadByte(14),
                    pc & 0x01 ? msg.extractPayloadByte(15) : 0x00, pc & 0x01 ? msg.extractPayloadByte(16) : 0x00,
                    pc & 0x02 ? msg.extractPayloadByte(17) : 0x00, pc & 0x02 ? msg.extractPayloadByte(18) : 0x00,
                    pc & 0x04 ? msg.extractPayloadByte(19) : 0x00, pc & 0x04 ? msg.extractPayloadByte(20) : 0x00);
                sys.equipment.setEquipmentIds();
            }
            else return;
        }
        switch (msg.action) {
            case 2:
                {
                    let fnTempFromByte = function (byte) {
                        return byte;
                        //return (byte & 0x007F) * (((byte & 0x0080) > 0) ? -1 : 1); // RKS: 09-26-20 Not sure how negative temps are represented but this aint it.  Temps > 127 have been witnessed.
                    }

                    // Shared
                    let dt = new Date();
                    // RKS: This was moved to the ChemControllerState message.  This is flawed in that it incorrectly sets IntelliChem to no comms.
                    //if (state.chemControllers.length > 0) {
                    //    // TODO: move this to chemController when we understand the packets better
                    //    for (let i = 0; i < state.chemControllers.length; i++) {
                    //        let ccontroller = state.chemControllers.getItemByIndex(i);
                    //        if (sys.board.valueMaps.chemControllerTypes.getName(ccontroller.type) === 'intellichem') {
                    //            if (dt.getTime() - ccontroller.lastComm > 60000) ccontroller.status = 1;
                    //        }
                    //    }
                    //}
                    state.time.hours = msg.extractPayloadByte(0);
                    state.time.minutes = msg.extractPayloadByte(1);
                    state.time.seconds = dt.getSeconds();
                    state.mode = sys.controllerType !== ControllerType.IntelliCenter ? (msg.extractPayloadByte(9) & 0x81) : (msg.extractPayloadByte(9) & 0x01);

                    // RKS: The units have been normalized for English and Metric for the overall panel.  It is important that the val numbers match for at least the temp units since
                    // the only unit of measure native to the Touch controllers is temperature they chose to name these C or F.  However, with the njsPC extensions this is non-semantic
                    // since pressure, volume, and length have been introduced.
                    sys.general.options.units = state.temps.units = msg.extractPayloadByte(9) & 0x04;
                    state.valve = msg.extractPayloadByte(10);


                    // RSG - added 7/8/2020
                    // Every 30 mins, check the timezone and adjust DST settings
                    if (dt.getMinutes() % 30 === 0) {
                        sys.board.system.setTZ();
                        sys.board.schedules.updateSunriseSunsetAsync().then((updated: boolean)=>{
                            if (updated) {logger.debug(`Sunrise/sunset times updated on schedules.`);}
                        });
                    }
                    // Check and update clock when it is off by >5 mins (just for a small buffer) and:
                    // 1. IntelliCenter has "manual" time set (Internet will automatically adjust) and autoAdjustDST is enabled
                    // 2. *Touch is "manual" (only option) and autoAdjustDST is enabled - (same as #1)
                    // 3. clock source is "server" isn't an OCP option but can be enabled on the clients 
                    if (dt.getMinutes() % 5 === 0 && dt.getSeconds() <= 10 && sys.general.options.clockSource === 'server') {
                        if ((Math.abs(dt.getTime() - state.time.getTime()) > 60 * 2 * 1000) && !state.time.isUpdating) {
                            state.time.isUpdating = true;
                            sys.board.system.setDateTimeAsync({ dt, dst: sys.general.options.adjustDST || 0, })
                                .then(() => {
                                    logger.info(`njsPC automatically updated OCP time.  You're welcome.`);
                                })
                                .catch((err) => {
                                    logger.error(`Error automatically setting system time. ${JSON.stringify(err)}`)
                                })
                                .finally(() => {
                                    state.time.isUpdating = false;
                                })
                        }
                    }
                    state.delay = msg.extractPayloadByte(12) & 63; // not sure what 64 val represents
                    state.freeze = (msg.extractPayloadByte(9) & 0x08) === 0x08;
                    if (sys.controllerType === ControllerType.IntelliCenter) {
                        state.temps.waterSensor1 = fnTempFromByte(msg.extractPayloadByte(14));
                        if (sys.bodies.length > 2 || sys.equipment.dual) state.temps.waterSensor2 = fnTempFromByte(msg.extractPayloadByte(15));
                        // We are making an assumption here in that the circuits are always labeled the same.
                        // 1=Spa/Body2
                        // 6=Pool/Body1
                        // 12=Body3
                        // 22=Body4 -- Really not sure about this one.
                        if (sys.bodies.length > 0) {
                            // We will not go in here if this is not a shared body.
                            const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 6;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0F;
                            // With the IntelliCenter i10D, bit 6 is not reliable.  It is not set properly and requires the 204 message
                            // to process the data.
                            if (!sys.equipment.dual) {
                                if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                    tbody.temp = state.temps.waterSensor1;
                                    tbody.isOn = true;
                                } else tbody.isOn = false;
                            }
                            else if (state.circuits.getItemById(6).isOn === true) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            }
                            else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 1) {
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 1;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xF0) >> 4;
                            if (!sys.equipment.dual) {
                                if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                    tbody.temp = sys.equipment.shared ? state.temps.waterSensor1 : state.temps.waterSensor2;
                                    tbody.isOn = true;
                                } else tbody.isOn = false;
                            } else if (state.circuits.getItemById(1).isOn === true) {
                                tbody.temp = sys.equipment.shared ? state.temps.waterSensor1 : state.temps.waterSensor2;
                                tbody.isOn = true;
                            }
                            else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 2) {
                            state.temps.waterSensor3 = fnTempFromByte(msg.extractPayloadByte(20));
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(10, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(3, true);
                            const cbody: Body = sys.bodies.getItemById(3);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = msg.extractPayloadByte(11) & 0x0F;
                            tbody.circuit = cbody.circuit = 12;
                            if ((msg.extractPayloadByte(3) & 0x08) === 8) {
                                // This is the first circuit on the second body.
                                tbody.temp = state.temps.waterSensor3;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        if (sys.bodies.length > 3) {
                            state.temps.waterSensor4 = fnTempFromByte(msg.extractPayloadByte(21));
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(19, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(4, true);
                            const cbody: Body = sys.bodies.getItemById(4);
                            tbody.name = cbody.name;
                            tbody.heatMode = cbody.heatMode;
                            tbody.setPoint = cbody.setPoint;
                            tbody.heatStatus = (msg.extractPayloadByte(11) & 0xF0) >> 4;
                            tbody.circuit = cbody.circuit = 22;
                            if ((msg.extractPayloadByte(5) & 0x20) === 32) {
                                // This is the first circuit on the third body or the first circuit on the second expansion.
                                tbody.temp = state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                        }
                        state.temps.air = fnTempFromByte(msg.extractPayloadByte(18)); // 18
                        state.temps.solarSensor1 = fnTempFromByte(msg.extractPayloadByte(19)); // 19
                        if (sys.bodies.length > 2 || sys.equipment.dual)
                            state.temps.solarSensor2 = fnTempFromByte(msg.extractPayloadByte(17));
                        if ((sys.bodies.length > 2))
                            state.temps.solarSensor3 = fnTempFromByte(msg.extractPayloadByte(22));
                        if ((sys.bodies.length > 3))
                            state.temps.solarSensor4 = fnTempFromByte(msg.extractPayloadByte(23));

                        if (sys.general.options.clockSource !== 'server' || typeof sys.general.options.adjustDST === 'undefined') sys.general.options.adjustDST = (msg.extractPayloadByte(23) & 0x01) === 0x0; //23
                    }
                    else {
                        state.temps.waterSensor1 = fnTempFromByte(msg.extractPayloadByte(14));
                        state.temps.air = fnTempFromByte(msg.extractPayloadByte(18));
                        let solar: Heater = sys.heaters.getItemById(2);
                        if (solar.isActive) state.temps.solar = fnTempFromByte(msg.extractPayloadByte(19));
                        //[15, 34, 32, 0, 0, 0, 0, 0, 0, 0, 83, 0, 0, 0, 81, 81, 32, 91, 82, 91, 0, 0, 7, 4, 0, 77, 163, 1, 0][4, 78]
                        // byte | val |
                        // 0    | 15  | Hours
                        // 1    | 34  | Minutes
                        // 2    | 32  | Circuits 1-8 bit 6 = Pool on.
                        // 3    | 0   | Circuits 9-16
                        // 4    | 0   | Circuits 17-24
                        // 5    | 0   | Circuits 24-32
                        // 6    | 0   | Circuits 33-40
                        // 7    | 0   | Unknown
                        // 8    | 0   | Unknown
                        // 9    | 0   | Panel Mode bit flags
                        // 10   | 83  | Heat status for body 1 & 2 (This says solar is on for the pool and spa because this is the body that is running)
                        // 11   | 0   | Unknown (This could be the heat status for body 3 & 4)
                        // 12   | 0   | Unknown
                        // 13   | 0   | Unknown
                        // 14   | 81  | Water sensor 1 temperature
                        // 15   | 81  | Water sensor 2 temperature (This mirrors water sensor 1 in shared system)
                        // 16   | 32  | Unknown
                        // 17   | 91  | Solar sensor 1 temperature
                        // 18   | 82  | Air temp
                        // 19   | 91  | Solar sensor 2 temperature (this mirrors solar sensor 1 in shared system)
                        // 20   | 0   | Unknown (this could be water sensor 3)
                        // 21   | 0   | Unknown (this could be water sensor 4)
                        // 22   | 7   | Body 1 & 2 heat mode (body 1 = Solar Only body 2 = Heater)
                        // 23   | 4   | Body 3 & 4 heat mode
                        // 24   | 0   | Unknown
                        // 25   | 77  | Unknown
                        // 26   | 163 | Unknown
                        // 27   | 1   | Byte 2 of OCP identifier
                        // 28   | 0   | Byte 1 of OCP identifier


                        // Heat Modes
                        // 1 = Heater
                        // 2 = Solar Preferred
                        // 3 = Solar Only

                        // Heat Status
                        // 0 = Off
                        // 1 = Heater
                        // 2 = Cooling
                        // 3 = Solar/Heat Pump

                        // Pool Heat Mode/Status.
                        // When temp setpoint and pool in heater mode went above the current pool temp byte 10 went from 67 to 71.  The upper two bits of the
                        // lower nibble changed on bit 3.  So 0100 0111 from 0100 0011

                        // Spa Heat Mode/Status
                        // When switching from pool to spa with both heat modes set to off byte 10 went from 67 to 75 and byte(16) changed from 0 to 32.  The upper two bits of the lower nibble
                        // changed on byte(10) bit 4.  So to 0100 1011 from 0100 0011.  Interestingly this seems to indicate that the spa turned on.  This almost appears as if the heater engaged
                        // automatically like the spa has manual heat turned off.
                        // When the heat mode was changed to solar only byte 10 went to 75 from 67 so bit 4 switched off and byte(16) changed to 0.  At this point the water temp is 86 and the
                        // solar temp is 79 so the solar should not be coming on.
                        // When the setpoint was dropped below the water temp bit 5 on byte(10) swiched back off and byte(16) remained at 0.  I think there is no bearing here on this.
                        // When the heat mode was changed to solar preferred and the setpoint was raised to 104F the heater kicked on and bit 5 changed from 0 to 1.  So byte(10) went from
                        // 0100 0011 to 0100 1011 this is consistent with the heater coming on for the spa.  In this instance byte(16) also changed back to 32 which would be consistent with
                        // an OCP where the manual heat was turned off.

                        // RKS: Added check for i10d for water sensor 2.
                        if (sys.bodies.length > 2 || sys.equipment.dual) state.temps.waterSensor2 = fnTempFromByte(msg.extractPayloadByte(15));
                        if (sys.bodies.length > 0) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(6, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const cbody: Body = sys.bodies.getItemById(1);
                            if ((msg.extractPayloadByte(2) & 0x20) === 32) {
                                tbody.temp = state.temps.waterSensor1;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 6;

                            //RKS: This heat mode did not include all the bits necessary for hybrid heaters
                            //tbody.heatMode = cbody.heatMode = msg.extractPayloadByte(22) & 0x03;
                            tbody.heatMode = cbody.heatMode = msg.extractPayloadByte(22) & 0x33;
                            let heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
                            if (tbody.isOn) {
                                if (tbody.heaterOptions.hybrid > 0) {
                                    // ETi When heating with
                                    // Heatpump (1) = 12    H:true S:false C:false
                                    // Gas (2) = 48         H:false S:true C:false
                                    // Hybrid (3) = 48      H:true S:false C:false
                                    // Dual (16) = 60       H:true S:true C:false
                                    // What this means is that Touch actually treats the heat status as either heating with
                                    // the primary heater for the body or the secondary.  In the case of a hybrid heater
                                    // the primary is a heatpump and the secondary is gas.  In the case of gas + solar or gas + heatpump
                                    // the gas heater is the primary and solar or heatpump is the secondary.   So we need to dance a little bit
                                    // here.  We do this by checking the heater options.
                                    if (tbody.heatMode > 0) { // Turns out that ET sometimes reports the last heat status when off.
                                        // This can be the only heater solar cannot be installed with this.
                                        let byte = msg.extractPayloadByte(10);
                                        // Either the primary, secondary, or both is engaged.
                                        if ((byte & 0x14) === 0x14) heatStatus = sys.board.valueMaps.heatStatus.getValue('dual');
                                        // else if ((byte & 0x0c) === 0x0c) heatStatus = sys.board.valueMaps.heatStatus.getValue('off'); // don't need since we test for heatMode>0
                                        else if (byte & 0x10) heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                        else if (byte & 0x04) heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                    }
                                }
                                else {
                                    //const heaterActive = (msg.extractPayloadByte(10) & 0x0C) === 12;
                                    //const solarActive = (msg.extractPayloadByte(10) & 0x30) === 48;
                                    const heaterActive = (msg.extractPayloadByte(10) & 0x04) === 0x04;
                                    const solarActive = (msg.extractPayloadByte(10) & 0x10) === 0x10;
                                    const cooling = solarActive && tbody.temp > tbody.setPoint;
                                    if (heaterActive) heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                    if (cooling) heatStatus = sys.board.valueMaps.heatStatus.getValue('cooling');
                                    else if (solarActive) heatStatus = sys.board.valueMaps.heatStatus.getValue('solar');
                                }
                            }
                            tbody.heatStatus = heatStatus;
                            sys.board.schedules.syncScheduleHeatSourceAndSetpoint(cbody, tbody);
                        }
                        if (sys.bodies.length > 1) {
                            // const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                            const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
                            const cbody: Body = sys.bodies.getItemById(2);
                            if ((msg.extractPayloadByte(2) & 0x01) === 1) {
                                tbody.temp = sys.equipment.shared ? state.temps.waterSensor1 : state.temps.waterSensor2;
                                tbody.isOn = true;
                            } else tbody.isOn = false;
                            //RKS: This heat mode did not include all the bits necessary for hybrid heaters
                            //tbody.heatMode = cbody.heatMode = (msg.extractPayloadByte(22) & 0x0C) >> 2;
                            tbody.heatMode = cbody.heatMode = (msg.extractPayloadByte(22) & 0xCC) >> 2;
                            tbody.setPoint = cbody.setPoint;
                            tbody.name = cbody.name;
                            tbody.circuit = cbody.circuit = 1;
                            let heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
                            if (tbody.isOn) {
                                if (tbody.heaterOptions.hybrid > 0) {
                                    // This can be the only heater solar cannot be installed with this.
                                    if (tbody.heatMode > 0) {
                                        let byte = msg.extractPayloadByte(10);
                                        // Either the primary, secondary, or both is engaged.
                                        if ((byte & 0x28) === 0x28) heatStatus = sys.board.valueMaps.heatStatus.getValue('dual');
                                        else if (byte & 0x20) heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                        else if (byte & 0x08) heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                    }
                                }
                                else {
                                    //const heaterActive = (msg.extractPayloadByte(10) & 0x0C) === 12;
                                    //const solarActive = (msg.extractPayloadByte(10) & 0x30) === 48;
                                    const heaterActive = (msg.extractPayloadByte(10) & 0x08) === 0x08;
                                    const solarActive = (msg.extractPayloadByte(10) & 0x20) === 0x20;
                                    const cooling = solarActive && tbody.temp > tbody.setPoint;
                                    if (heaterActive) heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                    if (cooling) heatStatus = sys.board.valueMaps.heatStatus.getValue('cooling');
                                    else if (solarActive) heatStatus = sys.board.valueMaps.heatStatus.getValue('solar');
                                }
                            }
                            tbody.heatStatus = heatStatus;
                            sys.board.schedules.syncScheduleHeatSourceAndSetpoint(cbody, tbody);
                        }
                    }
                    switch (sys.controllerType) {
                        case ControllerType.IntelliCenter:
                            {
                                EquipmentStateMessage.processCircuitState(msg);
                                // RKS: As of 1.04 the entire feature state is emitted on 204.  This message
                                // used to contain the first 4 feature states starting in byte 8 upper 4 bits
                                // and as of 1.047 release this was no longer reliable.  Macro circuits only appear
                                // to be available on message 30-15 and 168-15.
                                //EquipmentStateMessage.processFeatureState(msg);
                                sys.board.circuits.syncCircuitRelayStates();
                                sys.board.circuits.syncVirtualCircuitStates();
                                sys.board.valves.syncValveStates();
                                sys.board.filters.syncFilterStates();
                                state.emitControllerChange();
                                state.emitEquipmentChanges();
                                sys.board.heaters.syncHeaterStates();
                                break;
                            }
                        case ControllerType.SunTouch:
                            EquipmentStateMessage.processSunTouchCircuits(msg);
                            sys.board.circuits.syncCircuitRelayStates();
                            sys.board.features.syncGroupStates();
                            sys.board.circuits.syncVirtualCircuitStates();
                            sys.board.valves.syncValveStates();
                            sys.board.filters.syncFilterStates();
                            state.emitControllerChange();
                            state.emitEquipmentChanges();
                            sys.board.heaters.syncHeaterStates();
                            sys.board.schedules.syncScheduleStates();
                            break;
                        case ControllerType.EasyTouch:
                        case ControllerType.IntelliCom:
                        case ControllerType.IntelliTouch:
                            {
                                EquipmentStateMessage.processTouchCircuits(msg);
                                // This will toggle the group states depending on the state of the individual circuits.
                                sys.board.circuits.syncCircuitRelayStates();
                                sys.board.features.syncGroupStates();
                                sys.board.circuits.syncVirtualCircuitStates();
                                sys.board.valves.syncValveStates();
                                sys.board.filters.syncFilterStates();
                                state.emitControllerChange();
                                state.emitEquipmentChanges();
                                sys.board.heaters.syncHeaterStates();
                                sys.board.schedules.syncScheduleStates();
                                break;
                            }
                    }
                }
                break;
            case 5: // Intellitouch only.  Date/Time packet
                // [255,0,255][165,1,15,16,5,8][15,10,8,1,8,18,0,1][1,15]
                state.time.hours = msg.extractPayloadByte(0);
                state.time.minutes = msg.extractPayloadByte(1);
                // state.time.dayOfWeek = msg.extractPayloadByte(2);
                state.time.date = msg.extractPayloadByte(3);
                state.time.month = msg.extractPayloadByte(4);
                state.time.year = msg.extractPayloadByte(5);
                if (sys.general.options.clockSource !== 'server' || typeof sys.general.options.adjustDST === 'undefined') sys.general.options.adjustDST = msg.extractPayloadByte(7) === 0x01;
                setTimeout(function () { sys.board.checkConfiguration(); }, 100);
                msg.isProcessed = true;
                break;
            case 8: {
                // IntelliTouch only.  Heat status
                // [165,x,15,16,8,13],[75,75,64,87,101,11,0, 0 ,62 ,0 ,0 ,0 ,0] ,[2,190]
                // Heat Modes
                // 1 = Heater
                // 2 = Solar Preferred
                // 3 = Solar Only
                //[81, 81, 82, 85, 97, 7, 0, 0, 0, 100, 100, 4, 0][3, 87]
                // byte | val |
                // 0    | 81  | Water sensor 1
                // 1    | 81  | Unknown (Probably water sensor 2 on a D)
                // 2    | 82  | Air sensor
                // 3    | 85  | Body 1 setpoint
                // 4    | 97  | Body 2 setpoint
                // 5    | 7   | Body 1 & 2 heat mode. (0111) (Pool = 11 Solar only/Spa = 01 Heater)
                // 6    | 0   | Unknown (Water Sensor 3)
                // 7    | 0   | Unknown (Water Sensor 4)
                // 8    | 0   | Unknown -- Reserved air sensor
                // 9    | 100 | Unknown (Body 3 setpoint)
                // 10   | 100 | Unknown (Body 4 setpoint)
                // 11   | 4   | Unknown (Body 3 & 4 head mode. (0010) (Pool = 00 = Off/ 10 = Solar Preferred)
                // 12   | 0   | Unknown
                // There are two messages sent when the OCP tries to tse a heat mode in IntelliTouch.  The first one on the action 136 is for the first 2 bodies and the second
                // is for the remaining 2 bodies.  The second half of this message mirrors the values for the second 136 message.
                // [255, 0, 255][165, 1, 16, 32, 136, 4][100, 100, 4, 1][2, 47]
                state.temps.waterSensor1 = msg.extractPayloadByte(0);
                state.temps.air = msg.extractPayloadByte(2);
                let solar: Heater = sys.heaters.getItemById(2);
                // RKS: 05-18-22 - This is not correct the solar temp is not stored on this message.  It is always 0
                // on an intelliTouch system with solar.
                //if (solar.isActive) state.temps.solar = msg.extractPayloadByte(8);
                // pool
                let tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
                let cbody: Body = sys.bodies.getItemById(1);
                // RKS: 02-26-22 - See communications doc for explanation of bits.  This needs to support UltraTemp ETi heatpumps.
                tbody.heatMode = cbody.heatMode = msg.extractPayloadByte(5) & 0x33;
                tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(3);
                tbody.coolSetpoint = cbody.coolSetpoint = msg.extractPayloadByte(9);
                if (tbody.isOn) tbody.temp = state.temps.waterSensor1;
                cbody = sys.bodies.getItemById(2);
                if (cbody.isActive) {
                    // spa
                    tbody = state.temps.bodies.getItemById(2, true);
                    tbody.heatMode = cbody.heatMode = (msg.extractPayloadByte(5) & 0xCC) >> 2;
                    //tbody.heatMode = cbody.heatMode = (msg.extractPayloadByte(5) & 12) >> 2;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte(4);
                    if (tbody.isOn) tbody.temp = state.temps.waterSensor2 = msg.extractPayloadByte(1);
                }
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            }
            case 96:
                EquipmentStateMessage.processIntelliBriteMode(msg);
                break;
            case 197: {
                // request for date/time on *Touch.  Use this as an indicator
                // that SL has requested config and update lastUpdated date/time
                /* let ver: ConfigVersion =
                    typeof (sys.configVersion) === 'undefined' ? new ConfigVersion({}) : sys.configVersion;
                ver.lastUpdated = new Date();
                sys.processVersionChanges(ver); */
                sys.configVersion.lastUpdated = new Date();
                msg.isProcessed = true;
                break;
            }
            case 204: // IntelliCenter only.
                state.batteryVoltage = msg.extractPayloadByte(2) / 50;
                state.comms.keepAlives = msg.extractPayloadInt(4);
                state.time.date = msg.extractPayloadByte(6);
                state.time.month = msg.extractPayloadByte(7);
                state.time.year = msg.extractPayloadByte(8);
                sys.equipment.controllerFirmware = (msg.extractPayloadByte(42) + (msg.extractPayloadByte(43) / 1000)).toString();
                if (sys.chlorinators.length > 0) {
                    if (msg.extractPayloadByte(37, 255) !== 255) {
                        const chlor = state.chlorinators.getItemById(1);
                        chlor.superChlorRemaining = msg.extractPayloadByte(37) * 3600 + msg.extractPayloadByte(38) * 60;
                    } else {
                        const chlor = state.chlorinators.getItemById(1);
                        chlor.superChlorRemaining = 0;
                        chlor.superChlor = false;
                    }
                }
                ExternalMessage.processFeatureState(9, msg);
                //if (sys.equipment.dual === true) {
                //    // For IntelliCenter i10D the body state is on byte 26 of the 204.  This impacts circuit 6.
                //    let byte = msg.extractPayloadByte(26);
                //    let pstate = state.circuits.getItemById(6, true);
                //    let oldstate = pstate.isOn;
                //    pstate.isOn = ((byte & 0x0010) === 0x0010);
                //    logger.info(`Checking i10D pool state ${byte} old:${oldstate} new: ${pstate.isOn}`);
                //    //if (oldstate !== pstate.isOn) {
                //        state.temps.bodies.getItemById(1, true).isOn = pstate.isOn;
                //        sys.board.circuits.syncCircuitRelayStates();
                //        sys.board.circuits.syncVirtualCircuitStates();
                //        sys.board.valves.syncValveStates();
                //        sys.board.filters.syncFilterStates();
                //        sys.board.heaters.syncHeaterStates();
                //    //}
                //    if (oldstate !== pstate.isOn) pstate.emitEquipmentChange();
                //}
                // At this point normally on is ignored.  Not sure what this does.
                let cover1 = sys.covers.getItemById(1);
                let cover2 = sys.covers.getItemById(2);
                if (cover1.isActive) {
                    let scover1 = state.covers.getItemById(1, true);
                    scover1.name = cover1.name;
                    state.temps.bodies.getItemById(cover1.body + 1).isCovered = scover1.isClosed = (msg.extractPayloadByte(30) & 0x0001) > 0;
                }
                if (cover2.isActive) {
                    let scover2 = state.covers.getItemById(2, true);
                    scover2.name = cover2.name;
                    state.temps.bodies.getItemById(cover2.body + 1).isCovered = scover2.isClosed = (msg.extractPayloadByte(30) & 0x0002) > 0;
                }
                msg.isProcessed = true;
                state.emitEquipmentChanges();
                break;
        }
    }
    private static processCircuitState(msg: Inbound) {
        // The way this works is that there is one byte per 8 circuits for a total of 5 bytes or 40 circuits.  The
        // configuration already determined how many available circuits we have by querying the model of the panel
        // and any installed expansion panel models.  Only the number of available circuits will appear in this
        // array.
        let circuitId = 1;
        let maxCircuitId = sys.board.equipmentIds.circuits.end;
        for (let i = 2; i < msg.payload.length && circuitId <= maxCircuitId; i++) {
            const byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                let circuit = sys.circuits.getItemById(circuitId, false, { isActive: false });
                if (circuit.isActive !== false) {
                    let cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                    // For IntelliCenter i10D body circuits are not reported here.
                    let isOn = ((circuitId === 6 || circuitId === 1) && sys.equipment.dual === true) ? cstate.isOn : (byte & (1 << j)) > 0;
                    //let isOn = (byte & (1 << j)) > 0;
                    cstate.isOn = isOn;
                    cstate.name = circuit.name;
                    cstate.nameId = circuit.nameId;
                    cstate.showInFeatures = circuit.showInFeatures;
                    cstate.type = circuit.type;
                    sys.board.circuits.setEndTime(circuit, cstate, isOn);
                    if (sys.controllerType === ControllerType.IntelliCenter) {
                        // intellitouch sends a separate msg with themes
                        switch (circuit.type) {
                            case 6: // Globrite
                            case 5: // Magicstream
                            case 8: // Intellibrite
                            case 10: // Colorcascade
                                cstate.lightingTheme = circuit.lightingTheme;
                                break;
                            case 9:
                                cstate.level = circuit.level || 0;
                                break;
                        }
                    }
                }
                circuitId++;
            }
        }
        msg.isProcessed = true;
    }
    private static processSunTouchCircuits(msg: Inbound) {
        // SunTouch has really twisted bit mapping for its
        // circuit states.  Features are intertwined within the
        // features.
        let byte = msg.extractPayloadByte(2);
        for (let i = 0; i < 8; i++) {
            let id = i === 4 ? 7 : i > 5 ? i + 2 : i + 1;
            let circ = sys.circuits.getInterfaceById(id, false, { isActive: false });
            if (circ.isActive) {
                let isOn = ((1 << i) & byte) > 0;
                let cstate = state.circuits.getInterfaceById(id, circ.isActive);
                if (isOn !== cstate.isOn) {
                    sys.board.circuits.setEndTime(circ, cstate, isOn);
                    cstate.isOn = isOn;
                }
            }
        }
        byte = msg.extractPayloadByte(3);
        {
            let circ = sys.circuits.getInterfaceById(10, false, { isActive: false });
            if (circ.isActive) {
                let isOn = (byte & 1) > 0;
                let cstate = state.circuits.getInterfaceById(circ.id, circ.isActive);
                if (isOn !== cstate.isOn) {
                    sys.board.circuits.setEndTime(circ, cstate, isOn);
                    cstate.isOn = isOn;
                }
            }
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }

    private static processTouchCircuits(msg: Inbound) {
        let circuitId = 1;
        let maxCircuitId = sys.board.equipmentIds.features.end;
        for (let i = 2; i < msg.payload.length && circuitId <= maxCircuitId; i++) {
            const byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                const circ = sys.circuits.getInterfaceById(circuitId, false, { isActive: false });
                if (!sys.board.equipmentIds.invalidIds.isValidId(circuitId)) {
                    circ.isActive = false;
                }
                if (circ.isActive) {
                    const cstate = state.circuits.getInterfaceById(circuitId, circ.isActive);
                    cstate.showInFeatures = circ.showInFeatures;
                    let isOn = (byte & 1 << j) >> j > 0;
                    if (isOn !== cstate.isOn) {
                        sys.board.circuits.setEndTime(circ, cstate, isOn);
                        cstate.isOn = isOn;
                    }
                    cstate.name = circ.name;
                    cstate.type = circ.type;
                    cstate.nameId = circ.nameId;
                }
                else {
                    if (circ instanceof Circuit) {
                        sys.circuits.removeItemById(circuitId);
                        // don't forget to remove from state #257
                        state.circuits.removeItemById(circuitId);
                    }
                    else if (circ instanceof Feature) {
                        sys.features.removeItemById(circuitId);
                        // don't forget to remove from state #257
                        state.features.removeItemById(circuitId);
                    }
                }
                circuitId++;
            }
        }
        // state.body = body;
        //state.emitControllerChange();
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }

    private static processIntelliBriteMode(msg: Inbound) {
        // eg RED: [165,16,16,34,96,2],[195,0],[2,12]
        // data[0] = color
        const theme = msg.extractPayloadByte(0);
        switch (theme) {
            case 0: // off
            case 1: // on
            case 190: // save
                // case 191: // recall
                // RKS: TODO hold may be in this list since I see the all on and all off command here.  Sync is probably in the colorset message that includes the timings. 
                // do nothing as these don't actually change the state.
                break;

            default:
                {
                    // intellibrite themes
                    // This is an observed message in that no-one asked for it.  *Touch does not report the theme and in fact, it is not even
                    // stored.  Once the message is sent then it throws away the data.  When you turn the light
                    // on again it will be on at whatever theme happened to be set at the time it went off.  We keep this
                    // as a best guess so when the user turns on the light it will likely be the last theme observed.
                    const grp = sys.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
                    const sgrp = state.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
                    grp.lightingTheme = sgrp.lightingTheme = theme;
                    for (let i = 0; i < grp.circuits.length; i++) {
                        let c = grp.circuits.getItemByIndex(i);
                        let cstate = state.circuits.getItemById(c.circuit);
                        let circuit = sys.circuits.getInterfaceById(c.circuit);
                        if (cstate.isOn) cstate.lightingTheme = circuit.lightingTheme = theme;
                    }
                    switch (theme) {
                        case 128: // sync
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'sync');
                            break;
                        case 144: // swim
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'swim');
                            break;
                        case 160: // set
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'set');
                            break;
                        case 190: // save
                        case 191: // recall
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'other');
                            break;
                        default:
                            sys.board.circuits.sequenceLightGroupAsync(grp.id, 'color');
                        // other themes for magicstream?
                    }
                    break;
                }
        }
        msg.isProcessed = true;
    }
}
