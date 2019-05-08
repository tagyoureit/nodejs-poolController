import {ETime} from  './time'

export = ScheduleModule
export as namespace ScheduleModule;

declare namespace ScheduleModule
{

    interface ScheduleObj
    {
        [k: number]: any
    }

    type SchedType = 'Egg Timer' | 'Schedule'

    interface ScheduleClass
    {
        CIRCUIT: string;
        CIRCUITNUM: number;
        BYTES: number[];
        ID: number;
        MODE: SchedType;
        START_TIME: string;
        END_TIME: string;
        DURATION: string;
        friendlyName: string;
        DAYS: string;
        // mode: number;
        // modeStr: string;
        startTime: ITime.BaseTime;
        endTime: ITime.BaseTime
    }



    type Packet = number[]


}