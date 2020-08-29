/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as extend from 'extend';
import { EventEmitter } from 'events';
export class Heliotrope {
    constructor() {
        this.isCalculated = false;
        this._zenith = 90 + 50 / 60;
    }
    private dMath = {
        sin: function (deg) { return Math.sin(deg * Math.PI / 180); },
        cos: function (deg) { return Math.cos(deg * Math.PI / 180); },
        tan: function (deg) { return Math.tan(deg * Math.PI / 180); },
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
            this.dt.getDate() !== dt.getDate()) this.isCalculated = false;
        this.dt = dt;
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
    private get longitudeHours(): number { return this.longitude / 15; }
    private get doy(): number {
        let month = this.dt.getMonth() + 1;
        let day = this.dt.getDate();
        let year = this.dt.getFullYear();
        return Math.floor(275 * month / 9)
            - (Math.floor((month + 9) / 12)
                * (1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3)))
            + day - 30;
    }
    private get riseApproxTime(): number { return this.doy + ((6 - this.longitudeHours) / 24); } // Check
    private get setApproxTime(): number { return this.doy + ((18 - this.longitudeHours) / 24); }
    private get riseAnomaly(): number { return (this.riseApproxTime * 0.9856) - 3.289; } // Check
    private get setAnomaly(): number { return (this.setApproxTime * 0.9856) - 3.289; }
    private calcTrueLongitude(anomaly: number) { return (anomaly + (1.916 + this.dMath.sin(anomaly)) + (0.20 * this.dMath.sin(2 * anomaly)) + 282.634) % 360; }
    private get riseLongitude(): number { return this.calcTrueLongitude(this.riseAnomaly); } // Check
    private get setLongitude(): number { return this.calcTrueLongitude(this.setAnomaly); }
    private calcRightAscension(trueLongitude) {
        let asc = this.dMath.atan(0.91764 * this.dMath.tan(trueLongitude)) % 360;
        let lQuad = Math.floor(trueLongitude / 90) * 90;
        let ascQuad = Math.floor(asc / 90) * 90;
        return asc + (lQuad - ascQuad) / 15;
    }
    private get riseAscension(): number { return this.calcRightAscension(this.riseLongitude); }
    private get setAscension(): number { return this.calcRightAscension(this.setLongitude); }
    private calcSinDeclination(trueLongitude: number): number { return 0.39782 * this.dMath.sin(trueLongitude); }
    private calcCosDeclination(sinDeclination: number): number { return this.dMath.cos(this.dMath.asin(sinDeclination)); }
    private get riseSinDeclination(): number { return this.calcSinDeclination(this.riseLongitude); }
    private get setSinDeclination(): number { return this.calcSinDeclination(this.setLongitude); }
    private get riseCosDeclination(): number { return this.calcCosDeclination(this.riseSinDeclination); }
    private get setCosDeclination(): number { return this.calcCosDeclination(this.setSinDeclination); }
    private calcLocalHourAngle(sinDeclination: number, cosDeclination: number): number { return (this.dMath.cos(this.zenith) - (sinDeclination * this.dMath.sin(this.latitude))) / (cosDeclination * this.dMath.cos(this.latitude)); }
    private get riseLocalTime(): number {
        let ha = this.calcLocalHourAngle(this.riseSinDeclination, this.riseCosDeclination);
        if (ha >= -1 && ha <= 1) {
            let h = (360 - this.dMath.acos(ha)) / 15;
            return (h + this.riseAscension - (0.06571 * this.riseApproxTime) - 6.622);
        }
        // The sun never rises here.
        return;
    }
    private get setLocalTime(): number {
        let ha = this.calcLocalHourAngle(this.setSinDeclination, this.setCosDeclination);
        if (ha >= -1 && ha <= 1) {
            let h = this.dMath.acos(ha) / 15;
            return (h + this.setAscension - (0.06571 * this.setApproxTime) - 6.622);
        }
        // The sun never sets here.
        return;
    }
    private toLocalTime(time: number) {
        let off = -(this.dt.getTimezoneOffset() * 60 * 1000);
        let hours = Math.floor(time);
        let mins = Math.floor(60 * (time - hours));
        let secs = Math.floor(3600 * (time - hours - (mins / 60)));
        let utc = new Date(Date.UTC(this.dt.getUTCFullYear(), this.dt.getUTCMonth(), this.dt.getUTCDate(), hours, mins, secs) + off);
        let dtLocal = new Date(utc.toUTCString());
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
            let riseLocal = this.riseLocalTime;
            let setLocal = this.setLocalTime;
            this._dtSunrise = typeof riseLocal !== 'undefined' ? this.toLocalTime(((riseLocal - this.longitudeHours) + 24) % 24) : undefined;
            this._dtSunset = typeof setLocal !== 'undefined' ? this.toLocalTime(((setLocal - this.longitudeHours) + 24) % 24) : undefined;
            this.isValid = true;
        }
        else {
            //console.log(`Cannot calculate heliotrope: dt:${this.dt} lat:${this.latitude} lon:${this.longitude}`);
            this.isValid = false;
            this._dtSunset = undefined;
            this._dtSunrise = undefined;
        }
        this.isCalculated = true;
    }
    public get sunrise(): Date {
        if (!this.isCalculated) this.calculate();
        return this._dtSunrise;
    }
    public get sunset(): Date {
        if (!this.isCalculated) this.calculate();
        return this._dtSunset;
    }
    public get calculatedTimes(): any {
        return { sunrise: this.sunrise, sunset: this.sunset, isValid: this.isValid };
    }
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
}

export const utils = new Utils();