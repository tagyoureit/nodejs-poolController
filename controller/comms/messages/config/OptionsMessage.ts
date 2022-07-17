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
import { sys } from "../../../Equipment";
import { state } from "../../../State";
import { ControllerType } from "../../../Constants";
export class OptionsMessage {
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                OptionsMessage.processIntelliCenter(msg);
                break;
            case ControllerType.IntelliCom:
            case ControllerType.SunTouch:
            case ControllerType.EasyTouch:
            case ControllerType.IntelliTouch:
                OptionsMessage.processIntelliTouch(msg);
                break;
        }
    }
    private static processIntelliCenter(msg: Inbound) {
        switch (msg.action) {
            case 30:
                switch (msg.extractPayloadByte(1)) {
                    case 0:
                        {
                            if ((msg.extractPayloadByte(13) & 32) === 32)
                                sys.general.options.clockSource = 'internet';
                            else if (sys.general.options.clockSource !== 'server')
                                sys.general.options.clockSource = 'manual';
                            sys.general.options.clockMode = (msg.extractPayloadByte(13) & 64) === 64 ? 24 : 12;
                            if (sys.general.options.clockSource !== 'server' || typeof sys.general.options.adjustDST === 'undefined') sys.general.options.adjustDST = (msg.extractPayloadByte(13) & 128) === 128;
                            // No pumpDelay
                            //[255, 0, 255][165, 63, 15, 16, 30, 40][0, 0, 1, 129, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 149, 29, 35, 3, 0, 0, 92, 81, 91, 81, 3, 3, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][4, 193]
                            // pumpDelay                                                                                                                                       
                            //[255, 0, 255][165, 63, 15, 16, 30, 40][0, 0, 1, 129, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 149, 29, 35, 3, 0, 0, 92, 81, 91, 81, 3, 3, 0, 0, 15, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][4, 194]
                            sys.general.options.pumpDelay = msg.extractPayloadByte(29) === 1;
                            // No cooldownDelay
                            //[255, 0, 255][165, 63, 15, 16, 30, 40][0, 0, 1, 129, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 149, 29, 35, 3, 0, 0, 92, 81, 91, 81, 3, 3, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][4, 193]
                            // cooldownDelay
                            //[255, 0, 255][165, 63, 15, 16, 30, 40][0, 0, 1, 129, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 149, 29, 35, 3, 0, 0, 92, 81, 91, 81, 3, 3, 0, 0, 15, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0][4, 194]
                            sys.general.options.cooldownDelay = msg.extractPayloadByte(30) === 1;
                            sys.general.options.manualPriority = msg.extractPayloadByte(38) === 1;
                            sys.general.options.manualHeat = msg.extractPayloadByte(39) === 1;
                            let fnTranslateByte = (byte):number => { return (byte & 0x007F) * (((byte & 0x0080) > 0) ? -1 : 1); }
                            sys.equipment.tempSensors.setCalibration('water1', fnTranslateByte(msg.extractPayloadByte(3)));
                            sys.equipment.tempSensors.setCalibration('solar1', fnTranslateByte(msg.extractPayloadByte(4)));
                            sys.equipment.tempSensors.setCalibration('air',    fnTranslateByte(msg.extractPayloadByte(5)));
                            sys.equipment.tempSensors.setCalibration('water2', fnTranslateByte(msg.extractPayloadByte(6)));
                            sys.equipment.tempSensors.setCalibration('solar2', fnTranslateByte(msg.extractPayloadByte(7)));
                            sys.equipment.tempSensors.setCalibration('water3', fnTranslateByte(msg.extractPayloadByte(8)));
                            sys.equipment.tempSensors.setCalibration('solar3', fnTranslateByte(msg.extractPayloadByte(9)));
                            sys.equipment.tempSensors.setCalibration('water4', fnTranslateByte(msg.extractPayloadByte(10)));
                            sys.equipment.tempSensors.setCalibration('solar4', fnTranslateByte(msg.extractPayloadByte(11)));

                            // When we complete our transition for the calibration make this go away.
                            //sys.general.options.waterTempAdj2 = (msg.extractPayloadByte(2) & 0x007F) * (((msg.extractPayloadByte(2) & 0x0080) > 0) ? -1 : 1);
                            //sys.general.options.waterTempAdj1 = (msg.extractPayloadByte(3) & 0x007F) * (((msg.extractPayloadByte(3) & 0x0080) > 0) ? -1 : 1);
                            //sys.general.options.solarTempAdj1 = (msg.extractPayloadByte(4) & 0x007F) * (((msg.extractPayloadByte(4) & 0x0080) > 0) ? -1 : 1);
                            //sys.general.options.airTempAdj = (msg.extractPayloadByte(5) & 0x007F) * (((msg.extractPayloadByte(5) & 0x0080) > 0) ? -1 : 1);
                            //sys.general.options.waterTempAdj2 = (msg.extractPayloadByte(6) & 0x007F) * (((msg.extractPayloadByte(6) & 0x0080) > 0) ? -1 : 1);

                            // Somewhere in here are the units.

                            let body = sys.bodies.getItemById(1, sys.equipment.maxBodies > 0);
                            body.heatMode = msg.extractPayloadByte(24);
                            body.heatSetpoint = msg.extractPayloadByte(20);
                            body.coolSetpoint = msg.extractPayloadByte(21);

                            body = sys.bodies.getItemById(2, sys.equipment.maxBodies > 1);
                            body.heatMode = msg.extractPayloadByte(25);
                            body.heatSetpoint = msg.extractPayloadByte(22);
                            body.coolSetpoint = msg.extractPayloadByte(23);

                            //body = sys.bodies.getItemById(3, sys.equipment.maxBodies > 2);
                            //body.heatMode = msg.extractPayloadByte(26);
                            //body.heatSetpoint = msg.extractPayloadByte(21);
                            //body.manualHeat = sys.general.options.manualHeat;
                            //body = sys.bodies.getItemById(4, sys.equipment.maxBodies > 3);
                            //body.heatMode = msg.extractPayloadByte(27);
                            //body.heatSetpoint = msg.extractPayloadByte(23);
                            msg.isProcessed = true;
                            break;
                        }
                    case 1: // Vacation mode
                        let yy = msg.extractPayloadByte(4) + 2000;
                        let mm = msg.extractPayloadByte(5);
                        let dd = msg.extractPayloadByte(6);
                        sys.general.options.vacation.startDate = new Date(yy, mm - 1, dd);
                        yy = msg.extractPayloadByte(7) + 2000;
                        mm = msg.extractPayloadByte(8);
                        dd = msg.extractPayloadByte(9);
                        sys.general.options.vacation.endDate = new Date(yy, mm - 1, dd);
                        sys.general.options.vacation.enabled = msg.extractPayloadByte(2) > 0;
                        sys.general.options.vacation.useTimeframe = msg.extractPayloadByte(3) > 0;
                        msg.isProcessed = true;
                        break;
                }
                msg.isProcessed = true;
                break;
        }
    }
    private static processIntelliTouch(msg: Inbound) {
        switch (msg.action) {
            case 30: {
                // sample packet
                // [165,33,15,16,30,16],[4,9,16,0,1,72,0,0,16,205,0,0,0,2,0,0],[2,88]
                // this is (I believe) to assign circuits that require high speed mode with a dual speed pump

                // We don't want the dual speed pump to even exist unless there are no circuit controlling it.
                // It should not be showing up in our pumps list or emitting state unless the user has defined
                // circuits to it on *Touch interfaces.
                let arrCircuits = [];
                let pump = sys.pumps.getDualSpeed(true);
                for (let i = 0; i <= 3; i++) {
                    let val = msg.extractPayloadByte(i);
                    if (val > 0) arrCircuits.push(val);
                    else pump.circuits.removeItemById(i);
                }
                if (arrCircuits.length > 0) {
                    let pump = sys.pumps.getDualSpeed(true);
                    for (let j = 1; j <= arrCircuits.length; j++) pump.circuits.getItemById(j, true).circuit = arrCircuits[j];
                }
                else sys.pumps.removeItemById(10);
                msg.isProcessed = true;
                break;
            }
            case 40:
            case 168:    
            {

                // [165,33,16,34,168,10],[0,0,0,254,0,0,0,0,0,0],[2,168 = manual heat mode off
                // [165,33,16,34,168,10],[0,0,0,254,1,0,0,0,0,0],[2,169] = manual heat mode on
                sys.general.options.manualHeat = msg.extractPayloadByte(4) === 1;
                // From https://github.com/tagyoureit/nodejs-poolController/issues/362 = Intellitouch
                // [0,0,0,0,1,x,0,0,0,0]  x=0 Manual OP heat Off; x=1 Manual OP heat On 
                sys.general.options.manualPriority = msg.extractPayloadByte(5) === 1;
                if ((msg.extractPayloadByte(3) & 0x01) === 1) {
                    // only support for 1 ic with EasyTouch
                    let chem = sys.chemControllers.getItemByAddress(144, true);
                    //let schem = state.chemControllers.getItemById(chem.id, true);
                    chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
                    chem.ph.tank.units = chem.orp.tank.units = '';
                    
                }
                else {
                    if (sys.controllerType !== ControllerType.SunTouch) {
                        let chem = sys.chemControllers.getItemByAddress(144);
                        state.chemControllers.removeItemById(chem.id);
                        sys.chemControllers.removeItemById(chem.id);
                    }
                }
                msg.isProcessed = true;
                break;
            }
        }
    }
}