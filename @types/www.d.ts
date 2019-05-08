export as namespace WWW;
export = WWW;

declare namespace WWW
{
    export interface ISysInfo
    {
        airTemp: number;
        solarTemp: number;
        freezeProt: 0 | 1
        time: string;
        date: string;
        locale: string;
        controllerDateStr: string;
        controllerTime: string;
    }

    export interface IPoolOrSpaState
    {
        state: "On" | "Off";
        number: number;
        name: "Pool" | "Spa",
        temp: number;
        setPoint: number;
        heatMode: number;
        heatModeStr: string;
        heatOn: 0 | 1;
    }
}