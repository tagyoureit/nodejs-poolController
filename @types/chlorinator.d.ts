export as namespace Chlorinator;
export = Chlorinator;

declare namespace Chlorinator
{
    type ControlledBy = 'virtual' | 'intellitouch' | 'intellicom' | 'none'

    export interface IChlorinatorOutput
    {
        chlorinator: IBaseChlorinator
    }

    export interface IChlorinator extends IBaseChlorinator
    {

        updateName ( _name: string ): void;
        startChlorinatorController (): void;
        //updateChlorinatorInstalled ( installed: ZeroOrOne ): void
        updateChlorinatorValues ( chlorinatorStatus: IBaseChlorinator ): void
    }

    export interface IBaseChlorinator
    {
        controlledBy?: ControlledBy;
        saltPPM?: number;
        currentOutput?: number
        outputPoolPercent: number;
        outputSpaPercent: number;
        installed: ZeroOrOne;
        superChlorinate: number;
        superChlorinateHours: number;
        status?: string;
        name: string;
        version?: number;
    }
}