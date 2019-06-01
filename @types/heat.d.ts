declare namespace HeatModule
{

    interface CurrentHeat
    {
        poolSetPoint: number;
        poolHeatMode: number;
        poolHeatModeStr: any;
        spaSetPoint: number;
        spaHeatMode: number;
        spaHeatModeStr: any;
        heaterActive: number;
        solarActive: number;
        spaManualHeatMode: string;

        whatsDifferent: ( arg0: any ) => void;
    }
}

