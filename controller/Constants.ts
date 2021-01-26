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
import { EventEmitter } from 'events';
import { logger } from "../logger/Logger";
export class Heliotrope {
    constructor() {
        this.isCalculated = false;
        this._zenith = 90 + 50 / 60;
    }
    private dMath = {
        sin: function (deg) { return Math.sin(deg * (Math.PI / 180)); },
        cos: function (deg) { return Math.cos(deg * (Math.PI / 180)); },
        tan: function (deg) { return Math.tan(deg * (Math.PI / 180)); },
        asin: function (x) { return (180 / Math.PI) * Math.asin(x); },
        acos: function (x) { return (180 / Math.PI) * Math.acos(x); },
        atan: function (x) { return (180 / Math.PI) * Math.atan(x); }
    }
    public isCalculated: boolean = false;
    public isValid: boolean = false;
    public get date() { return this.dt; }
    public set date(dt: Date) {
        if (typeof this.dt === 'undefined' ||
            this.dt.getFullYear() !== dt.getFullYear() ||
            this.dt.getMonth() !== dt.getMonth() ||
            this.dt.getDate() !== dt.getDate()) {
            this.isCalculated = false;
            // Always store a copy since we don't want to create instances where the change doesn't get reflected.  This
            // also could hold onto references that we don't want held for garbage cleanup.
            this.dt = typeof dt !== 'undefined' && typeof dt.getMonth === 'function' ? new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(),
                dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds()) : undefined;
        }
    }
    public get longitude() { return this._longitude; }
    public set longitude(lon: number) {
        if (this._longitude !== lon) this.isCalculated = false;
        this._longitude = lon;
    }
    public get latitude() { return this._latitude; }
    public set latitude(lat: number) {
        if (this._latitude !== lat) this.isCalculated = false;
        this._latitude = lat;
    }
    public get zenith() { return this._zenith; }
    public set zenith(zen: number) {
        if (this._zenith !== zen) this.isCalculated = false;
        this._zenith = zen;
    }
    private dt: Date;
    private _longitude: number;
    private _latitude: number;
    private _zenith: number;
    private _dtSunrise: Date;
    private _dtSunset: Date;
    private get longitudeHours(): number { return this.longitude / 15.0; }
    private get doy(): number { return Math.ceil((this.dt.getTime() - new Date(this.dt.getFullYear(), 0, 1).getTime()) / 8.64e7); }
    private get sunriseApproxTime(): number { return this.doy + ((6.0 - this.longitudeHours) / 24.0); }
    private get sunsetApproxTime(): number { return this.doy + ((18.0 - this.longitudeHours) / 24.0); }
    private get sunriseAnomaly(): number { return (this.sunriseApproxTime * 0.9856) - 3.289; }
    private get sunsetAnomaly(): number { return (this.sunsetApproxTime * 0.9856) - 3.289; }
    private calcTrueLongitude(anomaly: number) {
        let tl = anomaly + (1.916 * this.dMath.sin(anomaly)) + (0.020 * this.dMath.sin(2 * anomaly)) + 282.634;
        while (tl >= 360.0) tl -= 360.0;
        while (tl < 0) tl += 360.0;
        return tl;
    }
    private get sunriseLongitude(): number { return this.calcTrueLongitude(this.sunriseAnomaly); } // Check
    private get sunsetLongitude(): number { return this.calcTrueLongitude(this.sunsetAnomaly); }
    private calcRightAscension(trueLongitude) {
        let asc = this.dMath.atan(0.91764 * this.dMath.tan(trueLongitude));
        while (asc >= 360.0) asc -= 360.0;
        while (asc < 0) asc += 360.0;
        let lQuad = Math.floor(trueLongitude / 90.0) * 90.0;
        let ascQuad = Math.floor(asc / 90.0) * 90.0;
        return (asc + (lQuad - ascQuad)) / 15.0;
    }
    private get sunriseAscension(): number { return this.calcRightAscension(this.sunriseLongitude); }
    private get sunsetAscension(): number { return this.calcRightAscension(this.sunsetLongitude); }
    private calcSinDeclination(trueLongitude: number): number { return 0.39782 * this.dMath.sin(trueLongitude); }
    private calcCosDeclination(sinDeclination: number): number { return this.dMath.cos(this.dMath.asin(sinDeclination)); }
    private get sunriseSinDeclination(): number { return this.calcSinDeclination(this.sunriseLongitude); }
    private get sunsetSinDeclination(): number { return this.calcSinDeclination(this.sunsetLongitude); }
    private get sunriseCosDeclination(): number { return this.calcCosDeclination(this.sunriseSinDeclination); }
    private get sunsetCosDeclination(): number { return this.calcCosDeclination(this.sunsetSinDeclination); }
    private calcLocalHourAngle(sinDeclination: number, cosDeclination: number): number { return (this.dMath.cos(this.zenith) - (sinDeclination * this.dMath.sin(this.latitude))) / (cosDeclination * this.dMath.cos(this.latitude)); }
    private get sunriseLocalTime(): number {
        let ha = this.calcLocalHourAngle(this.sunriseSinDeclination, this.sunriseCosDeclination);
        if (ha >= -1 && ha <= 1) {
            let h = (360 - this.dMath.acos(ha)) / 15;
            return (h + this.sunriseAscension - (0.06571 * this.sunriseApproxTime) - 6.622);
        }
        // The sun never rises here.
        return;
    }
    private get sunsetLocalTime(): number {
        let ha = this.calcLocalHourAngle(this.sunsetSinDeclination, this.sunsetCosDeclination);
        if (ha >= -1 && ha <= 1) {
            let h = this.dMath.acos(ha) / 15;
            return (h + this.sunsetAscension - (0.06571 * this.sunsetApproxTime) - 6.622);
        }
        // The sun never sets here.
        return;
    }
    private toLocalTime(time: number) {
        let off = -(this.dt.getTimezoneOffset() * 60 * 1000);
        let utcHours = Math.floor(time);
        let utcMins = Math.floor(60 * (time - utcHours));
        let utcSecs = Math.floor(3600 * (time - utcHours - (utcMins / 60)));
        let dtLocal = new Date(new Date(this.dt.getFullYear(), this.dt.getMonth(), this.dt.getDate(), utcHours, utcMins, utcSecs).getTime() + off);
        dtLocal.setFullYear(this.dt.getFullYear(), this.dt.getMonth(), this.dt.getDate());
        return dtLocal;
    }
    public get isNight(): boolean {
        let times = this.calculatedTimes;
        if (this.isValid) {
            let time = new Date().getTime();
            if (time >= times.sunset.getTime() && time < times.sunrise.getTime()) return true;
        }
        return false;
    }
    public calculate() {
        if (typeof this.dt !== 'undefined'
            && typeof this._latitude !== 'undefined'
            && typeof this._longitude !== 'undefined'
            && typeof this._zenith !== 'undefined') {
            let sunriseLocal = this.sunriseLocalTime;
            let sunsetLocal = this.sunsetLocalTime;
            if (typeof sunriseLocal !== 'undefined') {
                sunriseLocal = (sunriseLocal - this.longitudeHours);
                while (sunriseLocal >= 24) sunriseLocal -= 24;
                while (sunriseLocal < 0) sunriseLocal += 24;
                this._dtSunrise = this.toLocalTime(sunriseLocal);
            }
            else this._dtSunrise = undefined;
            if (typeof sunsetLocal !== 'undefined') {
                sunsetLocal = (sunsetLocal - this.longitudeHours);
                while (sunsetLocal >= 24) sunsetLocal -= 24;
                while (sunsetLocal < 0) sunsetLocal += 24;
                this._dtSunset = this.toLocalTime(sunsetLocal);
            }
            else this._dtSunset = undefined;
            logger.verbose(`sunriseLocal:${sunriseLocal} sunsetLocal:${sunsetLocal} Calculating Heliotrope Valid`);
            this.isValid = typeof this._dtSunrise !== 'undefined' && typeof this._dtSunset !== 'undefined';
            this.isCalculated = true;
        }
        else {
            logger.warn(`dt:${this.dt} lat:${this._latitude} lon:${this._longitude} Not enough information to calculate Heliotrope.  See https://github.com/tagyoureit/nodejs-poolController/issues/245`);
            this.isValid = false;
            this._dtSunset = undefined;
            this._dtSunrise = undefined;
            this.isCalculated = false;
        }

    }
    public get sunrise(): Date {
        if (!this.isCalculated) this.calculate();
        return this._dtSunrise;
    }
    public get sunset(): Date {
        if (!this.isCalculated) this.calculate();
        return this._dtSunset;
    }
    public get calculatedTimes(): any { return { sunrise: this.sunrise, sunset: this.sunset, isValid: this.isValid }; }
}
export class Timestamp {
    private _dt: Date;
    public emitter: EventEmitter;
    constructor(dt?: Date) {
        this._dt = dt || new Date();
        this.emitter = new EventEmitter();
    }
    private _isUpdating: boolean = false;
    public toDate() { return this._dt; }
    public set isUpdating(val:boolean) {this._isUpdating = val;}
    public get isUpdating(): boolean { return this._isUpdating;}
    public get hours(): number { return this._dt.getHours(); }
    public set hours(val: number) {
        if (this.hours !== val) {
            this._dt.setHours(val);
            this.emitter.emit('change');
        }
    }
    public get minutes(): number { return this._dt.getMinutes(); }
    public set minutes(val: number) {
        if (this.minutes !== val) {
            this._dt.setMinutes(val);
            this.emitter.emit('change');
        }
    }
    public get seconds(): number { return this._dt.getSeconds(); }
    public set seconds(val: number) {
        if (this.seconds !== val) {
            this._dt.setSeconds(val);
            // No need to emit this change as Intellicenter only
            // reports to the minute.
            //this.emitter.emit('change');
        }
    }
    public get milliseconds(): number { return this._dt.getMilliseconds(); }
    public set milliseconds(val: number) { this._dt.setMilliseconds(val); }
    public get fullYear(): number { return this._dt.getFullYear(); }
    public set fullYear(val: number) { this._dt.setFullYear(val); }
    public get year(): number { return this._dt.getFullYear(); }
    public set year(val: number) {
        let y = val < 100 ? (Math.floor(this._dt.getFullYear() / 100) * 100) + val : val;
        if (y !== this.year) {
            this._dt.setFullYear(y);
            this.emitter.emit('change');
        }
    }
    public get month(): number { return this._dt.getMonth() + 1; }
    public set month(val: number) {
        if (this.month !== val) {
            this._dt.setMonth(val - 1);
            this.emitter.emit('change');
        }
    }
    public get date(): number { return this._dt.getDate(); }
    public set date(val: number) {
        if (this.date !== val) {
            this._dt.setDate(val);
            this.emitter.emit('change');
        }
    }
    public get dayOfWeek(): number {
        // for IntelliTouch set date/time
        if (this._dt.getUTCDay() === 0)
            return 0;
        else
            return Math.pow(2, this._dt.getUTCDay() - 1);
    }
    public getTime() { return this._dt.getTime(); }
    public format(): string { return Timestamp.toISOLocal(this._dt); }
    public static toISOLocal(dt): string {
        let tzo = dt.getTimezoneOffset();
        var pad = function (n) {
            var t = Math.floor(Math.abs(n));
            return (t < 10 ? '0' : '') + t;
        };
        return new Date(dt.getTime() - (tzo * 60000)).toISOString().slice(0, -1) + (tzo > 0 ? '-' : '+') + pad(tzo / 60) + pad(tzo % 60)
    }
    public setTimeFromSystemClock(){
        this._dt = new Date();
        this.emitter.emit('change');
    }
    public calcTZOffset(): {tzOffset:number, adjustDST:boolean}{
        let obj = {tzOffset: 0, adjustDST: false};
        let dateJan = new Date(this._dt.getFullYear(), 0, 1, 2);
        let dateJul = new Date(this._dt.getFullYear(), 6, 1, 2);
        obj.tzOffset = dateJan.getTimezoneOffset() / 60 * -1;
        obj.adjustDST = dateJan.getTimezoneOffset() - dateJul.getTimezoneOffset() > 0; 
        return obj;
    }
}
export enum ControllerType {
    IntelliCenter = 'intellicenter',
    IntelliTouch = 'intellitouch',
    IntelliCom = 'intellicom',
    EasyTouch = 'easytouch',
    Unknown = 'unknown',
    Virtual = 'virtual'
}
export enum VirtualDeviceType {
    Pump = 'pump',
    Chlorinator = 'chlorinator'
}
//export class Enums {
//    public static Addresses = {
//        2: { val: 2, name: 'chlorinator', desc: 'Chlorinator' },
//        15: { val: 15, name: 'outdoor', desc: 'Main outdoor panel' },
//        16: { val: 16, name: 'broadcast', desc: 'Broadcast' },
//        33: { val: 33, name: 'intellitouch', desc: 'Intellitouch Plugin' },
//        34: { val: 34, name: 'mobi', desc: 'Wireless controller' },
//        36: { val: 36, name: 'intellicenter', desc: 'Intellicenter Plugin' },
//        37: { val: 37, name: 'indoor2', desc: 'Indoor panel #2' },
//        144: { val: 144, name: 'intellichem', desc: 'Intellichem' },
//        transform: function (byte) { return extend(true, {}, this[byte] || this[0]); }
//    }
//}

export class Utils {
    public makeBool(val) {
        if (typeof (val) === 'boolean') return val;
        if (typeof (val) === 'undefined') return false;
        if (typeof (val) === 'number') return val >= 1;
        if (typeof (val) === 'string') {
            if (val === '' || typeof val === 'undefined') return false;
            switch (val.toLowerCase().trim()) {
                case 'on':
                case 'true':
                case 'yes':
                case 'y':
                    return true;
                case 'off':
                case 'false':
                case 'no':
                case 'n':
                    return false;
            }
            if (!isNaN(parseInt(val, 10))) return parseInt(val, 10) >= 1;
        }
        return false;
    }
    public uuid(a?, b?) { for (b = a = ''; a++ < 36; b += a * 51 & 52 ? (a ^ 15 ? 8 ^ Math.random() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '-'); return b }
    public convert = {
        temperature: {
            f: {
                k: (val) => { return (val - 32) * (5 / 9) + 273.15; },
                c: (val) => { return (val - 32) * (5 / 9); },
                f: (val) => { return val; }
            },
            c: {
                k: (val) => { return val + 273.15; },
                c: (val) => { return val; },
                f: (val) => { return (val * (9 / 5)) + 32; }
            },
            k: {
                k: (val) => { return val; },
                c: (val) => { return val - 273.15; },
                f: (val) => { return ((val - 273.15) * (9 / 5)) + 32; }
            },
            convertUnits: (val: number, from: string, to: string) => {
                if (typeof val !== 'number') return null;
                let fn = this.convert.temperature[from.toLowerCase()];
                if (typeof fn !== 'undefined' && typeof fn[to.toLowerCase()] === 'function') return fn[to.toLowerCase()](val);
            }
        },
        volume: {
            gal: {
                l: (val) => { return val * 3.78541; },
                ml: (val) => { return val * 3.78541 * 1000; },
                cl: (val) => { return val * 3.78541 * 100; },
                gal: (val) => { return val; },
                oz: (val) => { return val * 128; },
                pint: (val) => { return val / 8; },
                qt: (val) => { return val / 4; },
            },
            l: {
                l: (val) => { return val; },
                ml: (val) => { return val * 1000; },
                cl: (val) => { return val * 100; },
                gal: (val) => { return val * 0.264172; },
                oz: (val) => { return val * 33.814; },
                pint: (val) => { return val * 2.11338; },
                qt: (val) => { return val * 1.05669; },
            },
            ml: {
                l: (val) => { return val * .001; },
                ml: (val) => { return val; },
                cl: (val) => { return val * .1; },
                gal: (val) => { return val * 0.000264172; },
                oz: (val) => { return val * 0.033814; },
                pint: (val) => { return val * 0.00211338; },
                qt: (val) => { return val * 0.00105669; },
            },
            cl: {
                l: (val) => { return val * .01; },
                ml: (val) => { return val * 10; },
                cl: (val) => { return val; },
                gal: (val) => { return val * 0.00264172; },
                oz: (val) => { return val * 0.33814; },
                pint: (val) => { return val * 0.0211338; },
                qt: (val) => { return val * 0.0105669; },
            },
            oz: {
                l: (val) => { return val * 0.0295735; },
                ml: (val) => { return val * 29.5735; },
                cl: (val) => { return val * 2.95735; },
                gal: (val) => { return val * 0.0078125; },
                oz: (val) => { return val; },
                pint: (val) => { return val * 0.0625; },
                qt: (val) => { return val * 0.03125; },
            },
            pint: {
                l: (val) => { return val * 0.473176; },
                ml: (val) => { return val * 473.176; },
                cl: (val) => { return val * 47.3176; },
                gal: (val) => { return val * 0.125; },
                oz: (val) => { return val * 16; },
                pint: (val) => { return val; },
                qt: (val) => { return val * 0.5; },
            },
            qt: {
                l: (val) => { return val * 0.946353; },
                ml: (val) => { return val * 946.353; },
                cl: (val) => { return val * 94.6353; },
                gal: (val) => { return val * 0.25; },
                oz: (val) => { return val * 32; },
                pint: (val) => { return val * 2; },
                qt: (val) => { return val; },

            },
            convertUnits: (val: number, from: string, to: string) => {
                if (typeof val !== 'number') return null;
                let fn = this.convert.volume[from.toLowerCase()];
                if (typeof fn !== 'undefined' && typeof fn[to.toLowerCase()] === 'function') return fn[to.toLowerCase()](val);
            }
        }
    }
    public formatDuration(seconds: number): string {
        if (seconds === 0) return '0sec';
        var fmt = '';
        let hrs = Math.floor(seconds / 3600);
        let min = Math.floor((seconds - (hrs * 3600)) / 60);
        let sec = seconds - ((hrs * 3600) + (min * 60));
        if (hrs > 1) fmt += (hrs.toString() + 'hrs');
        else if (hrs > 0) fmt += (hrs.toString() + 'hr');

        if (min > 0) fmt += ' ' + (min + 'min');
        if (sec > 0) fmt += ' ' + (sec + 'sec');
        return fmt.trim();
    }
    public parseNumber(val: string): number {
        if (typeof val === 'number') return val;
        else if (typeof val === 'undefined' || val === null) return;
        let tval = val.replace(/[^0-9\.\-]+/g, '');
        let v;
        if (tval.indexOf('.') !== -1) {
            v = parseFloat(tval);
            v = this.roundNumber(v, tval.length - tval.indexOf('.'));
        }
        else v = parseInt(tval, 10);
        return v;
    }
    public roundNumber(num, dec) { return +(Math.round(+(num + 'e+' + dec)) + 'e-' + dec); };
    public parseDuration(duration: string): number {
        if (typeof duration === 'number') return parseInt(duration, 10);
        else if (typeof duration !== 'string') return 0;
        let seconds = 0;
        let arr = duration.split(' ');
        for (let i = 0; i < arr.length; i++) {
            let s = arr[i];
            if (s.endsWith('sec')) seconds += this.parseNumber(s);
            if (s.endsWith('min')) seconds += (this.parseNumber(s) * 60);
            if (s.endsWith('hr')) seconds += (this.parseNumber(s) * 3600);
            if (s.endsWith('hrs')) seconds += (this.parseNumber(s) * 3600);
        }
        return seconds;
    }
}

export const utils = new Utils();