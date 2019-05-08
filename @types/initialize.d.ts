import * as sinon from 'sinon';

export = Init;
export as namespace Init;

declare namespace Init
{
    type InitAllAsync = ( opts?: OptsType) => PromiseConstructorLike
    type WaitForSocketResponseAsync = (_which: string ) => PromiseConstructorLike
    type stopAllAsync = () => PromiseConstructorLike

    interface OptsType
    {
        configLocation?: string
        sysDefaultLocation?: string
        capturePackets?: boolean
        suppressWrite?: boolean
    
    }
    
    interface StubType 
    {
        [k: string]: any
        loggerInfoStub?: sinon.SinonStub | sinon.SinonSpy;
        loggerVerboseStub?: sinon.SinonStub | sinon.SinonSpy;
        loggerDebugStub?:   sinon.SinonStub | sinon.SinonSpy;
        loggerSillyStub?:   sinon.SinonStub | sinon.SinonSpy;
        loggerWarnStub?:    sinon.SinonStub | sinon.SinonSpy;
        loggerErrorStub?:   sinon.SinonStub | sinon.SinonSpy;
    }
        
    interface LoggerStubOrSpy
    {
        normalLvl: string;
        errorLvl: string;
    }
}

declare module NodeJS
{
        interface Global {
            initAllAsync: any
            stopAllAsync: Promise<any>
            enableLogging: void
            logging: ZeroOrOne
            logInitAndStop: ZeroOrOne
            waitForSocketResponseAsync: Promise<any>
            setupLoggerStubOrSpy: Init.LoggerStubOrSpy
            requestPoolDataWithURLAsync: Promise<any>
            loggers: Init.StubType;
        }
           
}

declare let loggers: any;
declare let loggerInfoStub:    any;
declare let loggerVerboseStub: any;
declare let loggerDebugStub:   any;
declare let loggerSillyStub:   any;
declare let loggerWarnStub:    any;
declare let loggerErrorStub:   any;
declare let logging: ZeroOrOne
declare let logInitAndStop: ZeroOrOne
declare function initAllAsync ( opts?: Init.OptsType ): Promise<any>
declare function stopAllAsync(): Promise<void>
declare function enableLogging (): void
declare function disableLogging(): void
declare function waitForSocketResponseAsync ( _which: string ): Promise<any>
declare function setupLoggerStubOrSpy ( normalLvl: string,
    errorLvl: string ): {}
declare function requestPoolDataWithURLAsync(endpoint: string, URL: string): Promise<any>
