

declare namespace Pump
{
    export type PumpType = 'VS' | 'VSF' | 'VF' | 'none';
    export type VirtualControllerType = 'always' | 'never' | 'default';
    export type VirtualControllerStatus = 'enabled' | 'disabled'
    export interface PumpStatus
    {
        [k: number]: Equipment
    }

    export type PumpIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
    export type PumpAddress = 96 | 97 | 98 | 99 | 100 | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108 | 109 | 110 | 111 | 112

    export interface ExternalProgram
    {
        [ k: number ]: number;
        1: number;
        2: number;
        3: number;
        4: number
    }

    export interface CurrentRunning
    {
        mode: string;
        value: number;
        remainingduration: number;
    }

    export interface Equipment
    {
        pump: number;
        name: string;
        friendlyName: string;
        type: PumpType;
        time: string;
        run: number;
        mode: number;
        drivestate: number;
        watts: number;
        rpm: number;
        gpm: number;
        ppc: number;
        err: number;
        timer: number;
        duration: number; //duration on pump, not program duration
        currentrunning: CurrentRunning;
        currentprogram: number;
        externalProgram: ExternalProgram;
        remotecontrol: number;
        power: number;
        virtualControllerType: VirtualControllerType;
        virtualControllerStatus: VirtualControllerStatus

    }
}