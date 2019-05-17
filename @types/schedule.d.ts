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
        circuit: string;
        circuitNum: number;
        bytes: number[];
        id: number;
        mode: SchedType;
        duration: string;
        friendlyName: string;
        days: string;
        startTime: ITime.BaseTime;
        endTime: ITime.BaseTime
    }
    type Packet = number[]
}