export = Circuit;
export as namespace Circuit;

declare namespace Circuit
{

    interface LightClass
    {
        position: number;
        colorStr: string;
        color: number;
        colorSet: number;
        colorSetStr: string;
        prevColor: number;
        prevColorStr: string;
        colorSwimDelay: number;
        mode: number;
        modeStr?: string;
        prevMode?: number;
        prevModeStr?: string;
        circuit?: number;
        // TODO: Circuit should be number OR be removed

    }

    interface ICurrentCircuitsArr
    {
        [ k: number ]: CircuitBase;
    }

    interface ICurrentCircuits
    {
        [k : number]: CircuitClass
    }

    interface CircuitClass extends CircuitBase
    {
        [k: number]: CircuitBase

        setFunction ( functionByte: number ): void;
        setFreeze ( functionByte: number ): void;
        setName ( nameByte: number ): void;
        assignCircuitVars ( circuitArrObj: CircuitClass ): void;
        isLight (): boolean;
    }

    interface CircuitBase
    {
        number: number;
        numberStr: string;
        name: string;
        circuitFunction: string;
        friendlyName: string;
        status: ZeroOrOne;
        freeze: ZeroOrOne;
        macro?: number;
        delay?: ZeroOrOne;
        light? : LightClass;
    }

    interface ILightGroupPackets
    {
        numPackets: number
        [packet:number]: number[]
    }

    type Packet = number[]

    interface Status
    {
        [ index: string ]: { status: ZeroOrOne }
    } 

    interface ILightGroups
    {
        [key: number]: ILightGroup
    }

    interface ILightGroup
    {
        circuit: number;
        position: number;
        colorSet: number;
        colorSetStr: string;
        colorSwimDelay: number;
    }
}