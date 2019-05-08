declare namespace HeatModule
{

    interface CurrentHeat
    {
        poolSetPoint: number; poolHeatMode: number; poolHeatModeStr: any; spaSetPoint: number; spaHeatMode: number; spaHeatModeStr: any; heaterActive: number; whatsDifferent: ( arg0: any ) => void; spaManualHeatMode: string;
    }
}

