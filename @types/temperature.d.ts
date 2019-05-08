export = Temperature;
export as namespace Temperature;

declare namespace Temperature
{

    interface PoolTemperature
    {
        poolTemp: number
        spaTemp: number
        airTemp: number
        solarTemp: number
        freeze: ZeroOrOne
    }
}