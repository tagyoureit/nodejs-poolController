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
  var packetFields = {
        DEST: 2,
        FROM: 3,
        ACTION: 4,
        LENGTH: 5,
    }

    var controllerStatusPacketFields = {
        HOUR: 6,
        MIN: 7,
        EQUIP1: 8,
        EQUIP2: 9,
        EQUIP3: 10,
        UOM: 15, //Celsius (4) or Fahrenheit (0); Also Service/Timeout.  See strRunMode below.
        VALVE: 16,
        DELAY: 18,  //64==??; 65-135 (for 50 circuits) is the circuit that is currently delayed.
        UNKNOWN: 19, //Something to do with heat.
        POOL_TEMP: 20,
        SPA_TEMP: 21,
        HEATER_ACTIVE: 22, //0=off.  32=on.  More here?
        AIR_TEMP: 24,
        SOLAR_TEMP: 25,
        HEATER_MODE: 28,
        MISC2: 32 //0=do not automatically adjust DST, 1=automatically adjust DST
    }

    // these are from the controller status packet = 25
    var controllerChlorinatorPacketFields = {
        OUTPUTSPAPERCENT: 6,
        OUTPUTPERCENT: 7,
        SALTPPM: 9,
        STATUS: 10,
        SUPERCHLORINATE: 11
    }

    // this is from the chlorinator itself = 16,2,...,16,3
    var chlorinatorPacketFields = {
        DEST: 2,
        ACTION: 3
    }

    var pumpPacketFields = {
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
        GPM: 13,
        PPC: 14, //??
        //14 Unknown
        ERR: 15,
        //16 Unknown
        TIMER: 18, //Have to explore
        HOUR: 19, //Hours
        MIN: 20 //Mins
    }

    var pumpConfigFieldsCommon = {
      NUMBER: 6,
      TYPE: 7
    }

    var pumpConfigFieldsVS = {
      PRIMINGMINS: 8,
      UNKNOWNCONSTANT_9: 9,
      UNUSED_10: 10,
      CIRCUIT1: 11,
      CIRCUIT1RPMH: 12,
      CIRCUIT2: 13,
      CIRCUIT2RPMH: 14,
      CIRCUIT3: 15,
      CIRCUIT3RPMH: 16,
      CIRCUIT4: 17,
      CIRCUIT4RPMH: 18,
      CIRCUIT5: 19,
      CIRCUIT5RPMH: 20,
      CIRCUIT6: 21,
      CIRCUIT6RPMH: 22,
      CIRCUIT7: 23,
      CIRCUIT7RPMH: 24,
      CIRCUIT8: 25,
      CIRCUIT8RPMH: 26,
      PRIMERPMH: 27,
      CIRCUIT1RPML: 28,
      CIRCUIT2RPML: 29,
      CIRCUIT3RPML: 30,
      CIRCUIT4RPML: 31,
      CIRCUIT5RPML: 32,
      CIRCUIT6RPML: 33,
      CIRCUIT7RPML: 34,
      CIRCUIT8RPML: 35,
      PRIMERPML: 36
      // CIRCUITS 37-51 ARE ALL 0 FOR VS WITH EXTENDED CONFIG
    }

    var pumpConfigFieldsVF = {
      POOLSIZE: 8,  // GALLONS
      TURNOVERS: 9,  // PER DAY
      UNUSED_10: 10,
      CIRCUIT1: 11,
      CIRCUIT1GPM: 12,
      CIRCUIT2: 13,
      CIRCUIT2GPM: 14,
      CIRCUIT3: 15,
      CIRCUIT3GPM: 16,
      CIRCUIT4: 17,
      CIRCUIT4GPM: 18,
      CIRCUIT5: 19,
      CIRCUIT5GPM: 20,
      CIRCUIT6: 21,
      CIRCUIT6GPM: 22,
      CIRCUIT7: 23,
      CIRCUIT7GPM: 24,
      CIRCUIT8: 25,
      CIRCUIT8GPM: 26,
      MANUALFILTERGPM: 27,
      MAXPRIMEFLOW: 28,
      MAXPRIMESYSTEMTIME: 29,
      MAXPRESSUREINCREASE: 30,
      BACKWASHFLOW: 31,
      BACKWASHTIME: 32,
      RINSETIME: 33,
      VACUUMFLOW: 34, // +1 FOR ACTUAL VALUE
      UNUSED_35: 35,
      VACUUMTIME: 36
      // CIRCUITS 37-51 ARE ALL 0 FOR VF WITH EXTENDED CONFIG
    }

    var pumpConfigFieldsVSF = {
      PRIMINGMINS: 8, // ALWAYS 0?
      UNKNOWNCONSTANT_9: 9,
      RPMGPMFLAG: 10,
      CIRCUIT1: 11,
      CIRCUIT1H: 12,
      CIRCUIT2: 13,
      CIRCUIT2H: 14,
      CIRCUIT3: 15,
      CIRCUIT3H: 16,
      CIRCUIT4: 17,
      CIRCUIT4H: 18,
      CIRCUIT5: 19,
      CIRCUIT5H: 20,
      CIRCUIT6: 21,
      CIRCUIT6H: 22,
      CIRCUIT7: 23,
      CIRCUIT7H: 24,
      CIRCUIT8: 25,
      CIRCUIT8H: 26,
      PRIMERPMH: 27,  // NOT USED WITH VSF?
      CIRCUIT1RPML: 28,
      CIRCUIT2RPML: 29,
      CIRCUIT3RPML: 30,
      CIRCUIT4RPML: 31,
      CIRCUIT5RPML: 32,
      CIRCUIT6RPML: 33,
      CIRCUIT7RPML: 34,
      CIRCUIT8RPML: 35,
      PRIMERPML: 36  // NOT USED WITH VSF?
      // CIRCUITS 37-44 ARE ALL 255 FOR VS WITH EXTENDED CONFIG
      // CIRCUITS 45-51 ARE ALL 0 WITH VS FOR EXTENDED CONFIG
    }

    var pumpTypeStr = {
      0: 'None',
      1: 'VF', // VF is really any circuit assignment between 1-63(?)
      64: 'VSF',
      128: 'VS'
    }

    var pumpType = {
      NONE: 0,
      VF: 1,
      VSF: 64,
      VS: 128
    }

    var namePacketFields = {
        NUMBER: 6,
        CIRCUITFUNCTION: 7,
        NAME: 8,
    }

    var pumpAction = {
        1: 'WRITE', //Write commands to pump
        4: 'REMOTE', //Turn on/off pump control panel
        5: 'MODE', //Set pump mode
        6: 'RUN', //Set run mode
        7: 'STATUS' //Request status
    }

    var strCircuitName = {
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

    var strCircuitFunction = {
        0: 'Generic',
        1: 'Spa',
        2: 'Pool',
        5: 'Master Cleaner',
        7: 'Light',
        9: 'SAM Light',
        10: 'SAL Light',
        11: 'Photon Gen',
        12: 'Color Wheel',
        13: 'Valve',
        14: 'Spillway',
        15: 'Floor Cleaner',
        16: 'Intellibrite',
        17: 'MagicStream',
        19: 'Not Used',
        64: 'Freeze protection on',
        // Not exactly sure if the following belong in this list...
        // they show up in the pump circuit assignment packets (24/27)
        128: 'Solar',
        129: 'Either Heater',
        130: 'Pool Heater',
        131: 'Spa Heater',
        132: 'Freeze'
    }

    var strPumpActions = {
        1: 'Pump set speed/program or run program',
        4: 'Pump control panel',
        5: 'Pump speed',
        6: 'Pump power',
        7: 'Pump Status'
    }

    var strChlorinatorActions = {
        0: 'Get Status',
        1: 'Response to Get Status',
        3: 'Response to Get Version',
        17: 'Set Salt %',
        18: 'Response to Set Salt % & Salt PPM',
        20: 'Get Version',
        21: 'Set Salt Generate % / 10'
    }

    var strControllerActions = {
        // Response/information/settings
        1: 'Ack Message',
        2: 'Controller Status',
        5: 'Date/Time',
        7: 'Pump Status',
        8: 'Heat/Temperature Status',
        10: 'Custom Names',
        11: 'Circuit Names/Function',
        16: 'Heat Pump Status?',
        17: 'Schedule details',
        18: 'IntelliChem',
        19: 'Intelli(?)',  //Packet never seen...
        22: 'Get Intelliflo Spa Side Control',
        23: 'Pump Status',
        24: 'Pump Config',
        25: 'IntelliChlor Status',
        27: 'Pump Config (Extended)',
        29: 'Valve Status',
        30: 'High Speed Circuits for Valve',
        32: 'is4/is10 Settings',
        33: 'Intelliflo Spa Side Remote settings',
        34: 'Solar/Heat Pump Status',
        35: 'Delay Status',
        39: 'Light Groups/Positions',
        40: 'Settings, Heat Mode?',  //


        // Set commands
        96: 'Set Color',
        131: 'Set Delay Cancel',
        133: 'Set Date/Time',
        134: 'Set Circuit',
        136: 'Set Heat/Temperature',
        138: 'Set Custom Name',
        139: 'Set Circuit Name/Function',
        144: 'Set Heat Pump',
        145: 'Set Schedule',
        146: 'Set IntelliChem',
        147: 'Set Intelli(?)',
        150: 'Set Intelliflow Spa Side Control',
        152: 'Set Pump Config',
        153: 'Set IntelliChlor',
        155: 'Set Pump Config (Extended)',
        157: 'Set Valves',
        158: 'Set High Speed Circuits for Valves',  //Circuits that require high speed
        160: 'Set is4/is10 Spa Side Remote',
        161: 'Set QuickTouch Spa Side Remote',
        162: 'Set Solar/Heat Pump',
        163: 'Set Delay',
        167: 'Set Light Groups/Positions',
        168: 'Set Heat Mode',  //probably more

        // Get commands
        194: 'Get Status/',
        197: 'Get Date/Time',
        200: 'Get Heat/Temperature',
        202: 'Get Custom Name',
        203: 'Get Circuit Name/Function',
        208: 'Get Heat Pump',
        209: 'Get Schedule',
        210: 'Get IntelliChem',
        211: 'Get Intelli(?)',
        214: 'Get Inteliflo Spa Side Control',
        215: 'Get Pump Status',
        216: 'Get Pump Config',
        217: 'Get IntelliChlor',
        219: 'Get Pump Config (Extended)',
        221: 'Get Valves',
        222: 'Get High Speed Circuits for Valves',
        224: 'Get is4/is10 Settings',
        225: 'Get Intelliflo Spa Side Remote settings',
        226: 'Get Solar/Heat Pump',
        227: 'Get Delays',
        231: 'Get Light group/positions',
        232: 'Get Settings, Heat Mode?',
        252: 'SW Version Info',
        253: 'Get SW Version'
    }

    var lightColors = {
        0: "White",
        1: "Custom", // custom addition for when save/recall are used
        2: "Light Green",
        4: "Green",
        6: "Cyan",
        8: "Blue",
        10: "Lavender",
        12: "Magenta",
        14: "Light Magenta"
    }

    var strIntellibriteModes = {
        0: 'Off',
        1: 'On',
        128: 'Color Sync',
        144: 'Color Swim',
        160: 'Color Set',
        177: 'Party',
        178: 'Romance',
        179: 'Caribbean',
        180: 'American',
        181: 'Sunset',
        182: 'Royal',
        190: 'Save',
        191: 'Recall',
        193: 'Blue',
        194: 'Green',
        195: 'Red',
        196: 'White',
        197: 'Magenta'
    }
    var intellibriteModes = {
        'Off': 0,
        'On': 1,
        'Color Sync': 128,
        'Color Swim': 144,
        'Color Set': 160,
        'Party': 177,
        'Romance': 178,
        'Caribbean': 179,
        'American': 180,
        'Sunset': 181,
        'Royal': 182,
        'Save': 190,
        'Recall': 191,
        'Blue': 193,
        'Green': 194,
        'Red': 195,
        'White': 196,
        'Magenta': 197
    }

    var strRunMode = {
        //same bit as UOM.  Need to fix naming.
        0: 'Auto', //0x00000000
        1: 'Service', //0x00000001
        4: 'Celsius', //if 1, Celsius.  If 0, Fahrenheit
        8: 'Freeze', //0 if no freeze, 1 if freeze mode active
        128: '/Timeout' //Timeout always appears with Service; eg this bit has not been observed to be 128 but rather 129.  Not sure if the timer is in the controller.  0x10000001

    }


    var strValve = {
        3: 'Pool',
        15: 'Spa',
        48: 'Heater',
        51: 'Solar'
    }

    var heatModeStr = {
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

    var heatMode = {
        OFF: 0,
        HEATER: 1,
        SOLARPREF: 2,
        SOLARONLY: 3
    }

    var ctrl = {
        CHLORINATOR: 2,
        BROADCAST: 15,
        INTELLITOUCH: 16,
        REMOTE: 32,
        WIRELESS: 34, //Looks like this is any communications through the wireless link (ScreenLogic on computer, iPhone...)
        PUMP1: 96,
        PUMP2: 97,
        PUMP3: 98,
        PUMP4: 99,
        PUMP5: 100,
        PUMP6: 101,
        PUMP7: 102,
        PUMP8: 103,
        PUMP9: 104,
        PUMP10: 105,
        PUMP11: 106,
        PUMP12: 107,
        PUMP13: 108,
        PUMP14: 109,
        PUMP15: 110,
        PUMP16: 111,
        INTELLICHEM: 144
    }

    var ctrlString = {
        2: 'Chlorinator',
        15: 'Broadcast',
        16: 'Main',
        32: 'Remote',
        33: 'PoolControllerApp', //default address
        34: 'Wireless',
        96: 'Pump 1',
        97: 'Pump 2',
        98: 'Pump 3',
        99: 'Pump 4',
        100: 'Pump 5',
        101: 'Pump 6',
        102: 'Pump 7',
        103: 'Pump 8',
        104: 'Pump 9',
        105: 'Pump 10',
        106: 'Pump 11',
        107: 'Pump 12',
        108: 'Pump 13',
        109: 'Pump 14',
        110: 'Pump 15',
        111: 'Pump 16',
        144: 'Intellichem',
        appAddress: 'nodejs-poolController Server'
    }

    var schedulePacketBytes = {
        "ID": 6,
        "CIRCUIT": 7,
        "TIME1": 8,
        "TIME2": 9,
        "TIME3": 10,
        "TIME4": 11,
        "DAYS": 12
    };

    var intellichemPacketFields = {
      DEST: 2,
      ACTION: 3,
      PHREADINGHI: 6,
      PHREADINGLO: 7,
      ORPREADINGHI: 8,
      ORPREADINGLO: 9,
      PHSETPOINTHI: 10,
      PHSETPOINTLO: 11,
      ORPSETPOINTHI: 12,
      ORPSETPOINTLO: 13,
      TANK1: 26,
      TANK2: 27,
      CALCIUMHARDNESSHI: 29,
      CALCIUMHARDNESSLO: 30,
      CYAREADING: 32,
      TOTALALKALINITYREADINGHI: 33,
      TOTALALKALINITYREADINGLO: 34,
      WATERFLOW: 36,
      MODE1: 40,
      MODE2: 41
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: ants.js')

    return {
        packetFields: packetFields,
        controllerStatusPacketFields: controllerStatusPacketFields,
        controllerChlorinatorPacketFields: controllerChlorinatorPacketFields,
        chlorinatorPacketFields: chlorinatorPacketFields,
        pumpPacketFields: pumpPacketFields,
        pumpType: pumpType,
        pumpTypeStr: pumpTypeStr,
        pumpConfigFieldsCommon: pumpConfigFieldsCommon,
        pumpConfigFieldsVS: pumpConfigFieldsVS,
        pumpConfigFieldsVF: pumpConfigFieldsVF,
        pumpConfigFieldsVSF: pumpConfigFieldsVSF,
        namePacketFields: namePacketFields,
        pumpAction: pumpAction,
        strCircuitName: strCircuitName,
        strCircuitFunction: strCircuitFunction,
        strPumpActions: strPumpActions,
        strChlorinatorActions: strChlorinatorActions,
        strControllerActions: strControllerActions,
        strRunMode: strRunMode,
        strValve: strValve,
        heatModeStr: heatModeStr,
        heatMode: heatMode,
        ctrl: ctrl,
        ctrlString: ctrlString,
        schedulePacketBytes: schedulePacketBytes,
        intellichemPacketFields: intellichemPacketFields,
        strIntellibriteModes: strIntellibriteModes,
        intellibriteModes: intellibriteModes,
        lightColors: lightColors
    }

}
