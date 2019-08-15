import * as extend from 'extend';
import { EventEmitter } from 'events';
export class Timestamp
{
    private _dt: Date;
    public emitter: EventEmitter;
    constructor( dt?: Date )
    {
        this._dt = dt || new Date();
        this.emitter = new EventEmitter();
    }
    public get hours (): number { return this._dt.getHours(); }
    public set hours ( val: number )
    {
        if ( this.hours !== val )
        {
            this._dt.setHours( val );
            this.emitter.emit( 'change' );
        }
    }
    public get minutes (): number { return this._dt.getMinutes(); }
    public set minutes ( val: number )
    {
        if ( this.minutes !== val )
        {
            this._dt.setMinutes( val );
            this.emitter.emit( 'change' );
        }
    }
    public get seconds (): number { return this._dt.getSeconds(); }
    public set seconds ( val: number )
    {
        if ( this.seconds !== val )
        {
            this._dt.setSeconds( val );
            // No need to emit this change as Intellicenter only
            // reports to the minute.
            //this.emitter.emit('change');
        }
    }
    public get milliseconds (): number { return this._dt.getMilliseconds(); }
    public set milliseconds ( val: number ) { this._dt.setMilliseconds( val ); }
    public get fullYear (): number { return this._dt.getFullYear(); }
    public set fullYear ( val: number ) { this._dt.setFullYear( val ); }
    public get year (): number { return this._dt.getFullYear(); }
    public set year ( val: number )
    {
        let y = val < 100 ? ( Math.floor( this._dt.getFullYear() / 100 ) * 100 ) + val : val;
        if ( y !== this.year )
        {
            this._dt.setFullYear( y );
            this.emitter.emit( 'change' );
        }
    }
    public get month (): number { return this._dt.getMonth() + 1; }
    public set month ( val: number )
    {
        if ( this.month !== val )
        {
            this._dt.setMonth( val - 1 );
            this.emitter.emit( 'change' );
        }
    }
    public get date (): number { return this._dt.getDate(); }
    public set date ( val: number )
    {
        if ( this.date !== val )
        {
            this._dt.setDate( val );
            this.emitter.emit( 'change' );
        }
    }
    public format (): string { return Timestamp.toISOLocal( this._dt ); }
    public static toISOLocal ( dt ): string
    {
        let tzo = dt.getTimezoneOffset();
        var pad = function ( n )
        {
            var t = Math.floor( Math.abs( n ) );
            return ( t < 10 ? '0' : '' ) + t;
        };
        return new Date( dt.getTime() - ( tzo * 60000 ) ).toISOString().slice( 0, -1 ) + ( tzo > 0 ? '-' : '+' ) + pad( tzo / 60 ) + pad( tzo % 60 )
    }
}
export enum ControllerType
{
    IntelliCenter = 'intellicenter',
    IntelliTouch = 'intellitouch',
    IntelliCom = 'intellicom'
}
export class Enums
{
    // Controller Constants
    public static PanelModes = {
        0: { val: 0, name: 'auto', desc: 'Auto' },
        1: { val: 1, name: 'service', desc: 'Service' },
        128: { val: 128, name: 'timeout', desc: 'Timeout' },
        129: { val: 129, name: 'service-timeout', desc: 'Service/Timeout' },
        transform: function ( byte ) { return extend( true, {}, this[ byte & 0x83 ] ); }
    };
    public static TempUnits = {
        0: { val: 0, name: 'F', desc: 'Fahrenheit' },
        4: { val: 4, name: 'C', desc: 'Celcius' },
        transform: function ( byte )
        {
            console.log( 'Setting Temp Units to byte' + byte, this[ byte ] );
            return extend( true, {}, this[ byte & 0x04 ] );
        }
    };
    public static Addresses = {
        2: { val: 2, name: 'chlorinator', desc: 'Chlorinator' },
        15: { val: 15, name: 'outdoor', desc: 'Main outdoor panel' },
        16: { val: 16, name: 'broadcast', desc: 'Broadcast' },
        33: { val: 33, name: 'intellitouch', desc: 'Intellitouch Plugin' },
        34: { val: 34, name: 'mobi', desc: 'Wireless controller' },
        36: { val: 36, name: 'intellicenter', desc: 'Intellicenter Plugin' },
        37: { val: 37, name: 'indoor2', desc: 'Indoor panel #2' },
        144: { val: 144, name: 'intellichem', desc: 'Intellichem' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static Bodies = {
        0: { val: 0, name: 'pool', desc: 'Pool' },
        1: { val: 1, name: 'spa', desc: 'Spa' },
        32: { val: 32, name: 'poolspa', desc: 'Pool/Spa' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static ControllerStatus = {
        0: { val: 0, name: 'ready', desc: 'Ready', percent: 100 },
        1: { val: 1, name: 'loading', desc: 'Loading', percent: 0 },
        transform: function ( byte, percent?: number )
        {
            let v = extend( true, {}, this[ byte ] || this[ 0 ] );
            if ( typeof ( percent ) !== "undefined" ) v.percent = percent;
            return v;
        }
    }
    // Schedule Constants
    public static ScheduleType = {
        0: { val: 128, name: 'runonce', desc: 'Run Once' },
        128: { val: 0, name: 'repeat', desc: 'Repeats' },
        transform: function ( byte )
        {
            return ( byte & 128 ) > 0 ? extend( true, {}, this[ 128 ] ) : extend( true, {}, this[ 0 ] );
        }
    }
    public static ScheduleDays = {
        1: { val: 1, name: 'sat', desc: 'Saturday', dow: 6 },
        2: { val: 2, name: 'fri', desc: 'Friday', dow: 5 },
        3: { val: 3, name: 'thu', desc: 'Thursday', dow: 4 },
        4: { val: 4, name: 'wed', desc: 'Wednesday', dow: 3 },
        5: { val: 5, name: 'tue', desc: 'Tuesday', dow: 2 },
        6: { val: 6, name: 'mon', desc: 'Monday', dow: 1 },
        7: { val: 7, name: 'sun', desc: 'Sunday', dow: 0 },
        // Return an array based upon the bits present. We want this
        // in reverse order as the bits represented from Intellicenter are reversed.  Saturday is the first day of week.
        transform: function ( byte )
        {
            let days = [];
            for ( let bit = 7; bit >= 0; bit-- )
            {
                if ( ( byte & ( 1 << ( bit - 1 ) ) ) > 0 ) days.push( extend( true, {}, this[ bit ] ) );
            }
            return days;
        }
    }

    // Circuit Constants
    public static CircuitTypes = {
        0: { val: 0, name: 'generic', desc: 'Generic' },
        1: { val: 1, name: 'spillway', desc: 'Spillway' },
        2: { val: 2, name: 'mastercleaner', desc: 'Master Cleaner' },
        3: { val: 3, name: 'chemrelay', desc: 'Chem Relay' },
        4: { val: 4, name: 'light', desc: 'light' },
        5: { val: 5, name: 'intellibrite', desc: 'Intellibrite' },
        6: { val: 6, name: 'globrite', desc: 'GloBrite' },
        7: { val: 7, name: 'globritewhite', desc: 'GloBrite White' },
        8: { val: 8, name: 'magicstream', desc: 'Magicstream' },
        9: { val: 9, name: 'dimmer', desc: 'Dimmer' },
        10: { val: 10, name: 'colorcascade', desc: 'ColorCascade' },
        11: { val: 11, name: 'mastercleaner2', desc: 'Master Cleaner 2' },
        12: { val: 12, name: 'pool', desc: 'Pool' },
        13: { val: 13, name: 'spa', desc: 'Spa' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    // Circuit Constants
    public static CircuitFunctions_IT = {
        0: { val: 0, name: 'generic', desc: 'Generic' },
        1: { val: 1, name: 'spa', desc: 'Spa' },
        2: { val: 2, name: 'Pool', desc: 'Pool' },
        5: { val: 5, name: 'mastercleaner', desc: 'Master Cleaner' },
        7: { val: 7, name: 'light', desc: 'light' },
        9: { val: 9, name: 'samlight', desc: 'SAM Light' },
        10: { val: 10, name: 'sallight', desc: 'SAL Light' },
        11: { val: 11, name: 'photongen', desc: 'Photon Gen' },
        12: { val: 12, name: 'colorwheel', desc: 'Color Wheel' },
        13: { val: 13, name: 'valve', desc: 'valve' },
        14: { val: 14, name: 'spillway', desc: 'Spillway' },
        15: { val: 15, name: 'floorcleaner', desc: 'Floor Cleaner' },
        16: { val: 16, name: 'intellibrite', desc: 'Intellibrite' },
        17: { val: 17, name: 'magicstream', desc: 'MagicStream' },
        19: { val: 19, name: 'notused', desc: 'Not Used' },
        64: { val: 64, name: 'freeze', desc: 'Freeze Protection' },
        128: { val: 128, name: 'solaractive', desc: 'Solar Active' },
        129: { val: 129, name: 'eitherheater', desc: 'Either Heater' },
        130: { val: 130, name: 'poolheater', desc: 'Pool Heater' },
        131: { val: 131, name: 'spaheater', desc: 'spa Heater' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static VirtualCircuits = {
        // NOTE: I think this is a bug in Intellicenter as 37-39 should be not defined the first 40 circuits are
        // occupied by relay circuits and 129 to 192 are occupied by features and 192+ is occupied by circuit groups.
        // 37-39 overlap the standard circuits.  The website omits the 2 in front of the id.
        237: { id: 237, name: 'Heat Boost' },
        238: { id: 238, name: 'Heat Enable' },
        239: { id: 239, name: 'Pump Speed +' },
        240: { id: 240, name: 'Pump Speed -' },
        244: { id: 244, name: 'Pool Heater' },
        245: { id: 245, name: 'Spa Heater' },
        246: { id: 246, name: 'Freeze' },
        247: { id: 247, name: 'Pool/Spa' },
        248: { id: 248, name: 'Solar Heat' },
        251: { id: 251, name: 'Heater' },
        252: { id: 252, name: 'Solar' },
        255: { id: 255, name: 'Pool Heat Enable' },
        get: function ( id: number ) { return extend( true, {}, { id: id, name: 'Unknown ' + id }, this[ id ], { showInFeatures: false, showInCircuits: false } ); }
    }
    public static CircuitGroupTypes = {
        0: { val: 0, name: 'none', desc: 'Unspecified' },
        1: { val: 1, name: 'light', desc: 'Light' },
        2: { val: 2, name: 'circuit', desc: 'Circuit' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }

    public static LightThemes = {
        0: { val: 0, name: 'white', desc: 'White' },
        1: { val: 1, name: 'green', desc: 'Green' },
        2: { val: 2, name: 'blue', desc: 'Blue' },
        3: { val: 3, name: 'magenta', desc: 'Magenta' },
        4: { val: 4, name: 'red', desc: 'Red' },
        //5: { val: 5, name: '', desc: '' },  There is no intellibrite 5.
        6: { val: 6, name: 'party', desc: 'Party' },
        7: { val: 7, name: 'romance', desc: 'Romance' },
        8: { val: 8, name: 'caribbean', desc: 'Caribbean' },
        9: { val: 9, name: 'american', desc: 'American' },
        10: { val: 10, name: 'sunset', desc: 'Sunset' },
        11: { val: 11, name: 'royal', desc: 'Royal' },
        255: { val: 255, name: 'none', desc: 'None' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 255 ] ); },
        get: function ()
        {
            let themes = [];
            for ( let ndx in this )
            {
                if ( typeof ( this[ ndx ] ) !== 'function' ) themes.push( extend( true, {}, this[ ndx ] ) );
            }
            return themes;
        }
    }

    // Heater Constants
    public static HeaterTypes = {
        0: { val: 0, name: 'none', desc: 'No Heater' },
        1: { val: 1, name: 'gas', desc: 'Gas Heater' },
        2: { val: 2, name: 'solar', desc: 'Solar Heater' },
        3: { val: 3, name: 'heatpump', desc: 'Heat Pump' },
        4: { val: 4, name: 'ultratemp', desc: 'Ultratemp' },
        5: { val: 5, name: 'hybrid', desc: 'hybrid' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static HeatSource = {
        0: { val: 0, name: 'off', desc: 'No Heater' },
        3: { val: 3, name: 'heater', desc: 'Heater' },
        5: { val: 5, name: 'solar', desc: 'Solar Only' },
        21: { val: 21, name: 'solarpref', desc: 'Solar Preferred' },
        32: { val: 32, name: 'nochange', desc: 'No Change' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static HeatMode = {
        0: { val: 0, name: 'off', desc: 'Off' },
        3: { val: 3, name: 'heater', desc: 'Heater' },
        5: { val: 5, name: 'solar', desc: 'Solar Only' },
        21: { val: 21, name: 'solarpref', desc: 'Solar Preferred' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static HeatStatus = {
        0: { val: 0, name: 'off', desc: 'Off' },
        1: { val: 1, name: 'heater', desc: 'Heater' },
        2: { val: 2, name: 'solar', desc: 'Solar' },
        transform: function ( byte )
        {
            return extend( true, {}, this[ byte ] || this[ 0 ] );
        }
    }

    // Pump Constants
    public static pumpUnits = {
        0: { val: 0, name: 'rpm', desc: 'RPM' },
        1: { val: 1, name: 'gpm', desc: 'GPM' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static PumpTypes = {
        0: { val: 0, name: 'none', desc: 'No pump' },
        1: { val: 1, name: 'ss', desc: 'Single Speed' },
        2: { val: 2, name: 'ds', desc: 'Two Speed' },
        3: { val: 3, name: 'vs', desc: 'Intelliflo VS' },
        4: { val: 4, name: 'vsf', desc: 'Intelliflo VSF' },
        5: { val: 5, name: 'vf', desc: 'Intelliflo VF' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
    }
    public static PumpErrors = {
        0: { val: 0, name: 'stoppedok', desc: 'Ok - Stopped' },
        1: { val: 1, name: 'runningok', desc: 'Ok - Running' },
        2: { val: 2, name: 'filter', desc: 'Filter warning' },
        3: { val: 3, name: 'overcurrent', desc: 'Overcurrent condition' },
        4: { val: 4, name: 'priming', desc: 'Priming alarm' },
        5: { val: 5, name: 'blocked', desc: 'System blocked' },
        6: { val: 6, name: 'general', desc: 'General alarm' },
        7: { val: 7, name: 'overtemp', desc: 'Overtemp condition' },
        8: { val: 8, name: 'power', dec: 'Power outage' },
        9: { val: 9, name: 'overcurrent2', desc: 'Overcurrent condition 2' },
        10: { val: 10, name: 'overvoltage', desc: 'Overvoltage condition' },
        11: { val: 11, name: 'error11', desc: 'Unspecified Error 11' },
        12: { val: 12, name: 'error12', desc: 'Unspecified Error 12' },
        13: { val: 13, name: 'error13', desc: 'Unspecified Error 13' },
        14: { val: 14, name: 'error14', desc: 'Unspecified Error 14' },
        15: { val: 15, name: 'error15', desc: 'Unspecified Error 15' },
        16: { val: 18, name: 'commfailure', desc: 'Communication failure' },
        transform: function ( byte )
        {
            for ( let b = 16; b >= 0; b-- )
            {
                let bit = ( 1 << ( b - 1 ) );
                let ndx = ( byte & bit );
                if ( ( byte & bit ) >= 0 )
                {
                    if ( typeof ( this[ ndx ] ) !== "undefined" )
                    {
                        return extend( true, {}, this[ ndx ], { val: byte } );
                    }
                }
            }
            return { val: byte, name: 'error' + byte, desc: 'Unspecified Error ' + byte };
        }
    };
    // Chlorinator Constants
    public static ChlorinatorStatus = {
        0: { val: 0, name: 'ok', desc: 'Ok' },
        1: { val: 1, name: 'lowflow', desc: 'Low Flow' },
        2: { val: 2, name: 'lowsalt', desc: 'Low Salt' },
        3: { val: 3, name: 'verylowsalt', desc: 'Very Low Salt' },
        4: { val: 4, name: 'highcurrent', desc: 'High Current' },
        5: { val: 5, name: 'clean', desc: 'Clean Cell' },
        6: { val: 6, name: 'lowvoltage', desc: 'Low Voltage' },
        7: { val: 7, name: 'lowtemp', dest: 'Water Temp Low' },
        8: { val: 8, name: 'commlost', desc: 'Communication Lost' },
        transform: function ( byte )
        {
            if ( byte === 128 ) return { val: 128, name: 'commlost', desc: 'Communication Lost' };
            else if ( byte === 0 ) return { val: 0, name: 'ok', desc: 'Ok' };
            for ( let b = 8; b >= 0; b-- )
            {
                let bit = ( 1 << ( b ) );
                let ndx = ( byte & bit );
                if ( ( byte & bit ) > 0 )
                {
                    if ( typeof ( this[ ndx ] ) !== "undefined" )
                    {
                        return extend( true, {}, this[ ndx ], { val: byte & 0x00FF } );
                    }
                }
            }
            return { val: byte, name: 'unknown' + byte, desc: 'Unknown status ' + byte };
        }
    };

    public static IntelliTouchCircuitNames = {
        0: { val: 0, name: 'notused', desc: 'NOT USED' },
        1: { val: 1, name: 'aerator', desc: 'AERATOR' },
        2: { val: 2, name: 'airblower', desc: 'AIR BLOWER' },
        3: { val: 3, name: 'aux1', desc: 'AUX 1' },
        4: { val: 4, name: 'aux2', desc: 'AUX 2' },
        5: { val: 5, name: 'aux3', desc: 'AUX 3' },
        6: { val: 6, name: 'aux4', desc: 'AUX 4' },
        7: { val: 7, name: 'aux5', desc: 'AUX 5' },
        8: { val: 8, name: 'aux6', desc: 'AUX 6' },
        9: { val: 9, name: 'aux7', desc: 'AUX 7' },
        10: { val: 10, name: 'aux8', desc: 'AUX 8' },
        11: { val: 11, name: 'aux9', desc: 'AUX 9' },
        12: { val: 12, name: 'auk10', desc: 'AUX 10' },
        13: { val: 13, name: 'backwash', desc: 'BACKWASH' },
        14: { val: 14, name: 'backlight', desc: 'BACK LIGHT' },
        15: { val: 15, name: 'bbqlight', desc: 'BBQ LIGHT' },
        16: { val: 16, name: 'beachlight', desc: 'BEACH LIGHT' },
        17: { val: 17, name: 'boosterpump', desc: 'BOOSTER PUMP' },
        18: { val: 18, name: 'buglight', desc: 'BUG LIGHT' },
        19: { val: 19, name: 'cabanalts', desc: 'CABANA LTS' },
        20: { val: 20, name: 'chem.feeder', desc: 'CHEM. FEEDER' },
        21: { val: 21, name: 'chlorinator', desc: 'CHLORINATOR' },
        22: { val: 22, name: 'cleaner', desc: 'CLEANER' },
        23: { val: 23, name: 'colorwheel', desc: 'COLOR WHEEL' },
        24: { val: 24, name: 'decklight', desc: 'DECK LIGHT' },
        25: { val: 25, name: 'drainline', desc: 'DRAIN LINE' },
        26: { val: 26, name: 'drivelight', desc: 'DRIVE LIGHT' },
        27: { val: 27, name: 'edgepump', desc: 'EDGE PUMP' },
        28: { val: 28, name: 'entrylight', desc: 'ENTRY LIGHT' },
        29: { val: 29, name: 'fan', desc: 'FAN' },
        30: { val: 30, name: 'fiberoptic', desc: 'FIBER OPTIC' },
        31: { val: 31, name: 'fiberworks', desc: 'FIBER WORKS' },
        32: { val: 32, name: 'fillline', desc: 'FILL LINE' },
        33: { val: 33, name: 'floorclnr', desc: 'FLOOR CLNR' },
        34: { val: 34, name: 'fogger', desc: 'FOGGER' },
        35: { val: 35, name: 'fountain', desc: 'FOUNTAIN' },
        36: { val: 36, name: 'fountain1', desc: 'FOUNTAIN 1' },
        37: { val: 37, name: 'fountain2', desc: 'FOUNTAIN 2' },
        38: { val: 38, name: 'fountain3', desc: 'FOUNTAIN 3' },
        39: { val: 39, name: 'fountains', desc: 'FOUNTAINS' },
        40: { val: 40, name: 'frontlight', desc: 'FRONT LIGHT' },
        41: { val: 41, name: 'gardenlts', desc: 'GARDEN LTS' },
        42: { val: 42, name: 'gazebolts', desc: 'GAZEBO LTS' },
        43: { val: 43, name: 'highspeed', desc: 'HIGH SPEED' },
        44: { val: 44, name: 'hi-temp', desc: 'HI-TEMP' },
        45: { val: 45, name: 'houselight', desc: 'HOUSE LIGHT' },
        46: { val: 46, name: 'jets', desc: 'JETS' },
        47: { val: 47, name: 'lights', desc: 'LIGHTS' },
        48: { val: 48, name: 'lowspeed', desc: 'LOW SPEED' },
        49: { val: 49, name: 'lo-temp', desc: 'LO-TEMP' },
        50: { val: 50, name: 'malibults', desc: 'MALIBU LTS' },
        51: { val: 51, name: 'mist', desc: 'MIST' },
        52: { val: 52, name: 'music', desc: 'MUSIC' },
        53: { val: 53, name: 'notused', desc: 'NOT USED' },
        54: { val: 54, name: 'ozonator', desc: 'OZONATOR' },
        55: { val: 55, name: 'pathlightn', desc: 'PATH LIGHTS' },
        56: { val: 56, name: 'patiolts', desc: 'PATIO LTS' },
        57: { val: 57, name: 'perimeterl', desc: 'PERIMETER L' },
        58: { val: 58, name: 'pg2000', desc: 'PG2000' },
        59: { val: 59, name: 'pondlight', desc: 'POND LIGHT' },
        60: { val: 60, name: 'poolpump', desc: 'POOL PUMP' },
        61: { val: 61, name: 'pool', desc: 'POOL' },
        62: { val: 62, name: 'poolhigh', desc: 'POOL HIGH' },
        63: { val: 63, name: 'poollight', desc: 'POOL LIGHT' },
        64: { val: 64, name: 'poollow', desc: 'POOL LOW' },
        65: { val: 65, name: 'sam', desc: 'SAM' },
        66: { val: 66, name: 'poolsam1', desc: 'POOL SAM 1' },
        67: { val: 67, name: 'poolsam2', desc: 'POOL SAM 2' },
        68: { val: 68, name: 'poolsam3', desc: 'POOL SAM 3' },
        69: { val: 69, name: 'securitylt', desc: 'SECURITY LT' },
        70: { val: 70, name: 'slide', desc: 'SLIDE' },
        71: { val: 71, name: 'solar', desc: 'SOLAR' },
        72: { val: 72, name: 'spa', desc: 'SPA' },
        73: { val: 73, name: 'spahigh', desc: 'SPA HIGH' },
        74: { val: 74, name: 'spalight', desc: 'SPA LIGHT' },
        75: { val: 75, name: 'spalow', desc: 'SPA LOW' },
        76: { val: 76, name: 'spasal', desc: 'SPA SAL' },
        77: { val: 77, name: 'spasam', desc: 'SPA SAM' },
        78: { val: 78, name: 'spawtrfll', desc: 'SPA WTRFLL' },
        79: { val: 79, name: 'spillway', desc: 'SPILLWAY' },
        80: { val: 80, name: 'sprinklers', desc: 'SPRINKLERS' },
        81: { val: 81, name: 'stream', desc: 'STREAM' },
        82: { val: 82, name: 'statuelt', desc: 'STATUE LT' },
        83: { val: 83, name: 'swimjets', desc: 'SWIM JETS' },
        84: { val: 84, name: 'wtrfeature', desc: 'WTR FEATURE' },
        85: { val: 85, name: 'wtrfeatlt', desc: 'WTR FEAT LT' },
        86: { val: 86, name: 'waterfall', desc: 'WATERFALL' },
        87: { val: 87, name: 'waterfall1', desc: 'WATERFALL 1' },
        88: { val: 88, name: 'waterfall2', desc: 'WATERFALL 2' },
        89: { val: 89, name: 'waterfall3', desc: 'WATERFALL 3' },
        90: { val: 90, name: 'whirlpool', desc: 'WHIRLPOOL' },
        91: { val: 91, name: 'wtrflght', desc: 'WTRFL LGHT' },
        92: { val: 92, name: 'yardlight', desc: 'YARD LIGHT' },
        93: { val: 93, name: 'auxextra', desc: 'AUX EXTRA' },
        94: { val: 94, name: 'feature1', desc: 'FEATURE 1' },
        95: { val: 95, name: 'feature2', desc: 'FEATURE 2' },
        96: { val: 96, name: 'feature3', desc: 'FEATURE 3' },
        97: { val: 97, name: 'feature4', desc: 'FEATURE 4' },
        98: { val: 98, name: 'feature5', desc: 'FEATURE 5' },
        99: { val: 99, name: 'feature6', desc: 'FEATURE 6' },
        100: { val: 100, name: 'feature7', desc: 'FEATURE 7' },
        101: { val: 101, name: 'feature8', desc: 'FEATURE 8' },
        transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); },
    }


}