export = ITime
export as namespace ITime

declare namespace ITime
{
    
    type MERIDIEM = 'am' | 'pm' | 'notset'

    type DOW = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday"

    export interface ETime extends BaseTime
    {
        controllerTime: string;
        controllerDateStr: string;
        controllerDay: number;
        controllerMonth: number;
        controllerYear: number;
        controllerDayOfWeekStr: DOW;
        controllerDayOfWeek: number;
        automaticallyAdjustDST: number;
        pump1Time: string;
        pump2Time: string;
        pumpTime: PumpTime


    }

    interface BaseTime
    {
        minute: number;
        hour: number;
        hour24?: number;
        meridiem?: MERIDIEM;
        UTC?: string;
        locale?: string;
        ISO?: string;
        time?: string;
        time24?: string;
    }
    interface PumpTime
    {
        [ k: number ]: string;
    }

}