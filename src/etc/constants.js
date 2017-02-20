/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: ants.js')

    // this first four bytes of ANY packet are the same
    packetFields = {
        DEST: 2,
        FROM: 3,
        ACTION: 4,
        LENGTH: 5,
    }

    controllerStatusPacketFields = {
        HOUR: 6,
        MIN: 7,
        EQUIP1: 8,
        EQUIP2: 9,
        EQUIP3: 10,
        UOM: 15, //Celsius (4) or Farenheit (0); Also Service/Timeout.  See strRunMode below.
        VALVES: 16,
        UNKNOWN: 19, //Something to do with heat.
        POOL_TEMP: 20,
        SPA_TEMP: 21,
        HEATER_ACTIVE: 22, //0=off.  32=on.  More here?
        AIR_TEMP: 24,
        SOLAR_TEMP: 25,
        HEATER_MODE: 28,
        MISC2: 32 //0=do not automatically adjust DST, 1=automatically adjust DST
    }

    chlorinatorPacketFields = {
        DEST: 2,
        ACTION: 3
    }

    pumpPacketFields = {
        DEST: 2,
        FROM: 3,
        ACTION: 4,
        LENGTH: 5,
        CMD: 6, //
        MODE: 7, //?? Mode in pump status. Means something else in pump write/response
        DRIVESTATE: 8, //?? Drivestate in pump status.  Means something else in pump write/response
        WATTSH: 9,
        WATTSL: 10,
        RPMH: 11,
        RPML: 12,
        PPC: 13, //??
        //14 Unknown
        ERR: 15,
        //16 Unknown
        TIMER: 18, //Have to explore
        HOUR: 19, //Hours
        MIN: 20 //Mins
    }

    namePacketFields = {
        NUMBER: 6,
        CIRCUITFUNCTION: 7,
        NAME: 8,
    }

    pumpAction = {
        1: 'WRITE', //Write commands to pump
        4: 'REMOTE', //Turn on/off pump control panel
        5: 'MODE', //Set pump mode
        6: 'RUN', //Set run mode
        7: 'STATUS' //Request status

    }

    strCircuitName = {
        0: 'NOT USED',
        1: 'AERATOR',
        2: 'AIR BLOWER',
        3: 'AUX 1',
        4: 'AUX 2',
        5: 'AUX 3',
        6: 'AUX 4',
        7: 'AUX 5',
        8: 'AUX 6',
        9: 'AUX 7',
        10: 'AUX 8',
        11: 'AUX 9',
        12: 'AUX 10',
        13: 'BACKWASH',
        14: 'BACK LIGHT',
        15: 'BBQ LIGHT',
        16: 'BEACH LIGHT',
        17: 'BOOSTER PUMP',
        18: 'BUG LIGHT',
        19: 'CABANA LTS',
        20: 'CHEM. FEEDER',
        21: 'CHLORINATOR',
        22: 'CLEANER',
        23: 'COLOR WHEEL',
        24: 'DECK LIGHT',
        25: 'DRAIN LINE',
        26: 'DRIVE LIGHT',
        27: 'EDGE PUMP',
        28: 'ENTRY LIGHT',
        29: 'FAN',
        30: 'FIBER OPTIC',
        31: 'FIBER WORKS',
        32: 'FILL LINE',
        33: 'FLOOR CLNR',
        34: 'FOGGER',
        35: 'FOUNTAIN',
        36: 'FOUNTAIN 1',
        37: 'FOUNTAIN 2',
        38: 'FOUNTAIN 3',
        39: 'FOUNTAINS',
        40: 'FRONT LIGHT',
        41: 'GARDEN LTS',
        42: 'GAZEBO LTS',
        43: 'HIGH SPEED',
        44: 'HI-TEMP',
        45: 'HOUSE LIGHT',
        46: 'JETS',
        47: 'LIGHTS',
        48: 'LOW SPEED',
        49: 'LO-TEMP',
        50: 'MALIBU LTS',
        51: 'MIST',
        52: 'MUSIC',
        53: 'NOT USED',
        54: 'OZONATOR',
        55: 'PATH LIGHTS',
        56: 'PATIO LTS',
        57: 'PERIMETER L',
        58: 'PG2000',
        59: 'POND LIGHT',
        60: 'POOL PUMP',
        61: 'POOL',
        62: 'POOL HIGH',
        63: 'POOL LIGHT',
        64: 'POOL LOW',
        65: 'SAM',
        66: 'POOL SAM 1',
        67: 'POOL SAM 2',
        68: 'POOL SAM 3',
        69: 'SECURITY LT',
        70: 'SLIDE',
        71: 'SOLAR',
        72: 'SPA',
        73: 'SPA HIGH',
        74: 'SPA LIGHT',
        75: 'SPA LOW',
        76: 'SPA SAL',
        77: 'SPA SAM',
        78: 'SPA WTRFLL',
        79: 'SPILLWAY',
        80: 'SPRINKLERS',
        81: 'STREAM',
        82: 'STATUE LT',
        83: 'SWIM JETS',
        84: 'WTR FEATURE',
        85: 'WTR FEAT LT',
        86: 'WATERFALL',
        87: 'WATERFALL 1',
        88: 'WATERFALL 2',
        89: 'WATERFALL 3',
        90: 'WHIRLPOOL',
        91: 'WTRFL LGHT',
        92: 'YARD LIGHT',
        93: 'AUX EXTRA',
        94: 'FEATURE 1',
        95: 'FEATURE 2',
        96: 'FEATURE 3',
        97: 'FEATURE 4',
        98: 'FEATURE 5',
        99: 'FEATURE 6',
        100: 'FEATURE 7',
        101: 'FEATURE 8',
        200: 'USERNAME-01',
        201: 'USERNAME-02',
        202: 'USERNAME-03',
        203: 'USERNAME-04',
        204: 'USERNAME-05',
        205: 'USERNAME-06',
        206: 'USERNAME-07',
        207: 'USERNAME-08',
        208: 'USERNAME-09',
        209: 'USERNAME-10'
    }

    strCircuitFunction = {
        0: 'Generic',
        1: 'Spa',
        2: 'Pool',
        5: 'Master Cleaner',
        7: 'Light',
        9: 'SAM Light',
        10: 'SAL Light',
        11: 'Photon Gen',
        12: 'color wheel',
        14: 'Spillway',
        15: 'Floor Cleaner',
        16: 'Intellibrite',
        17: 'MagicStream',
        19: 'Not Used',
        64: 'Freeze protection on'
    }

    strPumpActions = {
        1: 'Pump set speed/program or run program',
        4: 'Pump control panel',
        5: 'Pump speed',
        6: 'Pump power',
        7: 'Pump Status'
    }

    strChlorinatorActions = {
        0: 'Get Status',
        1: 'Response to Get Status',
        3: 'Response to Get Version',
        17: 'Set Salt %',
        18: 'Response to Set Salt % & Salt PPM',
        20: 'Get Version',
        21: 'Set Salt Generate % / 10'
    }

    strControllerActions = {
        1: 'Ack Message',
        2: 'Controller Status',
        5: 'Date/Time',
        7: 'Pump Status',
        8: 'Heat/Temperature Status',
        10: 'Custom Names',
        11: 'Circuit Names/Function',
        16: 'Heat Pump Status?',
        17: 'Schedule details',
        19: 'IntelliChem pH',
        23: 'Pump Status',
        24: 'Pump Config',
        25: 'IntelliChlor Status',
        29: 'Valve Status',
        34: 'Solar/Heat Pump Status',
        35: 'Delay Status',
        39: 'Set ?',
        40: 'Settings?',
        96: 'Set Color', //Intellibrite, maybe more?
        133: 'Set Date/Time',
        134: 'Set Circuit',
        136: 'Set Heat/Temperature',
        138: 'Set Custom Name',
        139: 'Set Circuit Name/Function',
        144: 'Set Heat Pump',
        145: 'Set Schedule',
        147: 'Set IntelliChem',
        152: 'Set Pump Config',
        153: 'Set IntelliChlor',
        157: 'Set Valves',
        162: 'Set Solar/Heat Pump',
        163: 'Set Delay',
        167: 'Set Light Special Groups',  //all on, off
        194: 'Get Status',
        197: 'Get Date/Time',
        200: 'Get Heat/Temperature',
        202: 'Get Custom Name',
        203: 'Get Circuit Name/Function',
        208: 'Get Heat Pump',
        209: 'Get Schedule',
        211: 'Get IntelliChem',
        215: 'Get Pump Status',
        216: 'Get Pump Config',
        217: 'Get IntelliChlor',
        221: 'Get Valves',
        226: 'Get Solar/Heat Pump',
        227: 'Get Delays',
        231: 'Get ?',
        232: 'Get Settings?',
        252: 'SW Version Info',
        253: 'Get SW Version',
    }

    strIntellibriteModes = {
        0: 'Off', //All off in UI
        1: 'On', //All on in UI
        128: 'Color Sync',
        144: 'Color Swim',
        160: 'Color Set', //???
        177: 'Party',
        178: 'Romance',
        179: 'Caribbean',
        180: 'American',
        181: 'Sunset',
        182: 'Royal',
        193: 'Blue',
        194: 'Green',
        195: 'Red',
        196: 'White',
        197: 'Magenta'
    }
    intellibriteModes = {
        'Off': 0, //All off in UI
        'On': 1, //All on in UI
        'Color Sync': 128,
        'Color Swim': 144,
        'Color Set': 160, //???
        'Party': 177,
        'Romance': 178,
        'Caribbean': 179,
        'American': 180,
        'Sunset': 181,
        'Royal': 182,
        'Blue': 193,
        'Green': 194,
        'Red': 195,
        'White': 196,
        'Magenta': 197
    }

    strRunMode = {
        //same bit as UOM.  Need to fix naming.
        0: 'Auto', //0x00000000
        1: 'Service', //0x00000001
        4: 'Celsius', //if 1, Celsius.  If 0, Farenheit
        8: 'Freeze', //0 if no freeze, 1 if freeze mode active
        128: '/Timeout' //Timeout always appears with Service; eg this bit has not been observed to be 128 but rather 129.  Not sure if the timer is in the controller.  0x10000001

    }


    strValves = {
        3: 'Pool',
        15: 'Spa',
        48: 'Heater' // I've seen the value of 51.  I think it is Pool + Heater.  Need to investigate.
    }

    heatModeStr = {
        //Pentair controller sends the pool and spa heat status as a 4 digit binary byte from 0000 (0) to 1111 (15).  The left two (xx__) is for the spa and the right two (__xx) are for the pool.  EG 1001 (9) would mean 10xx = 2 (Spa mode Solar Pref) and xx01 = 1 (Pool mode Heater)
        //0: all off
        //1: Pool heater            Spa off
        //2: Pool Solar Pref        Spa off
        //3: Pool Solar Only        Spa off
        //4: Pool Off               Spa Heater
        //5: Pool Heater            Spa Heater
        //6: Pool Solar Pref        Spa Heater
        //7: Pool Solar Only        Spa Heater
        //8: Pool Off               Spa Solar Pref
        //9: Pool Heater            Spa Solar Pref
        //10: Pool Solar Pref       Spa Solar Pref
        //11: Pool Solar Only       Spa Solar Pref
        //12: Pool Off              Spa Solar Only
        //13: Pool Heater           Spa Solar Only
        //14: Pool Solar Pref       Spa Solar Only
        //15: Pool Solar Only       Spa Solar Only
        0: 'OFF',
        1: 'Heater',
        2: 'Solar Pref',
        3: 'Solar Only'
    }

    heatMode = {
        OFF: 0,
        HEATER: 1,
        SOLARPREF: 2,
        SOLARONLY: 3
    }

    ctrl = {
        CHLORINATOR: 2,
        BROADCAST: 15,
        INTELLITOUCH: 16,
        REMOTE: 32,
        WIRELESS: 34, //Looks like this is any communications through the wireless link (ScreenLogic on computer, iPhone...)
        PUMP1: 96,
        PUMP2: 97
    }

    ctrlString = {
        2: 'Chlorinator',
        15: 'Broadcast',
        16: 'Main',
        32: 'Remote',
        34: 'Wireless',
        96: 'Pump 1',
        97: 'Pump 2',
        appAddress: 'nodejs-poolController Server'
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: ants.js')

    return {
        packetFields,
        controllerStatusPacketFields,
        chlorinatorPacketFields,
        pumpPacketFields,
        namePacketFields,
        pumpAction,
        strCircuitName,
        strCircuitFunction,
        strPumpActions,
        strChlorinatorActions,
        strControllerActions,
        strRunMode,
        strValves,
        heatModeStr,
        heatMode,
        ctrl,
        ctrlString
    }

}
