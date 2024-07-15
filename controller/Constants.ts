/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as util from 'util';
class HeliotropeContext {
    constructor(longitude: number, latitude: number, zenith: number) {
        this._zenith = typeof zenith !== 'undefined' ? zenith : 90 + 50 / 60;
        this._longitude = longitude;
        this._latitude = latitude;
    }
    private dMath = {
        sin: function (deg) { return Math.sin(deg * (Math.PI / 180)); },
        cos: function (deg) { return Math.cos(deg * (Math.PI / 180)); },
        tan: function (deg) { return Math.tan(deg * (Math.PI / 180)); },
        asin: function (x) { return (180 / Math.PI) * Math.asin(x); },
        acos: function (x) { return (180 / Math.PI) * Math.acos(x); },
        atan: function (x) { return (180 / Math.PI) * Math.atan(x); }
    }
    private dt: Date;
    private _longitude: number;
    private _latitude: number;
    private _zenith: number;
    public get longitude() { return this._longitude; }
    public get latitude() { return this._latitude; }
    public get zenith() { return this._zenith; }
    public get isValid(): boolean { return typeof this._longitude === 'number' && typeof this._latitude === 'number'; }
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
    public calculate(dt: Date): { dt: Date, sunrise: Date, sunset: Date } {
        let times = { dt: this.dt = dt, sunrise: undefined, sunset: undefined };
        if (this.isValid) {
            let sunriseLocal = this.sunriseLocalTime;
            let sunsetLocal = this.sunsetLocalTime;
            if (typeof sunriseLocal !== 'undefined') {
                sunriseLocal = (sunriseLocal - this.longitudeHours);
                while (sunriseLocal >= 24) sunriseLocal -= 24;
                while (sunriseLocal < 0) sunriseLocal += 24;
                times.sunrise = this.toLocalTime(sunriseLocal);
            }
            else times.sunrise = undefined;
            if (typeof sunsetLocal !== 'undefined') {
                sunsetLocal = (sunsetLocal - this.longitudeHours);
                while (sunsetLocal >= 24) sunsetLocal -= 24;
                while (sunsetLocal < 0) sunsetLocal += 24;
                times.sunset = this.toLocalTime(sunsetLocal);
            }
            else times.sunset = undefined;
        }
        return times;
    }

}
export class Heliotrope {
    constructor() {
        this.isCalculated = false;
        this._zenith = 90 + 50 / 60;
    }
    public isCalculated: boolean = false;
    public get isValid(): boolean { return typeof this.dt !== 'undefined' && typeof this.dt.getMonth === 'function' && typeof this._longitude === 'number' && typeof this._latitude === 'number'; }
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
        if (this._longitude !== lon) {
            this.isCalculated = false;
        }
        this._longitude = lon;
    }
    public get latitude() { return this._latitude; }
    public set latitude(lat: number) {
        if (this._latitude !== lat) {
            this.isCalculated = false;
        }
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
    private _dtNextSunrise: Date;
    private _dtNextSunset: Date;
    private _dtPrevSunrise: Date;
    private _dtPrevSunset: Date;
    public get isNight(): boolean {
        let times = this.calculatedTimes;
        if (this.isValid) {
            let time = new Date().getTime();
            if (time >= times.sunset.getTime()) // We are after sunset.
                return time < times.nextSunrise.getTime(); // It is night so long as we are less than the next sunrise.  
                                                           // Normally this would be updated on 1 min after midnight so it should never be true.
            else
                return time < times.sunrise.getTime();     // If the Heliotrope is updated then we need to declare pre-sunrise to be night.
                                                           // This is the normal condition where it would be night since at 1 min after midnight the sunrise/sunset
                                                           // will get updated.  So it will be before sunrise that it will still be night.
        }
        return false;
    }
    public calculate(dt: Date): { isValid: boolean, dt: Date, sunrise: Date, sunset: Date, nextSunrise: Date, nextSunset: Date, prevSunrise: Date, prevSunset: Date } {
        let ctx = new HeliotropeContext(this.longitude, this.latitude, this.zenith);
        let ret = { isValid: ctx.isValid, dt: dt, sunrise: undefined, sunset: undefined, nextSunrise: undefined, nextSunset: undefined, prevSunrise: undefined, prevSunset: undefined };
        if (ctx.isValid) {
            let tToday = ctx.calculate(dt);
            let tTom = ctx.calculate(new Date(dt.getTime() + 86400000));
            let tYesterday = ctx.calculate(new Date(dt.getTime() - 86400000));
            ret.sunrise = tToday.sunrise;
            ret.sunset = tToday.sunset;
            ret.nextSunrise = tTom.sunrise;
            ret.nextSunset = tTom.sunset;
            ret.prevSunrise = tYesterday.sunrise;
            ret.prevSunset = tYesterday.sunset;
        }
        return ret;
    }
    private calcInternal() {
        if (this.isValid) {
            let times = this.calculate(this.dt);
            this._dtSunrise = times.sunrise;
            this._dtSunset = times.sunset;
            this._dtNextSunrise = times.nextSunrise;
            this._dtNextSunset = times.nextSunset;
            this._dtPrevSunrise = times.prevSunrise;
            this._dtPrevSunset = times.prevSunset;
            this.isCalculated = true;
            logger.verbose(`Calculated Heliotrope: sunrise:${Timestamp.toISOLocal(this._dtSunrise)} sunset:${Timestamp.toISOLocal(this._dtSunset)}`);
        }
        else 
            logger.warn(`dt:${this.dt} lat:${this._latitude} lon:${this._longitude} Not enough information to calculate Heliotrope.  See https://github.com/tagyoureit/nodejs-poolController/issues/245`);
    }
    public get sunrise(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtSunrise;
    }
    public get sunset(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtSunset;
    }
    public get nextSunrise(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtNextSunrise;
    }
    public get nextSunset(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtNextSunset;
    }
    public get prevSunrise(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtPrevSunrise;
    }
    public get prevSunset(): Date {
        if (!this.isCalculated) this.calcInternal();
        return this._dtPrevSunset;
    }
    public get calculatedTimes(): { sunrise?: Date, sunset?: Date, nextSunrise?: Date, nextSunset?: Date, prevSunrise?: Date, prevSunset: Date, isValid: boolean } { return { sunrise: this.sunrise, sunset: this.sunset, nextSunrise: this.nextSunrise, nextSunset: this.nextSunset, prevSunrise: this.prevSunrise, prevSunset: this.prevSunset, isValid: this.isValid }; }
    public calcAdjustedTimes(dt: Date, hours = 0, min = 0): { sunrise?: Date, sunset?: Date, nextSunrise?: Date, nextSunset?: Date, prevSunrise?: Date, prevSunset: Date, isValid: boolean } {
        if (this.dt.getFullYear() === dt.getFullYear() && this.dt.getMonth() === dt.getMonth() && this.dt.getDate() === dt.getDate()) return this.getAdjustedTimes(hours, min);
        let ms = (hours * 3600000) + (min * 60000);
        let times = this.calculate(dt);
        return {
            sunrise: new Date(times.sunrise.getTime() + ms),
            sunset: new Date(times.sunset.getTime() + ms),
            nextSunrise: new Date(times.nextSunrise.getTime() + ms),
            nextSunset: new Date(times.nextSunset.getTime() + ms),
            prevSunrise: new Date(times.prevSunrise.getTime() + ms),
            prevSunset: new Date(times.prevSunset.getTime() + ms),
            isValid: this.isValid
        } 
    }
    public getAdjustedTimes(hours = 0, min = 0): { sunrise?: Date, sunset?: Date, nextSunrise?: Date, nextSunset?: Date, prevSunrise?: Date, prevSunset: Date, isValid: boolean } {
        let ms = (hours * 3600000) + (min * 60000);
        return {
            sunrise: new Date(this.sunrise.getTime() + ms),
            sunset: new Date(this.sunset.getTime() + ms),
            nextSunrise: new Date(this.nextSunrise.getTime() + ms),
            nextSunset: new Date(this.nextSunset.getTime() + ms),
            prevSunrise: new Date(this.prevSunrise.getTime() + ms),
            prevSunset: new Date(this.prevSunset.getTime() + ms),
            isValid: this.isValid
        } 
    }
}
export class Timestamp {
    private static dateTextISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    private static dateTextAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;
    private _dt: Date;
    public emitter: EventEmitter;
    constructor(dt?: Date | string) {
        if (typeof dt === 'string') this._dt = new Date(dt);
        else this._dt = dt || new Date();
        if (!this.isValid) this._dt = new Date();
        this.emitter = new EventEmitter();
    }
    private _isUpdating: boolean = false;
    public static get now(): Timestamp { return new Timestamp(); }
    public toDate(): Date { return this._dt; }
    public get isValid() {
        return this._dt instanceof Date && !isNaN(this._dt.getTime());
    }
    public set isUpdating(val: boolean) { this._isUpdating = val; }
    public get isUpdating(): boolean { return this._isUpdating; }
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
        let dt = new Date();
        let y = val < 100 ? (Math.floor(dt.getFullYear() / 100) * 100) + val : val;
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
    public getDay(): number { return this._dt.getDay(); }
    public getTime() { return this._dt.getTime(); }
    public format(): string { return Timestamp.toISOLocal(this._dt); }
    public static toISOLocal(dt: Date): string {
        if (typeof dt === 'undefined' || typeof dt.getTime !== 'function' || isNaN(dt.getTime())) return '';
        let tzo = dt.getTimezoneOffset();
        var pad = function (n) {
            var t = Math.floor(Math.abs(n));
            return (t < 10 ? '0' : '') + t;
        };
        return new Date(dt.getTime() - (tzo * 60000)).toISOString().slice(0, -1) + (tzo > 0 ? '-' : '+') + pad(tzo / 60) + pad(tzo % 60)
    }
    public setTimeFromSystemClock() {
        let dt = this._dt;
        this._dt = new Date();
        // RKS: This was emitting down to the millisecond.  We are only concerned with time to the minute.
        if (typeof dt === 'undefined' ||
            dt.getMinutes() !== this._dt.getMinutes() ||
            dt.getHours() !== this._dt.getHours() ||
            dt.getDate() !== this._dt.getDate() ||
            dt.getMonth() !== this._dt.getMonth() ||
            dt.getFullYear() !== this._dt.getFullYear())
            this.emitter.emit('change');
    }
    public calcTZOffset(): { tzOffset: number, adjustDST: boolean } {
        let obj = { tzOffset: 0, adjustDST: false };
        let dateJan = new Date(this._dt.getFullYear(), 0, 1, 2);
        let dateJul = new Date(this._dt.getFullYear(), 6, 1, 2);
        obj.tzOffset = dateJan.getTimezoneOffset() / 60 * -1;
        obj.adjustDST = dateJan.getTimezoneOffset() - dateJul.getTimezoneOffset() > 0;
        return obj;
    }
    public addHours(hours: number, minutes: number = 0, seconds: number = 0, milliseconds: number = 0) {
        let interval = hours * 3600000;
        interval += minutes * 60000;
        interval += seconds * 1000;
        interval += milliseconds;
        this._dt.setMilliseconds(this._dt.getMilliseconds() + interval);
        return this;
    }
    public addMinutes(minutes: number, seconds?: number, milliseconds?: number): Timestamp { return this.addHours(0, minutes, seconds, this.milliseconds); }
    public addSeconds(seconds: number, milliseconds: number = 0): Timestamp { return this.addHours(0, 0, seconds, milliseconds); }
    public addMilliseconds(milliseconds: number): Timestamp { return this.addHours(0, 0, 0, milliseconds); }
    public static today() {
        let dt = new Date();
        dt.setHours(0, 0, 0, 0);
        return new Timestamp(dt);
    }
    public startOfDay() {
        // This makes the returned timestamp immutable.
        let dt = new Date(this._dt.getTime());
        dt.setHours(0, 0, 0, 0);
        return new Timestamp(dt);
    }
    public clone() { return new Timestamp(new Date(this._dt)); }
    public static locale() { return Intl.DateTimeFormat().resolvedOptions().locale; }
    public static parseISO(val: string): RegExpExecArray { return typeof val !== 'undefined' && val ? Timestamp.dateTextISO.exec(val) : null; }
    public static parseAjax(val: string): RegExpExecArray { return typeof val !== 'undefined' && val ? Timestamp.dateTextAjax.exec(val) : null; }
    public static dayOfWeek(time: Timestamp): number {
        // for IntelliTouch set date/time
        if (time.toDate().getUTCDay() === 0)
            return 0;
        else
            return Math.pow(2, time.toDate().getUTCDay() - 1);
    }
}
export enum ControllerType {
    IntelliCenter = 'intellicenter',
    IntelliTouch = 'intellitouch',
    IntelliCom = 'intellicom',
    EasyTouch = 'easytouch',
    Unknown = 'unknown',
    // Virtual = 'virtual',
    Nixie = 'nixie',
    AquaLink = 'aqualink',
    SunTouch = 'suntouch',
    None = 'none'
}

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
    public static jsonReviver = (key, value) => {
        if (typeof value === 'string') {
            let d = Timestamp.parseISO(value);
            // By parsing the date and then creating a new date from that we will get
            // the date in the proper timezone.
            if (d) return new Date(Date.parse(value));
            d = Timestamp.parseAjax(value);
            if (d) {
                // Not sure we will be seeing ajax dates but this is
                // something that we may see from external sources.
                let a = d[1].split(/[-+,.]/);
                return new Date(a[0] ? +a[0] : 0 - +a[1]);
            }
        }
        return value;
    }
    public static jsonReplacer = (key, value) => {
        // Add in code to change Timestamp into a string.
        if (typeof value !== 'undefined' && value) {
            if (typeof value.format === 'function') return value.format();
            else if (typeof value.getTime === 'function') return Timestamp.toISOLocal(value);
        }
        return value;
    }
    public static parseJSON(json: string) { return JSON.parse(json, Utils.jsonReviver); }
    public static stringifyJSON(obj: any) { return JSON.stringify(obj, Utils.jsonReplacer); }
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
        pressure: {
            bar: {
                kpa: (val) => { return val * 100; },
                kilopascal: (val) => { return val * 100; },
                pa: (val) => { return val * 100000; },
                pascal: (val) => { return val * 100000; },
                atm: (val) => { return val * 0.986923; },
                atmosphere: (val) => { return val * 0.986923; },
                psi: (val) => { return val * 14.5038; },
                bar: (val) => { return val; }
            },
            kpa: {
                kpa: (val) => { return val; },
                kilopascal: (val) => { return val; },
                pa: (val) => { return val * 1000; },
                pascal: (val) => { return val * 1000; },
                atm: (val) => { return val / 101.325; },
                atmosphere: (val) => { return val / 101.325; },
                psi: (val) => { return val * 0.145038; },
                bar: (val) => { return val * .01; }
            },
            kilopascal: {
                kpa: (val) => { return val; },
                kilopascal: (val) => { return val; },
                pa: (val) => { return val * 1000; },
                pascal: (val) => { return val * 1000; },
                atm: (val) => { return val / 101.325; },
                atmosphere: (val) => { return val / 101.325; },
                psi: (val) => { return val * 0.145038; },
                bar: (val) => { return val * .01; }
            },
            pa: {
                kpa: (val) => { return val / 1000; },
                kilopascal: (val) => { return val / 1000; },
                pa: (val) => { return val; },
                pascal: (val) => { return val; },
                atm: (val) => { return val / 101325; },
                atmosphere: (val) => { return val / 101325; },
                psi: (val) => { return val * 0.000145038; },
                bar: (val) => { return val / 100000; }
            },
            pascal: {
                kpa: (val) => { return val / 1000; },
                kilopascal: (val) => { return val / 1000; },
                pa: (val) => { return val; },
                pascal: (val) => { return val; },
                atm: (val) => { return val / 101325; },
                atmosphere: (val) => { return val / 101325; },
                psi: (val) => { return val * 0.000145038; },
                bar: (val) => { return val / 100000; }
            },
            atm: {
                kpa: (val) => { return val * 101.325; },
                kilopascal: (val) => { return val * 101.325; },
                pa: (val) => { return val * 101325; },
                pascal: (val) => { return val * 101325; },
                atm: (val) => { return val; },
                atmosphere: (val) => { return val; },
                psi: (val) => { return val * 14.6959; },
                bar: (val) => { return val * 1.01325; }
            },
            atmosphere: {
                kpa: (val) => { return val * 101.325; },
                kilopascal: (val) => { return val * 101.325; },
                pa: (val) => { return val * 101325; },
                pascal: (val) => { return val * 101325; },
                atm: (val) => { return val; },
                atmosphere: (val) => { return val; },
                psi: (val) => { return val * 14.6959; },
                bar: (val) => { return val * 1.01325; }
            },
            psi: {
                kpa: (val) => { return val * 6.89476; },
                kilopascal: (val) => { return val * 6.89476; },
                pa: (val) => { return val * 6894.76; },
                pascal: (val) => { return val * 6894.76; },
                atm: (val) => { return val * 0.068046; },
                atmosphere: (val) => { return 0.068046; },
                psi: (val) => { return val; },
                bar: (val) => { return val * 0.0689476; }
            },
            convertUnits: (val: number, from: string, to: string) => {
                if (typeof val !== 'number') return null;
                let fn = this.convert.pressure[from.toLowerCase()];
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
        let sec = Math.round(seconds) - ((hrs * 3600) + (min * 60));
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
    public isNullOrEmpty(val: any) { return (typeof val === 'string') ? val === null || val === '' : typeof val === 'undefined' || val === null; }
    // public sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    // Use this method to get around the circular references for the toJSON function.
    public serialize(obj, fn?: (key, value) => any): string {
        let op = Object.getOwnPropertyNames(obj);
        let s = '{';
        for (let i in op) {
            let prop = op[i];
            if (typeof obj[prop] === 'undefined' || typeof obj[prop] === 'function') continue;
            let v = typeof fn === 'function' ? fn(prop, obj[prop]) : obj[prop];
            if (typeof v === 'undefined') continue;
            s += `"${prop}": ${JSON.stringify(v, fn)},`;
        }
        if (s.charAt(s.length - 1) === ',') s = s.substring(0, s.length - 1);
        return s + '}';
    }
    public replaceProps(obj, fn?: (key, value) => any): any {
        let op = Object.getOwnPropertyNames(obj);
        if (typeof obj === 'undefined') return undefined;
        let isArray = Array.isArray(obj);
        let o = isArray ? [] : {};
        for (let i in op) {
            let prop = op[i];
            if (typeof obj[prop] === 'undefined' || typeof obj[prop] === 'function') continue;
            let v = typeof fn === 'function' ? fn(prop, obj[prop]) : obj[prop];
            if (typeof v === 'undefined') continue;
            if (util.types.isBoxedPrimitive(v))
                o[prop] = v.valueOf();
            if (Array.isArray(v) || typeof v === 'object')
                o[prop] = utils.replaceProps(v, fn);
            else
                o[prop] = v;
        }
        return o;
    }
    public findLineByLeastSquares(values_x: number[], values_y: number[]): number[][] {
        var x_sum = 0;
        var y_sum = 0;
        var xy_sum = 0;
        var xx_sum = 0;
        var count = 0;

        /*
         * The above is just for quick access, makes the program faster
         */
        var x = 0;
        var y = 0;
        var values_length = values_x.length;

        if (values_length != values_y.length) {
            throw new Error('The parameters values_x and values_y need to have same size!');
        }

        /*
         * Above and below cover edge cases
         */
        if (values_length === 0) {
            return [[], []];
        }

        /*
         * Calculate the sum for each of the parts necessary.
         */
        for (let i = 0; i < values_length; i++) {
            x = values_x[i];
            y = values_y[i];
            x_sum += x;
            y_sum += y;
            xx_sum += x * x;
            xy_sum += x * y;
            count++;
        }

        /*
         * Calculate m and b for the line equation:
         * y = x * m + b
         */
        var m = (count * xy_sum - x_sum * y_sum) / (count * xx_sum - x_sum * x_sum);
        var b = (y_sum / count) - (m * x_sum) / count;

        /*
         * We then return the x and y data points according to our fit
         */
        var result_values_x: number[] = [];
        var result_values_y: number[] = [];

        for (let i = 0; i < values_length; i++) {
            x = values_x[i];
            y = x * m + b;
            result_values_x.push(x);
            result_values_y.push(y);
        }

        return [result_values_x, result_values_y];
    }
    public slopeOfLeastSquares(values_x: number[], values_y: number[]): number {
        let points = utils.findLineByLeastSquares(values_x, values_y);
        let points_x = points[0];
        let points_y = points[1];
        let slope = (points_y[0] - points_y[points_y.length - 1]) / (points_x[0] - points_x[points_x.length - 1]);
        return slope;
    }
    private random(bounds: number, onlyPositive: boolean = false) {
        let rand = Math.random() * bounds;
        if (!onlyPositive) {
            if (Math.random() <= .5) rand = rand * -1;
        }
        return rand;
    }
    public dec2bin(dec) {
        return (dec >>> 0).toString(2).padStart(8, '0');
    }
}

export const utils = new Utils();