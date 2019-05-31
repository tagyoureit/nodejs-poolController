export = Settings;
export as namespace Settings;


declare namespace Settings
{
    export type logLevels = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';



    export interface ISettingsInterface
    {
        [ key: string ]: any;
     
        appVersion?: string;
        configLocation?: string;
        configurationFileLocation?: string;
        sysDefaultLocation?: string;
        sysDefaultFileLocation?: string;
 
        equipment?: IEquipmentInterface;
        controller?: object;
        circuit?: object;
        chlorinator?: object;
        intellicom?: object;
        intellicenter?: object;
        intellichem?: object;
        intellitouch?: object;
        spa?: ZeroOrOne;
        solar?: ZeroOrOne;
        virtual?: object;
        virtualPumpController?: object;
        virtualChlorinatorController?: object;
        circuitFriendlyNames?: string[];
 
        pump?: number;
        appAddress?: number;
        httpEnabled?: ZeroOrOne;
        httpRedirectToHttps?: number;
        httpExpressPort?: number;
        httpExpressAuth?: string;
        httpExpressAuthFile?: string;
        httpsEnabled?: ZeroOrOne;
        httpsExpressPort?: number;
        httpsExpressAuth?: ZeroOrOne;
        httpsExpressAuthFile?: string;
        httpsExpressKeyFile?: string;
        httpsExpressCertFile?: string;

        netConnect?: ZeroOrOne;
        rs485Port?: number;
        netPort?: number;
        netHost?: string;
        inactivityRetry?: number;

        logLevel?: logLevels;
        socketLogLevel?: logLevels;
        fileLog?: logLevels;
        logPumpMessages?: ZeroOrOne;
        logDuplicateMessages?: ZeroOrOne;
        logConsoleNotDecoded?: ZeroOrOne;
        logConfigMessages?: ZeroOrOne;
        logMessageDecoding?: ZeroOrOne;
        logChlorinator?: ZeroOrOne;
        logIntellichem?: ZeroOrOne;
        logPacketWrites?: ZeroOrOne;
        logPumpTimers?: ZeroOrOne;
        logApi?: ZeroOrOne;
        logIntellibrite?: ZeroOrOne;

        influxEnabled?: ZeroOrOne;
        influxHost?: string;
        influxPort?: number;
        influxDB?: string;

        integrations?: object;
        notifications?: object;

        capturePackets?: object;
        suppressWrite?: boolean;
    }

    export interface IOptsInterface
    {
        capturePackets?: boolean;
        configLocation?: string;
        sysDefaultLocation?: string;
        suppressWrite?: boolean;

    }

    export interface IConfigInterface
    {
        systemReady: ZeroOrOne;
        version?: string;
        client?: Client.IPanelState;
        equipment?: IEquipmentInterface;
        circuit?: object;
    }


    interface IEquipmentInterface
    {
        controller: any;
        circuit: any;
        chlorinator: any;
        pump: Pump.Equipment;
        pumpConfig: Pump.ExtendedConfigObj
        intellichem: any;
        spa: any;
        solar: any;

    }

    export interface IFileLog
    {
        enable: ZeroOrOne;
        fileLogLevel: logLevels;
        fileName: string;
    }
}