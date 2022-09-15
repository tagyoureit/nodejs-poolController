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
import { state } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";
import { logger } from "../../../../logger/Logger";
import { webApp } from "../../../../web/Server";
import { Timestamp, utils } from "../../../Constants"
export class IntelliChemStateMessage {
    public static process(msg: Inbound) {
        if (sys.controllerType === ControllerType.Unknown) return;
        let address = (msg.dest >= 144 && msg.dest <= 158) ? msg.dest : msg.source;
        if (address < 144 || address > 158) return;
        let controller = sys.chemControllers.getItemByAddress(address);
        // RKS: 07-13-22 Lets just assume that SunTouch doesn't report its IntelliChem at this point.  The action 40 return
        // does not contain the IntelliChem bit when it is returned for this controller.
        if (!controller.isActive && sys.controllerType !== ControllerType.SunTouch) {
            msg.isProcessed = true;
            return;
        }
        switch (msg.action) {
            // ---------- IntelliChem Control panel is spitting out its status ----------- //
            case 18: // IntelliChem is sending us it's status.
                IntelliChemStateMessage.processState(msg);
                break;
            case 210: // OCP is asking IntelliChem controller for it's current status info.
                // [165,0,144,16,210,1],[210],[2,234]
                let schem = state.chemControllers.getItemById(controller.id);
                if (schem.lastComm + (30 * 1000) < new Date().getTime()) {
                    // We have not talked to the chem controller in 30 seconds so we have lost communication.
                    schem.status = schem.alarms.comms = 1;
                }
                msg.isProcessed = true;
                break;
            // ---------- End IntelliChem set get ----------- //

            // ---------- OCP set get ----------- //
            case 19: // Request to OCP to return the status that ic currently has.
                // [165,14,16,34,19,1],[0],[0,249]
                break;

            /* RKS: This is processed in the IntellichemMessage.processTouch() and is the results of asking for the IntelliChem configuration.
            case 147: // OCP is broadcasting it's known ic values...  Need to change our settings if virtual.
                // 147 is a proto:broadcast message;
                // it has exactly the same format as 18 but there is payload[0] which is inserted at the beginning.  Likely the chem controller id.
                if (msg.dest < 144 || msg.dest > 158) return;
                IntelliChemStateMessage.processControllerChange(msg);
                break;
            // ---------- End OCP set get ----------- //
            */
            // ---------- ICP or SL set get ----------- //
            case 211: // SL or other controller is telling OCP to set IntelliChem value
                // It will take these values and pass them in 146 to IntelliChem
                // values that are NOT SET should be ignored
                msg.isProcessed = true;
                break;
            case 146: // OCP is telling IntelliChem that it needs to change its settings to...
                //let scontroller = state.chemControllers.getItemById(controller.id, true);
                //if (scontroller.lastComm + (30 * 1000) < new Date().getTime()) {
                //    // We have not talked to the chem controller in 30 seconds so we have lost communication.
                //    scontroller.status = scontroller.alarms.comms = 1;
                //}
                controller.ph.tank.capacity = controller.orp.tank.capacity = 6;
                controller.ph.tank.units = controller.orp.tank.units = '';
                msg.isProcessed = true;
                break;
            // ---------- OCP set get ----------- //
        }
        state.emitEquipmentChanges();
    }
    private static processControllerChange(msg: Inbound) {
        // We don't do anything with this inbound action 147 message.
        logger.info(`Incoming message from IntelliChem ${msg.toShortPacket()}`);
        msg.isProcessed = true;
    }
    private static processState(msg: Inbound) {
        if (msg.source < 144 || msg.source > 158) return;

        // Setup with CO2 dosing and IntelliChlor.  
        //[2, 245, 2, 162, 2, 248, 2,  88, 0, 0, [0-9]
        // 0, 26, 0, 0, 0, 0, 0, 0, 0, 0,        [10-19]
        // 7, 0, 249, 1, 94, 0, 81, 0, 80, 57,   [20-29] 
        // 0, 82, 0, 0, 162, 32, 80, 1, 0, 0, 0] [30-40]
        // Setup with 2 Tanks
        //[2, 238, 2, 208, 2, 248, 2, 188, 0, 0, 
        // 0, 2, 0, 0, 0, 29, 0, 4, 0, 63,
        // 2, 2, 157, 0, 25, 0, 0, 0, 90, 20, 
        // 0, 83, 0, 0, 149, 0, 60, 1, 1, 0, 0]

        // This is an action 18 that comes from IntelliChem.  There is also a 147 that comes from an OCP but this is the raw data.
        //[165, 0, 16, 144, 18, 41][2,228,3,2,2,228,2,188,0,0,0,16,0,0,0,0,0,35,0,0,6,6,3,0,250,0,44,0,160,20,0,81,8,0,149,0,80,1,0,0,0]
        //      Bytes - Descrption
        //      0-1 : pH byte(0) x 256 + byte(1) / 100
        //      2-3 : ORP byte(2) x 256 + byte(3)
        //      4-5 : pH Setpoint : byte(4) x 256 + byte(5) / 100
        //      6-7 : ORP Setpoint : byte(6) x 256 + byte(7)
        //      8 : Unknown = 0
        //      9 : Unknown = 0
        //      10-11 : pH Dose time seconds. The number of seconds since the dose started. byte(10) x 256 + byte(11)
        //      12: Unknown
        //      13 : Unknown
        //      14-15 : ORP Dose time seconds.  The number of seconds since the dose started. byte(14) x 256 + byte(15)
        //      16-17 : pH Dose volume (unknown units) - These appear to be mL.
        //      18-19 : ORP Dose volume (unknown units) - These appear to be mL
        //      20 : pH tank level 1-7
        //      21 : ORP tank level 1-7
        //      22 : LSI. (byte(22) & 0x80) === 0x80 ? (256 - byte(22) / -100 : byte(22)/100
        //      23-24 : Calcium Hardness = byte(23) x 256 + byte(24) = 250
        //      25 : Unknown = 0 (probably reserved CYA byte so the chem is always dealing with integers)
        //      26 : CYA Max value = 210.
        //      27-28 : Alkalinity = byte(27) x 256 + byte(28)
        //      29 : Salt level = byte(29) x 50
        //      30 : Unknown
        //      31 : Temperature
        //      32 : Alarms
        //      33 : Warnings pH Lockout, Daily Limit Reached, Invalid Setup, Chlorinator Comm error
        //      34 : Dosing Status/Doser Type (pH Monitoring, ORP Mixing)
        //      35 : Delays
        //      36-37 : Firmware = 80,1 = 1.080
        //      38 : Water Chemistry Warning (Corrosion...)
        //      39 : Unknown
        //      40 : Unknown
        let address = msg.source;

        // The address is king here.  The id is not.
        let chem = sys.chemControllers.getItemByAddress(address, true);
        let schem = state.chemControllers.getItemById(chem.id, true);

        // Get the doser types and set up our capabilities
        chem.ph.doserType = (msg.extractPayloadByte(34) & 0x03);
        chem.orp.doserType = (msg.extractPayloadByte(34) & 0x0C) >> 2;
        schem.ph.enabled = chem.ph.enabled = chem.ph.doserType !== 0;
        schem.ph.enabled = chem.orp.enabled = chem.orp.doserType !== 0;
        if (chem.ph.doserType === 2) schem.ph.chemType = 'CO2';
        else if (chem.ph.doserType === 0) schem.ph.chemType = 'none';
        else if (chem.ph.doserType === 1) schem.ph.chemType = 'acid';
        else if (chem.ph.doserType === 3) schem.ph.chemType = 'acid';

        if (chem.orp.doserType === 0) schem.orp.chemType = 'none';
        else schem.orp.chemType = 'orp';

        schem.isActive = chem.isActive = true;
        schem.status = 0;
        schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.getValue('intellichem');
        chem.name = chem.name || `IntelliChem ${chem.address - 143}`; // default to true id if no name is set
        schem.lastComm = new Date().getTime();
        schem.status = schem.alarms.comms = 0;
        chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
        chem.ph.tank.units = chem.orp.tank.units = '';
        chem.ph.tank.alarmEmptyEnabled = false;
        chem.ph.tank.alarmEmptyLevel = 1;
        chem.orp.tank.alarmEmptyEnabled = false;
        chem.orp.tank.alarmEmptyLevel = 1;
        schem.address = chem.address;
        schem.ph.level = schem.ph.probe.level = msg.extractPayloadIntBE(0) / 100;
        schem.orp.level = schem.orp.probe.level = msg.extractPayloadIntBE(2);
        chem.ph.setpoint = msg.extractPayloadIntBE(4) / 100;
        chem.orp.setpoint = msg.extractPayloadIntBE(6);
        // Missing information on the related bytes.
        // Bytes 8-14 (Probably Total Dissolved Solids in here if no IntelliChlor)
        let phPrev = { status: schem.ph.dosingStatus, time: schem.ph.timeDosed || 0, vol: schem.ph.volumeDosed };
        let orpPrev = { status: schem.orp.dosingStatus, time: schem.orp.timeDosed || 0, vol: schem.orp.volumeDosed };
        // IntelliChem never tells us what the dose time or volume is so we will let that dog lie.
        //      10-11 : pH Dose time
        schem.ph.timeDosed = (msg.extractPayloadByte(10) * 256) + msg.extractPayloadByte(11);
        //      14-15 : ORP Dose time seconds.  The number of seconds since the dose started.
        schem.orp.timeDosed = (msg.extractPayloadByte(14) * 256) + msg.extractPayloadByte(15);
        //      16-17 : pH Dose volume (unknown units) = 35
        schem.ph.volumeDosed = (msg.extractPayloadByte(16) * 256) + msg.extractPayloadByte(17);
        //      18-19 : ORP Dose volume (unknown units) = 0
        schem.orp.volumeDosed = (msg.extractPayloadByte(18) * 256) + msg.extractPayloadByte(19);
        //      20 : pH tank level 1-7 = 6
        schem.ph.tank.level = Math.max(msg.extractPayloadByte(20) > 0 ? msg.extractPayloadByte(20) - 1 : msg.extractPayloadByte(20), 0); // values reported as 1-7; possibly 0 if no tank present
        //      21 : ORP tank level 1-7 = 6 if the tank levels report 0 then the chemical side is not enabled.
        schem.orp.tank.level = Math.max(msg.extractPayloadByte(21) > 0 ? msg.extractPayloadByte(21) - 1 : msg.extractPayloadByte(21), 0); // values reported as 1-7; possibly 0 if no tank present

        //      22 : LSI = 3 & 0x80 === 0x80 ? (256 - 3) / -100 : 3/100 = .03
        let lsi = msg.extractPayloadByte(22);
        schem.lsi = (lsi & 0x80) === 0x80 ? (256 - lsi) / -100 : lsi / 100;
        //      23-24 : Calcium Hardness = 0x256+250 = 250
        chem.calciumHardness = (msg.extractPayloadByte(23) * 256) + msg.extractPayloadByte(24);
        //      26 : CYA = 44
        chem.cyanuricAcid = msg.extractPayloadByte(26);
        //      27-28 : Alkalinity
        chem.alkalinity = (msg.extractPayloadByte(27) * 256) + msg.extractPayloadByte(28);
        //      29 : Salt level = 20
        if (sys.chlorinators.length > 0) {
            let chlor = state.chlorinators.find(elem => elem.id === 1);
            schem.orp.probe.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(29) * 50;
        }
        else schem.orp.probe.saltLevel = 0;
        //      31 : Temperature = 81
        schem.ph.probe.temperature = msg.extractPayloadByte(31);
        schem.ph.probe.tempUnits = state.temps.units;
        //      32 : Alarms = 8 = (no alarm)
        const alarms = schem.alarms;
        alarms.flow = msg.extractPayloadByte(32) & 0x01;
        if (alarms.flow === 0) schem.flowDetected = true;

        // The pH and ORP alarms are in a word stupid for IntelliChem.  So we are
        // going to override these.
        //alarms.pH = msg.extractPayloadByte(32) & 0x06;
        //alarms.orp = msg.extractPayloadByte(32) & 0x18;
        if (chem.ph.tolerance.enabled && schem.flowDetected) {
            if (schem.ph.level > chem.ph.tolerance.high) alarms.pH = 2;
            else if (schem.ph.level < chem.ph.tolerance.low) alarms.pH = 4;
            else alarms.pH = 0;
        }
        else alarms.pH = 0;
        if (chem.orp.tolerance.enabled && schem.flowDetected) {
            if (schem.orp.level > chem.orp.tolerance.high) alarms.orp = 8;
            else if (schem.orp.level < chem.orp.tolerance.low) alarms.orp = 16;
            else alarms.orp = 0;
        }
        else alarms.orp = 0;
        // IntelliChem will still send a tank empty alarm even if there is no tank.
        alarms.pHTank = (chem.ph.enabled && (chem.ph.doserType === 1 || chem.ph.doserType === 3)) ? msg.extractPayloadByte(32) & 0x20 : 0;
        alarms.orpTank = (chem.orp.enabled && (chem.orp.doserType === 1 || chem.orp.doserType === 3)) ? msg.extractPayloadByte(32) & 0x40 : 0;
        alarms.probeFault = msg.extractPayloadByte(32) & 0x80;
        //      33 : Warnings -- pH Lockout, Daily Limit Reached, Invalid Setup, Chlorinator Comm error
        const warnings = schem.warnings;
        warnings.pHLockout = msg.extractPayloadByte(33) & 0x01;
        warnings.pHDailyLimitReached = msg.extractPayloadByte(33) & 0x02;
        warnings.orpDailyLimitReached = msg.extractPayloadByte(33) & 0x04;
        warnings.invalidSetup = msg.extractPayloadByte(33) & 0x08;
        warnings.chlorinatorCommError = msg.extractPayloadByte(33) & 0x10;
        // So we need to do some calculation here.

        //      34 : Dosing Status = 149 = (pH Monitoring, ORP Mixing)
        schem.ph.dosingStatus = (msg.extractPayloadByte(34) & 0x30) >> 4; // mask 00xx0000 and shift bit 5 & 6
        schem.orp.dosingStatus = (msg.extractPayloadByte(34) & 0xC0) >> 6; // mask xx000000 and shift bit 7 & 8
        //      35 : Delays = 0
        schem.status = (msg.extractPayloadByte(35) & 0x80) >> 7; // to be verified as comms lost
        schem.ph.manualDosing = (msg.extractPayloadByte(35) & 0x08) === 1 ? true : false;
        chem.orp.useChlorinator = (msg.extractPayloadByte(35) & 0x10) === 1 ? true : false;
        chem.HMIAdvancedDisplay = (msg.extractPayloadByte(35) & 0x20) === 1 ? true : false;
        chem.ph.phSupply = (msg.extractPayloadByte(35) & 0x40) === 1 ? 'acid' : 'base'; // acid pH dosing = 1; base pH dosing = 0;
        //      36-37 : Firmware = 80,1 = 1.080
        chem.firmware = `${msg.extractPayloadByte(37)}.${msg.extractPayloadByte(36).toString().padStart(3, '0')}`
        //      38 : Water Chemistry Warning
        // The LSI handling is also stupid with IntelliChem so we are going to have our way with it.
        // schem.warnings.waterChemistry = msg.extractPayloadByte(38);
        schem.calculateSaturationIndex();
        if (schem.saturationIndex > chem.lsiRange.high) schem.warnings.waterChemistry = 2;
        else if (schem.saturationIndex < chem.lsiRange.low) schem.warnings.waterChemistry = 1;
        else schem.warnings.waterChemistry = 0;
        if (typeof chem.body === 'undefined') chem.body = schem.body = 0;
        if (state.equipment.controllerType === 'nixie') {
            if (chem.ph.probe.feedBodyTemp) {
                let temps: any = {};
                let body = state.temps.bodies.getBodyIsOn();
                if (typeof body !== 'undefined') {
                    if (body.id === 1 && (schem.body === 0 || schem.body === 32)) {
                        temps.waterSensor1 = schem.ph.probe.temperature;
                    }
                    else if (body.id === 2 && (schem.body === 2 || schem.body === 32)) {
                        temps.waterSensor1 = schem.ph.probe.temperature;
                    }
                    else if (body.id === 2 && chem.body === 1) {
                        temps.waterSensor2 = schem.ph.probe.temperature;
                    }
                }
                sys.board.system.setTempsAsync(temps).catch(err => logger.error(`Error setting temp compensation for IntelliChem State: ${err.message}`))
            }
        }
        schem.ph.pump.isDosing = schem.ph.dosingStatus === 0 && chem.ph.enabled;
        schem.orp.pump.isDosing = schem.orp.dosingStatus === 0 && chem.orp.enabled;
        schem.lastComm = new Date().getTime();
        // If we are changing states lets set that up.
        if (schem.ph.dosingStatus === 0 && phPrev.status !== 0) {
            if (schem.ph.dosingStatus === 0) {
                // We are starting a dose so we need to set the current dose.
                schem.ph.startDose(Timestamp.now.addSeconds(-schem.ph.doseTime).toDate(), schem.ph.manualDosing ? 'manual' : 'auto', 0, schem.ph.volumeDosed, 0, schem.ph.timeDosed * 1000);
            }
        }
        else if (schem.ph.dosingStatus !== 0 && phPrev.status === 0) {
            if (typeof schem.ph.currentDose !== 'undefined') {
                // We just ended a dose so write it out to the chem logs.
                schem.ph.endDose(Timestamp.now.addSeconds(-(schem.ph.doseTime - phPrev.time)).toDate(), 'completed',
                    schem.ph.volumeDosed - phPrev.vol, (schem.ph.timeDosed - phPrev.time) * 1000);
            }
        }
        else if (schem.ph.dosingStatus === 0) {
            // We are still dosing so add the time and volume to the dose.
            schem.ph.appendDose(schem.ph.doseVolume - phPrev.vol, (schem.ph.timeDosed - phPrev.time) * 1000);
        }
        else {
            //console.log(`DOSING STATUS === ${schem.ph.dosingStatus}`);
            // Make sure we don't have a current dose going.
            schem.ph.currentDose = undefined;
        }
        // If we are changing states lets set that up for orp.
        if (schem.orp.dosingStatus === 0 && orpPrev.status !== 0) {
            if (schem.orp.dosingStatus === 0) {
                // We are starting a dose so we need to set the current dose.
                schem.orp.startDose(Timestamp.now.addSeconds(-schem.orp.doseTime).toDate(), schem.orp.manualDosing ? 'manual' : 'auto', 0, schem.orp.volumeDosed, 0, schem.orp.timeDosed * 1000);
            }
        }
        else if (schem.orp.dosingStatus !== 0 && orpPrev.status === 0) {
            if (typeof schem.orp.currentDose !== 'undefined') {
                // We just ended a dose so write it out to the chem logs.
                schem.orp.endDose(Timestamp.now.addSeconds(-(schem.orp.doseTime - orpPrev.time)).toDate(), 'completed',
                    schem.orp.volumeDosed - orpPrev.vol, (schem.orp.timeDosed - orpPrev.time) * 1000);
            }
        }
        else if (schem.orp.dosingStatus === 0) {
            // We are still dosing so add the time and volume to the dose.
            schem.orp.appendDose(schem.orp.doseVolume - orpPrev.vol, (schem.orp.timeDosed - orpPrev.time) * 1000);
        }
        else {
            // Make sure we don't have a current dose going.
            schem.orp.currentDose = undefined;
        }
        // manually emit extended values
        webApp.emitToClients('chemController', schem.getExtended()); // emit extended data
        schem.hasChanged = false; // try to avoid duplicate emits
        msg.isProcessed = true;

        /*
        //Status 0x12 (18) - Intellichem Status (length 41)
        example:
                              02 E3 02  AF 02  EE  02  BC 00  00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01 90 00  00 00 96 14  00  51 00 00 65 20 3C  01 00 00 00

                               0   1 2   3 4   5 6   7 8 9 10 11 12 13 14  15 16 17 18 19 20 21  22 23  24 25 26 27  28 29 30  31 32 33  34  35 36  37 38 39 40 
        [165,16,15,16,18 41], [2 227 2 175 2 238 2 188 0 0  0  2  0  0  0  42  0  4  0 92  6  5  24  1 144  0  0  0 150 20  0  81  0  0 101  32 60   1  0  0  0]
                               ph--- orp-- ph--- orp--                                     tanks     CH---    CYA TA---    Wtr          MODE
        0-1 pH(1-2) / ORP(8-9) reading
        02 E3 - pH 2*256 + e3(227) = 739
        02 AF - ORP 2*256 + af(175) = 687

        4-5 pH settings
        D0 = 7.2 (hi/lo bits - 720 = 7.2pH)
        DA = 7.3
        E4 = 7.4
        EE = 7.5
        F8 = 7.6

        6-7 ORP settings
        02 BC = 700 (hi/lo bits)

        20-21 Tank levels; 21 is acid? 22 is chlorine?
        06 and 05

        23-24 Calcimum Hardness
        90 is CH (90 = 400; 8b = 395) hi/lo bits

        26
        00 is CYA (00 = 0; 9 = 9; c9 = 201) (does not appear to have hi/lo - 201 is max

        27-28 - Total Alkalinity
        96 is TA (96 = 150)

        30 - Water Flow Alarm (00 is ok; 01 is no flow)
        00 flow is OK
        01 flow is Alarm on (Water STOPPED)

        // todo: these are probably 2-byte status message but need to confirm
        36 Mode
        0x25 dosing (auto)?
        0x45 dosing acid (manually?)
        0x55 mixing???
        0x65 monitoring
        0x02 (12 when mixing) and 04 (27 when mixing) related???

        37
        20 Nothing
        22 Dosing Chlorine(?)
        */


        //// Missing information on the related bytes.
        //// Bytes 8-14 (Probably Total Dissolved Solids in here if no IntelliChlor)
        //// controller.waterVolume = msg.extractPayloadByte(15) * 1000;
        //// Bytes 16-19
        //scontroller.ph.dosingVolumeRemaining = msg.extractPayloadByte(17); // Previous pH Dose volume
        //scontroller.orp.dosingVolumeRemaining = msg.extractPayloadByte(19); // Previous ORP Dose volume
        //scontroller.ph.tank.level = Math.max(msg.extractPayloadByte(20) > 0 ? msg.extractPayloadByte(20) - 1 : msg.extractPayloadByte(20), 0); // values reported as 1-7; possibly 0 if no tank present
        //scontroller.orp.tank.level = Math.max(msg.extractPayloadByte(21) > 0 ? msg.extractPayloadByte(21) - 1 : msg.extractPayloadByte(21), 0); // values reported as 1-7; possibly 0 if no tank present
        //let SIRaw = msg.extractPayloadByte(22);
        //if ((SIRaw & 0x80) === 0x80) {
        //    // negative SI
        //    scontroller.saturationIndex = (256 - SIRaw) / -100;
        //}
        //else {
        //    scontroller.saturationIndex = msg.extractPayloadByte(22) / 100;
        //}
        //controller.calciumHardness = msg.extractPayloadIntBE(23);

        //// scontroller.status2 = msg.extractPayloadByte(25); // remove/unsure?
        //controller.cyanuricAcid = msg.extractPayloadByte(26);
        //controller.alkalinity = msg.extractPayloadIntBE(27);

        //// scontroller.waterFlow = msg.extractPayloadByte(30); // This is probably the temp units.
        //scontroller.ph.probe.tempUnits = 0;//msg.extractPayloadByte(30);  See Above.  This is probably the units.
        //scontroller.ph.probe.temperature = msg.extractPayloadByte(31);

        //msg.extractPayloadByte(33);

        ////   [0, { name: 'dosing', desc: 'Dosing' }],
        ////   [1, { name: 'monitoring', desc: 'Monitoring' }],
        ////   [2, { name: 'mixing', desc: 'Mixing' }]

        //scontroller.ph.dosingStatus = (msg.extractPayloadByte(34) & 0x30) >> 4; // mask 00xx0000 and shift bit 5 & 6
        //scontroller.orp.dosingStatus = (msg.extractPayloadByte(34) & 0xC0) >> 6; // mask xx000000 and shift bit 7 & 8
        //scontroller.ph.flowDelay = scontroller.orp.flowDelay = (msg.extractPayloadByte(35) & 0x02) === 1 ? true : false;
        //scontroller.status = msg.extractPayloadByte(35) & 0x80 >> 7; // to be verified as comms lost
        //scontroller.ph.manualDosing = (msg.extractPayloadByte(35) & 0x08) === 1 ? true : false;
        //controller.orp.useChlorinator = (msg.extractPayloadByte(35) & 0x10) === 1 ? true : false;
        //controller.HMIAdvancedDisplay = (msg.extractPayloadByte(35) & 0x20) === 1 ? true : false;
        //controller.ph.phSupply = (msg.extractPayloadByte(35) & 0x40) === 1 ? true : false; // acid pH dosing = 1; base pH dosing = 0;
        //scontroller.firmware = `${msg.extractPayloadByte(37)}.${msg.extractPayloadByte(36).toString().padStart(3, '0')}`

        //const warnings = scontroller.warnings;
        //warnings.waterChemistry = msg.extractPayloadByte(38);
        //warnings.pHLockout = msg.extractPayloadByte(33) & 0x01;
        //warnings.pHDailyLimitReached = msg.extractPayloadByte(33) & 0x02;
        //warnings.orpDailyLimitReached = msg.extractPayloadByte(33) & 0x04;
        //warnings.invalidSetup = msg.extractPayloadByte(33) & 0x08;
        //warnings.chlorinatorCommError = msg.extractPayloadByte(33) & 0x10;

        //// RKS: This should really match against the body for the chlorinator when *Chem thinks it has been provided TDS.
        //// RG: Byte 35, bit 4 indicates IntelliChlor is used.  Until we know more, this logic suffices.
        //if (sys.chlorinators.length > 0) {
        //    let chlor = state.chlorinators.find(elem => elem.id === 1);
        //    scontroller.orp.probe.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(29) * 50;
        //}
        //else scontroller.orp.probe.saltLevel = 0;

        //// manually emit extended values
        //webApp.emitToClients('chemController', scontroller.getExtended()); // emit extended data
        //scontroller.hasChanged = false; // try to avoid duplicate emits
        //msg.isProcessed = true;
    }
}