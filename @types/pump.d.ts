export as namespace Pump;
export = Pump;
import {BYTES} from '../src/etc/internal'
declare namespace Pump
{
    export type PumpType = 'VS' | 'VSF' | 'VF' | 'NONE';
    export type VirtualControllerType = 'always' | 'never' | 'default';
    export type VirtualControllerStatus = 'enabled' | 'disabled'
    export type PumpSpeedType = 'rpm' | 'gpm'
    export type BYTES = Symbol
    export interface PumpStatus
    {
        [ k: number ]: Equipment
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
        [ key: number ]: any
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

    export interface ExtendedConfigObj
    {
        [ key: number ]: ExtendedConfig
    }

    interface ExtendedConfig{
        type: PumpType
        [BYTES]?: number[]
        prime?: ConfigPrimingValues
        circuitSlot: {
            [ key: number ]: ConfigCircuitSlotValues
        }
        filtering?: {
            filter: ConfigFilterValues
            vacuum: ConfigVacuumValues
            priming: ConfigVFPrimingValues
            backwash: ConfigBackwashValues
        }
        backgroundCircuit?: PumpType

        setSpeed?: ( _circuitSlot: number, _speed: number ) => void
        setCircuit?: (_circuitSlot: number, _circuit: number) => void
        setType?: (_type: Pump.PumpType) => void
        setRPMGPM?: (_circuitSlot: number, _speedType: PumpSpeedType) => void
    }

    interface ConfigFilterValues
    {
        poolSize: number
        turnOvers: number
        manualFilterGPM: number
    }

    interface ConfigVacuumValues
    {
        flow: number
        time: number
    }

    // Values specific to the VF Pump Config
    interface ConfigVFPrimingValues
    {
        maxFlow: number
        maxTime: number
        systemMaxTime: Number
    }

    interface ConfigBackwashValues
    {
        maxPressureIncrease: number
        flow: number
        time: number
        rinseTime: number
    }

    interface ConfigCircuitSlotValues
    {
        number: number
        friendlyName: string
        flag: PumpSpeedType
        rpm?: number
        gpm?: number
    }

    interface ConfigPrimingValues
    {
        primingMinutes: number
        rpm: number
    }
}