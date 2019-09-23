import * as extend from 'extend';
import { EventEmitter } from 'events';
import { SystemBoard, byteValueMap, ConfigQueue, ConfigRequest } from './SystemBoard';
import { PoolSystem, Body, Heater, Pump, sys } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { state } from '../State';
import { Enums } from '../Constants';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';
export class EasyTouchBoard extends SystemBoard {
    private _configQueue: TouchConfigQueue = new TouchConfigQueue();
    constructor(system: PoolSystem) {
        super(system);
        this.valueMaps.circuitNames = new byteValueMap([
            [0, { name: 'notused', desc: 'NOT USED' }],
            [1, { name: 'aerator', desc: 'AERATOR' }],
            [2, { name: 'airblower', desc: 'AIR BLOWER' }],
            [3, { name: 'aux1', desc: 'AUX 1' }],
            [4, { name: 'aux2', desc: 'AUX 2' }],
            [5, { name: 'aux3', desc: 'AUX 3' }],
            [6, { name: 'aux4', desc: 'AUX 4' }],
            [7, { name: 'aux5', desc: 'AUX 5' }],
            [8, { name: 'aux6', desc: 'AUX 6' }],
            [9, { name: 'aux7', desc: 'AUX 7' }],
            [10, { name: 'aux8', desc: 'AUX 8' }],
            [11, { name: 'aux9', desc: 'AUX 9' }],
            [12, { name: 'auk10', desc: 'AUX 10' }],
            [13, { name: 'backwash', desc: 'BACKWASH' }],
            [14, { name: 'backlight', desc: 'BACK LIGHT' }],
            [15, { name: 'bbqlight', desc: 'BBQ LIGHT' }],
            [16, { name: 'beachlight', desc: 'BEACH LIGHT' }],
            [17, { name: 'boosterpump', desc: 'BOOSTER PUMP' }],
            [18, { name: 'buglight', desc: 'BUG LIGHT' }],
            [19, { name: 'cabanalts', desc: 'CABANA LTS' }],
            [20, { name: 'chem.feeder', desc: 'CHEM. FEEDER' }],
            [21, { name: 'chlorinator', desc: 'CHLORINATOR' }],
            [22, { name: 'cleaner', desc: 'CLEANER' }],
            [23, { name: 'colorwheel', desc: 'COLOR WHEEL' }],
            [24, { name: 'decklight', desc: 'DECK LIGHT' }],
            [25, { name: 'drainline', desc: 'DRAIN LINE' }],
            [26, { name: 'drivelight', desc: 'DRIVE LIGHT' }],
            [27, { name: 'edgepump', desc: 'EDGE PUMP' }],
            [28, { name: 'entrylight', desc: 'ENTRY LIGHT' }],
            [29, { name: 'fan', desc: 'FAN' }],
            [30, { name: 'fiberoptic', desc: 'FIBER OPTIC' }],
            [31, { name: 'fiberworks', desc: 'FIBER WORKS' }],
            [32, { name: 'fillline', desc: 'FILL LINE' }],
            [33, { name: 'floorclnr', desc: 'FLOOR CLNR' }],
            [34, { name: 'fogger', desc: 'FOGGER' }],
            [35, { name: 'fountain', desc: 'FOUNTAIN' }],
            [36, { name: 'fountain1', desc: 'FOUNTAIN 1' }],
            [37, { name: 'fountain2', desc: 'FOUNTAIN 2' }],
            [38, { name: 'fountain3', desc: 'FOUNTAIN 3' }],
            [39, { name: 'fountains', desc: 'FOUNTAINS' }],
            [40, { name: 'frontlight', desc: 'FRONT LIGHT' }],
            [41, { name: 'gardenlts', desc: 'GARDEN LTS' }],
            [42, { name: 'gazebolts', desc: 'GAZEBO LTS' }],
            [43, { name: 'highspeed', desc: 'HIGH SPEED' }],
            [44, { name: 'hi-temp', desc: 'HI-TEMP' }],
            [45, { name: 'houselight', desc: 'HOUSE LIGHT' }],
            [46, { name: 'jets', desc: 'JETS' }],
            [47, { name: 'lights', desc: 'LIGHTS' }],
            [48, { name: 'lowspeed', desc: 'LOW SPEED' }],
            [49, { name: 'lo-temp', desc: 'LO-TEMP' }],
            [50, { name: 'malibults', desc: 'MALIBU LTS' }],
            [51, { name: 'mist', desc: 'MIST' }],
            [52, { name: 'music', desc: 'MUSIC' }],
            [53, { name: 'notused', desc: 'NOT USED' }],
            [54, { name: 'ozonator', desc: 'OZONATOR' }],
            [55, { name: 'pathlightn', desc: 'PATH LIGHTS' }],
            [56, { name: 'patiolts', desc: 'PATIO LTS' }],
            [57, { name: 'perimeterl', desc: 'PERIMETER L' }],
            [58, { name: 'pg2000', desc: 'PG2000' }],
            [59, { name: 'pondlight', desc: 'POND LIGHT' }],
            [60, { name: 'poolpump', desc: 'POOL PUMP' }],
            [61, { name: 'pool', desc: 'POOL' }],
            [62, { name: 'poolhigh', desc: 'POOL HIGH' }],
            [63, { name: 'poollight', desc: 'POOL LIGHT' }],
            [64, { name: 'poollow', desc: 'POOL LOW' }],
            [65, { name: 'sam', desc: 'SAM' }],
            [66, { name: 'poolsam1', desc: 'POOL SAM 1' }],
            [67, { name: 'poolsam2', desc: 'POOL SAM 2' }],
            [68, { name: 'poolsam3', desc: 'POOL SAM 3' }],
            [69, { name: 'securitylt', desc: 'SECURITY LT' }],
            [70, { name: 'slide', desc: 'SLIDE' }],
            [71, { name: 'solar', desc: 'SOLAR' }],
            [72, { name: 'spa', desc: 'SPA' }],
            [73, { name: 'spahigh', desc: 'SPA HIGH' }],
            [74, { name: 'spalight', desc: 'SPA LIGHT' }],
            [75, { name: 'spalow', desc: 'SPA LOW' }],
            [76, { name: 'spasal', desc: 'SPA SAL' }],
            [77, { name: 'spasam', desc: 'SPA SAM' }],
            [78, { name: 'spawtrfll', desc: 'SPA WTRFLL' }],
            [79, { name: 'spillway', desc: 'SPILLWAY' }],
            [80, { name: 'sprinklers', desc: 'SPRINKLERS' }],
            [81, { name: 'stream', desc: 'STREAM' }],
            [82, { name: 'statuelt', desc: 'STATUE LT' }],
            [83, { name: 'swimjets', desc: 'SWIM JETS' }],
            [84, { name: 'wtrfeature', desc: 'WTR FEATURE' }],
            [85, { name: 'wtrfeatlt', desc: 'WTR FEAT LT' }],
            [86, { name: 'waterfall', desc: 'WATERFALL' }],
            [87, { name: 'waterfall1', desc: 'WATERFALL 1' }],
            [88, { name: 'waterfall2', desc: 'WATERFALL 2' }],
            [89, { name: 'waterfall3', desc: 'WATERFALL 3' }],
            [90, { name: 'whirlpool', desc: 'WHIRLPOOL' }],
            [91, { name: 'wtrflght', desc: 'WTRFL LGHT' }],
            [92, { name: 'yardlight', desc: 'YARD LIGHT' }],
            [93, { name: 'auxextra', desc: 'AUX EXTRA' }],
            [94, { name: 'feature1', desc: 'FEATURE 1' }],
            [95, { name: 'feature2', desc: 'FEATURE 2' }],
            [96, { name: 'feature3', desc: 'FEATURE 3' }],
            [97, { name: 'feature4', desc: 'FEATURE 4' }],
            [98, { name: 'feature5', desc: 'FEATURE 5' }],
            [99, { name: 'feature6', desc: 'FEATURE 6' }],
            [100, { name: 'feature7', desc: 'FEATURE 7' }],
            [101, { name: 'feature8', desc: 'FEATURE 8' }]
        ]);
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { name: 'notused', desc: 'NOT USED' }],
            [1, { name: 'aerator', desc: 'AERATOR' }],
            [2, { name: 'airblower', desc: 'AIR BLOWER' }],
            [3, { name: 'aux1', desc: 'AUX 1' }],
            [4, { name: 'aux2', desc: 'AUX 2' }],
            [5, { name: 'aux3', desc: 'AUX 3' }],
            [6, { name: 'aux4', desc: 'AUX 4' }],
            [7, { name: 'aux5', desc: 'AUX 5' }],
            [8, { name: 'aux6', desc: 'AUX 6' }],
            [9, { name: 'aux7', desc: 'AUX 7' }],
            [10, { name: 'aux8', desc: 'AUX 8' }],
            [11, { name: 'aux9', desc: 'AUX 9' }],
            [12, { name: 'auk10', desc: 'AUX 10' }],
            [13, { name: 'backwash', desc: 'BACKWASH' }],
            [14, { name: 'backlight', desc: 'BACK LIGHT' }],
            [15, { name: 'bbqlight', desc: 'BBQ LIGHT' }],
            [16, { name: 'beachlight', desc: 'BEACH LIGHT' }],
            [17, { name: 'boosterpump', desc: 'BOOSTER PUMP' }],
            [18, { name: 'buglight', desc: 'BUG LIGHT' }],
            [19, { name: 'cabanalts', desc: 'CABANA LTS' }],
            [20, { name: 'chem.feeder', desc: 'CHEM. FEEDER' }],
            [21, { name: 'chlorinator', desc: 'CHLORINATOR' }],
            [22, { name: 'cleaner', desc: 'CLEANER' }],
            [23, { name: 'colorwheel', desc: 'COLOR WHEEL' }],
            [24, { name: 'decklight', desc: 'DECK LIGHT' }],
            [25, { name: 'drainline', desc: 'DRAIN LINE' }],
            [26, { name: 'drivelight', desc: 'DRIVE LIGHT' }],
            [27, { name: 'edgepump', desc: 'EDGE PUMP' }],
            [28, { name: 'entrylight', desc: 'ENTRY LIGHT' }],
            [29, { name: 'fan', desc: 'FAN' }],
            [30, { name: 'fiberoptic', desc: 'FIBER OPTIC' }],
            [31, { name: 'fiberworks', desc: 'FIBER WORKS' }],
            [32, { name: 'fillline', desc: 'FILL LINE' }],
            [33, { name: 'floorclnr', desc: 'FLOOR CLNR' }],
            [34, { name: 'fogger', desc: 'FOGGER' }],
            [35, { name: 'fountain', desc: 'FOUNTAIN' }],
            [36, { name: 'fountain1', desc: 'FOUNTAIN 1' }],
            [37, { name: 'fountain2', desc: 'FOUNTAIN 2' }],
            [38, { name: 'fountain3', desc: 'FOUNTAIN 3' }],
            [39, { name: 'fountains', desc: 'FOUNTAINS' }],
            [40, { name: 'frontlight', desc: 'FRONT LIGHT' }],
            [41, { name: 'gardenlts', desc: 'GARDEN LTS' }],
            [42, { name: 'gazebolts', desc: 'GAZEBO LTS' }],
            [43, { name: 'highspeed', desc: 'HIGH SPEED' }],
            [44, { name: 'hi-temp', desc: 'HI-TEMP' }],
            [45, { name: 'houselight', desc: 'HOUSE LIGHT' }],
            [46, { name: 'jets', desc: 'JETS' }],
            [47, { name: 'lights', desc: 'LIGHTS' }],
            [48, { name: 'lowspeed', desc: 'LOW SPEED' }],
            [49, { name: 'lo-temp', desc: 'LO-TEMP' }],
            [50, { name: 'malibults', desc: 'MALIBU LTS' }],
            [51, { name: 'mist', desc: 'MIST' }],
            [52, { name: 'music', desc: 'MUSIC' }],
            [53, { name: 'notused', desc: 'NOT USED' }],
            [54, { name: 'ozonator', desc: 'OZONATOR' }],
            [55, { name: 'pathlightn', desc: 'PATH LIGHTS' }],
            [56, { name: 'patiolts', desc: 'PATIO LTS' }],
            [57, { name: 'perimeterl', desc: 'PERIMETER L' }],
            [58, { name: 'pg2000', desc: 'PG2000' }],
            [59, { name: 'pondlight', desc: 'POND LIGHT' }],
            [60, { name: 'poolpump', desc: 'POOL PUMP' }],
            [61, { name: 'pool', desc: 'POOL' }],
            [62, { name: 'poolhigh', desc: 'POOL HIGH' }],
            [63, { name: 'poollight', desc: 'POOL LIGHT' }],
            [64, { name: 'poollow', desc: 'POOL LOW' }],
            [65, { name: 'sam', desc: 'SAM' }],
            [66, { name: 'poolsam1', desc: 'POOL SAM 1' }],
            [67, { name: 'poolsam2', desc: 'POOL SAM 2' }],
            [68, { name: 'poolsam3', desc: 'POOL SAM 3' }],
            [69, { name: 'securitylt', desc: 'SECURITY LT' }],
            [70, { name: 'slide', desc: 'SLIDE' }],
            [71, { name: 'solar', desc: 'SOLAR' }],
            [72, { name: 'spa', desc: 'SPA' }],
            [73, { name: 'spahigh', desc: 'SPA HIGH' }],
            [74, { name: 'spalight', desc: 'SPA LIGHT' }],
            [75, { name: 'spalow', desc: 'SPA LOW' }],
            [76, { name: 'spasal', desc: 'SPA SAL' }],
            [77, { name: 'spasam', desc: 'SPA SAM' }],
            [78, { name: 'spawtrfll', desc: 'SPA WTRFLL' }],
            [79, { name: 'spillway', desc: 'SPILLWAY' }],
            [80, { name: 'sprinklers', desc: 'SPRINKLERS' }],
            [81, { name: 'stream', desc: 'STREAM' }],
            [82, { name: 'statuelt', desc: 'STATUE LT' }],
            [83, { name: 'swimjets', desc: 'SWIM JETS' }],
            [84, { name: 'wtrfeature', desc: 'WTR FEATURE' }],
            [85, { name: 'wtrfeatlt', desc: 'WTR FEAT LT' }],
            [86, { name: 'waterfall', desc: 'WATERFALL' }],
            [87, { name: 'waterfall1', desc: 'WATERFALL 1' }],
            [88, { name: 'waterfall2', desc: 'WATERFALL 2' }],
            [89, { name: 'waterfall3', desc: 'WATERFALL 3' }],
            [90, { name: 'whirlpool', desc: 'WHIRLPOOL' }],
            [91, { name: 'wtrflght', desc: 'WTRFL LGHT' }],
            [92, { name: 'yardlight', desc: 'YARD LIGHT' }],
            [93, { name: 'auxextra', desc: 'AUX EXTRA' }],
            [94, { name: 'feature1', desc: 'FEATURE 1' }],
            [95, { name: 'feature2', desc: 'FEATURE 2' }],
            [96, { name: 'feature3', desc: 'FEATURE 3' }],
            [97, { name: 'feature4', desc: 'FEATURE 4' }],
            [98, { name: 'feature5', desc: 'FEATURE 5' }],
            [99, { name: 'feature6', desc: 'FEATURE 6' }],
            [100, { name: 'feature7', desc: 'FEATURE 7' }],
            [101, { name: 'feature8', desc: 'FEATURE 8' }]
        ]);
        this.valueMaps.pumpTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No pump' }],
            [1, { name: 'vfsrs', desc: 'Intelliflo VF+SRS' }],
            [6, { name: 'vf', desc: 'Intelliflo VF' }],
            [64, { name: 'vsf', desc: 'Intelliflo VSF' }],
            [128, { name: 'vsf', desc: 'Intelliflo VSF' }]
        ]);
        this.valueMaps.lightThemes = new byteValueMap([
            [0, { name: 'white', desc: 'White' }],
            [2, { name: 'lightgreen', desc: 'Light Green' }],
            [4, { name: 'green', desc: 'Green' }],
            [6, { name: 'cyan', desc: 'Cyan' }],
            [8, { name: 'blue', desc: 'Blue' }],
            [10, { name: 'lavender', desc: 'Lavender' }],
            [12, { name: 'magenta', desc: 'Magenta' }],
            [14, { name: 'lightmagenta', desc: 'Light Magenta' }],
            [128, { name: 'colorsync', desc: 'Color Sync' }],
            [144, { name: 'colorswim', desc: 'Color Swim' }],
            [160, { name: 'colorset', desc: 'Color Set' }],
            [177, { name: 'party', desc: 'Party' }],
            [178, { name: 'romance', desc: 'Romance' }],
            [179, { name: 'caribbean', desc: 'Caribbean' }],
            [180, { name: 'american', desc: 'American' }],
            [181, { name: 'sunset', desc: 'Sunset' }],
            [182, { name: 'royal', desc: 'Royal' }],
            [190, { name: 'save', desc: 'Save' }],
            [191, { name: 'recall', desc: 'Recall' }],
            [193, { name: 'blue', desc: 'Blue' }],
            [194, { name: 'green', desc: 'Green' }],
            [195, { name: 'red', desc: 'Red' }],
            [196, { name: 'white', desc: 'White' }],
            [197, { name: 'magenta', desc: 'Magenta' }],
            [255, { name: 'none', desc: 'None' }]
        ]);
        this.valueMaps.heatModes = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'solar', desc: 'Solar Only' }],
            [3, { name: 'solarpref', desc: 'Solar Preferred' }],
        ]);
        this.valueMaps.lightThemes.transform = function (byte) { return extend(true, { val: byte }, this[byte] || this[255]); };
    }
    public requestConfiguration() { this._configQueue.queueChanges(); };
    public checkConfiguration() { this.requestConfiguration(); }; // Probably could put at least some time restrictions based upon the last time it was acquired.

    public stopAsync() { this._configQueue.close(); };
    public getLightThemes(type: number): any[] {
        switch (type) {
            case 16: // Intellibrite
            case 8: // Magicstream
                return this.valueMaps.lightThemes.toArray();
            default:
                return [];
        }
    }
    public setDateTime(hour: number, min: number, date: number, month: number, year: number, dst: number, dow: number) {
        // dow= day of week as expressed as [0=Sunday, 1=Monday, 2=Tuesday, 4=Wednesday, 8=Thursday, 16=Friday, 32=Saturday] and DST = 0(manually adjst for DST) or 1(automatically adjust DST)
        // [165,33,16,34,133,8],[13,10,16,29,8,19,0,0],[1,228]
        // [165,33,16,33,133,6],[1,30,16,1,2,2019,9,151
        // [165,33,34,16,1,1],[133],[1,127]
        if (hour === null) hour = state.time.hours;
        if (min === null) min = state.time.minutes;
        if (date === null) date = state.time.date;
        if (month === null) month = state.time.month;
        if (year === null) year = state.time.year;
        if (year > 2000) year = year - 2000;
        if (dst === null) dst = sys.general.options.adjustDST ? 1 : 0;
        if (dow === null) dow = state.time.dayOfWeek;
        const out = new Outbound(
            Protocol.Broadcast,
            Message.pluginAddress,
            16,
            133,
            [hour, min, dow, date, month, year, 0, 0],
            3,
            new Response(16, Message.pluginAddress, 1, [133], null, function (msg) {
                if (!msg.failed) {
                    state.time.hours = hour;
                    state.time.minutes = min;
                    state.time.date = date;
                    state.time.year = year;
                    sys.general.options.adjustDST = dst === 1 ? true : false;
                    state.emitControllerChange();
                }
            })
        );
        conn.queueSendMessage(out);
    }
    public setHeatMode(body: Body, mode: number) {
        //  [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        // The mapping below is no longer required.
        //switch (mode) {
        //    case 3:
        //        mode = 1;
        //        break;
        //    case 21:
        //        mode = 2;
        //        break;
        //    case 5:
        //        mode = 3;
        //        break;
        //    case 0:
        //        break;
        //}
        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        const temp1 = body1.setPoint || 100;
        const temp2 = body2.setPoint || 100;
        let mode1 = body1.heatMode;
        let mode2 = body2.heatMode;
        body.id === 1 ? mode1 = mode : mode2 = mode;
        let out = new Outbound(
            Protocol.Broadcast,
            Message.pluginAddress,
            16,
            136,
            [temp1, temp2, mode2 << 2 | mode1, 0],
            3,
            new Response(16, Message.pluginAddress, 1, [136], null, function (msg) {
                if (!msg.failed) {
                    body.heatMode = mode;
                    state.temps.bodies.getItemById(body.id).heatMode = mode;
                    state.temps.emitEquipmentChange();
                }
            })
        );
        conn.queueSendMessage(out);
    }
    public setHeatSetpoint(body: Body, setPoint: number) {
        const self = this;
        //  [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        // 165,33,16,34,136,4,89,99,7,0,2,71  Request
        // 165,33,34,16,1,1,136,1,130  Controller Response
        const tempUnits = state.temps.units;
        switch (tempUnits) {
            case 0: // fahrenheit
                if (setPoint < 40 || setPoint > 104) {
                    logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                    return;
                }
                break;
            case 1: // celcius
                if (setPoint < 4 || setPoint > 40) {
                    logger.warn(
                        `Setpoint of ${setPoint} is outside of acceptable range.`
                    );
                    return;
                }
                break;
        }
        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        let temp1 = body1.setPoint || 100;
        let temp2 = body2.setPoint || 100;
        body.id === 1 ? temp1 = setPoint : temp2 = setPoint;
        const mode1 = body1.heatMode;
        const mode2 = body2.heatMode;
        const out = new Outbound(
            Protocol.Broadcast,
            Message.pluginAddress,
            16,
            136,
            [temp1, temp2, mode2 << 2 | mode1, 0],
            3,
            new Response(16, Message.pluginAddress, 1, [136], null, function (msg) {
                if (!msg.failed) {
                    body.setPoint = setPoint;
                    state.temps.bodies.getItemById(body.id).setPoint = setPoint;
                    state.temps.emitEquipmentChange();
                }
            })
        );
        conn.queueSendMessage(out);
    }
    public setPump(pump: Pump, obj?: any) {
        super.setPump(pump, obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        sys.emitEquipmentChange();
        sys.pumps.emitEquipmentChange();
    }
    private createPumpConfigMessages(pump: Pump): Outbound[] {
        let setPumpConfig = Outbound.createMessage(
            155, [pump.id, pump.type,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
        if (pump.type === 128) {
            // vs
            setPumpConfig[2] = pump.primingTime;
            setPumpConfig[25] = pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256;
            setPumpConfig[30] = Math.floor(pump.primingSpeed / 256);
            for (let i = 1; i <= 8; i++) {
                let circ = pump.circuits.getItemById(i, true);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit | 0;
                setPumpConfig.payload[i + 21] = circ.speed - Math.floor(circ.speed / 256) * 256 | 0;
                setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) | 0;
            }
        }
        else if (pump.type === 64) {
            // vsf
            for (let i = 1; i <= 8; i++) {
                const circ = pump.circuits.getItemById(i, true);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit | 0;
                if (circ.units === 1) {
                    // gpm
                    setPumpConfig.payload[i * 2 + 4] = circ.flow | 0;
                }
                else {
                    // rpm
                    setPumpConfig.payload[4] =
                        setPumpConfig.payload[4] | 1 << i - 1; // set rpm/gpm flag
                    setPumpConfig.payload[i + 21] =
                        circ.speed - Math.floor(circ.speed / 256) * 256 | 0;
                    setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) | 0;
                }
            }
        }
        else if (pump.type === 1) {
            // pump.turnovers = msg.extractPayloadByte( 3 );
            setPumpConfig.payload[3] = pump.turnovers | 0;
            // pump.primingSpeed =
            // msg.extractPayloadByte(21) * 256 + msg.extractPayloadByte(30);
            setPumpConfig.payload[21] = Math.floor(pump.primingSpeed / 256) | 0;
            setPumpConfig.payload[30] =
                pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256 | 0;
            // pump.primingTime = msg.extractPayloadByte(23);
            setPumpConfig.payload[23] = pump.primingTime;
            // pump.manualFilterGPM = msg.extractPayloadByte(21);
            setPumpConfig.payload[21] = pump.manualFilterGPM;
            // pump.maxPrimeFlow = msg.extractPayloadByte(22);
            setPumpConfig.payload[22] = pump.maxPrimeFlow | 0;
            // pump.maxPrimeTime = (msg.extractPayloadByte(23) & 0xf) - 1;
            // pump.maxSystemTime = msg.extractPayloadByte(23) & 0xf0;
            setPumpConfig.payload[22] =
                pump.maxPrimeTime + 1 + (pump.maxSystemTime << 4);
            // pump.maxPressureIncrease = msg.extractPayloadByte(24);
            setPumpConfig.payload[24] = pump.maxPressureIncrease;
            // pump.backwashFlow = msg.extractPayloadByte(25);
            setPumpConfig.payload[25] = pump.backwashFlow;
            // pump.backwashTime = msg.extractPayloadByte(26);
            setPumpConfig.payload[26] = pump.backwashTime;
            // pump.rinseTime = msg.extractPayloadByte(27);
            setPumpConfig.payload[27] = pump.rinseTime;
            // pump.vacuumFlow = msg.extractPayloadByte(28);
            setPumpConfig.payload[28] = pump.vacuumFlow;
            // pump.vacuumTime = msg.extractPayloadByte(30);
            setPumpConfig.payload[30] = pump.vacuumTime;
            for (let i = 1; i <= 8; i++) {
                const circ = pump.circuits.getItemById(i);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit | 0;
                setPumpConfig.payload[i * 2 + 4] = circ.flow;
            }
        }
        const pumpConfigRequest = Outbound.createMessage(203, []);
        const pumpConfigRequest2 = Outbound.createMessage(203, [0]);
        // sys.checkConfiguration();
        return [setPumpConfig, pumpConfigRequest, pumpConfigRequest2];
    }

}
export class TouchConfigRequest extends ConfigRequest {
    constructor(setcat: number, items?: number[], oncomplete?: Function) {
        super();
        this.setcategory = setcat;
        setcat === GetTouchConfigCategories.version ?
            this.category = TouchConfigCategories.version :
            this.category = setcat & 63;
        if (typeof items !== 'undefined') this.items.push(...items);
        this.oncomplete = oncomplete;
    }
    public category: TouchConfigCategories;
    public setcategory: GetTouchConfigCategories;
}
class TouchConfigQueue extends ConfigQueue {
    private queueRange(cat: number, start: number, end: number) {
        let req = new TouchConfigRequest(cat, []);
        req.fillRange(start, end);
        this.push(req);
    }
    private queueItems(cat: number, items?: number[]) { this.push(new TouchConfigRequest(cat, items)); }
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping Controller Init because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${sys.controllerType} configuration`);
            this.queueItems(GetTouchConfigCategories.dateTime, [0]);
            this.queueItems(GetTouchConfigCategories.heatTemperature, [0]);
            this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]);
            this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames);
            // todo: better formula for this that includes expansion boards
            this.queueRange(GetTouchConfigCategories.circuits, 1, sys.equipment.maxCircuits + sys.equipment.maxFeatures + 4);
            this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
            this.queueItems(GetTouchConfigCategories.delays, [0]);
            this.queueItems(GetTouchConfigCategories.settings, [0]);
            this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes, [0]);
            this.queueItems(GetTouchConfigCategories.is4is10, [0]);
            this.queueItems(GetTouchConfigCategories.spaSideRemote, [0]);
            this.queueItems(GetTouchConfigCategories.valves, [0]);
            this.queueItems(GetTouchConfigCategories.lightGroupPositions);
            this.queueItems(GetTouchConfigCategories.highSpeedCircuits, [0]);
            this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
        }
        if (this.remainingItems > 0) {
            var self = this
            setTimeout(() => { self.processNext() }, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }
    // TODO: RKS -- Investigate why this is needed.  Me thinks that there really is no difference once the whole thing is optimized.  With a little
    // bit of work I'll bet we can eliminate these extension objects altogether.
    public processNext(msg?: Outbound) {
        if (this.closed) return;
        let self = this;
        if (typeof msg !== "undefined" && msg !== null)
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.action, msg.payload[0]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            this.curr.oncomplete(this.curr);
                            this.curr.oncomplete = undefined;
                        }
                        // Let the process add in any additional information we might need.  When it does
                        // this it will set the isComplete flag to false.
                        /* if ( this.curr.isComplete )
                                      sys.configVersion[ GetConfigCategories[ this.curr.setcategory ] ] = this.curr.version; */
                    } else {
                        // We failed to get the data.  Let the system retry when
                        // we are done with the queue.
                        /* sys.configVersion[ GetConfigCategories[ this.curr.setcategory ] ] = 0; */
                    }
                }
                if (!this.curr) {
                    // There never was anything for us to do. We will likely never get here.
                    state.status = 1;
                    state.emitControllerChange();
                    return;
                } else {
                    state.status = Enums.ControllerStatus.transform(2, this.percent);
                }
                // Shift to the next config queue item.
                logger.silly(
                    `Config Queue Completed... ${this.percent}% (${this.remainingItems} remaining)`
                );
                while (
                    this.queue.length > 0 &&
                    this.curr.isComplete
                ) {
                    this.curr = this.queue.shift() || null;
                }
                let itm = 0;
                if (this.curr && !this.curr.isComplete) {
                    itm = this.curr.items.shift();
                    const out: Outbound = new Outbound(
                        Protocol.Broadcast,
                        Message.pluginAddress,
                        16,
                        this.curr.setcategory,
                        [itm],
                        5,
                        new Response(
                            16,
                            15,
                            this.curr.category,
                            [itm],
                            undefined,
                            function (msgOut) { self.processNext(msgOut) })
                    );
                    setTimeout(() => conn.queueSendMessage(out), 50);
                } else {
                    // Now that we are done check the configuration a final time.  If we have anything outstanding
                    // it will get picked up.
                    state.status = 1;
                    this.curr = null;
                    sys.configVersion.lastUpdated = new Date();
                    // setTimeout( sys.checkConfiguration, 100 );
                    logger.info(`IntelliTouch system config complete.`);
                }
                // Notify all the clients of our processing status.
                state.emitControllerChange();
            }
    }
}
export enum TouchConfigCategories {
    dateTime = 5,
    heatTemperature = 8,
    customNames = 10,
    circuits = 11,
    schedules = 17,
    spaSideRemote = 22,
    pumpStatus = 23,
    pumpConfig = 24,
    intellichlor = 25,
    valves = 29,
    highSpeedCircuits = 30,
    is4is10 = 32,
    solarHeatPump = 34,
    delays = 35,
    lightGroupPositions = 39,
    settings = 40,
    version = 252
}
export enum GetTouchConfigCategories {
    dateTime = 197,
    heatTemperature = 200,
    customNames = 202,
    circuits = 203,
    schedules = 209,
    spaSideRemote = 214,
    pumpStatus = 215,
    pumpConfig = 216,
    intellichlor = 217,
    valves = 221,
    highSpeedCircuits = 222,
    is4is10 = 224,
    intellifloSpaSideRemotes = 225,
    solarHeatPump = 226,
    delays = 227,
    lightGroupPositions = 231,
    settings = 232,
    version = 253
}



