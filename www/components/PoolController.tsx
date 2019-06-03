import * as React from 'react';
import { getAll, emitSocket, hidePanel } from './Socket_Client';
import Layout from './Layout';
import SysInfo from './SysInfo'
import PoolSpaState from './PoolSpaState'
import Pump from './Pump'
import Feature from './Feature'
import Schedule from './Schedule'
import EggTimer from './EggTimer/EggTimer'
import Chlorinator from './Chlorinator'
import ShouldDisplay from './ShouldDisplay'
import Light from './Light/Light'
import DebugLog from './DebugLog'
import Footer from './Footer'


interface IPoolControllerState
{
    config: Settings.IConfigInterface;
    time: ITime.ETime;
    temperature: Temperature.PoolTemperature;
    sysInfo: WWW.ISysInfo;
    poolInfo: WWW.IPoolOrSpaState;
    spaInfo: WWW.IPoolOrSpaState;
    pump: Pump.PumpStatus;
    pumpConfig: Pump.ExtendedConfigObj;

    circuit: Circuit.ICurrentCircuitsArr;
    feature: Circuit.ICurrentCircuitsArr;
    idOfFirstUnusedSchedule: number;
    light: Circuit.ICurrentCircuitsArr;

    counter?: number;
    chlorinator?: Chlorinator.IBaseChlorinator,
    UOM?: IUOM.UOM;
    valve?: any;
    intellichem?: any;
    schedule?: ScheduleModule.ScheduleObj;
    eggTimer?: ScheduleModule.ScheduleObj;
    debugText?: string;

    updateStatus?: IUpdateAvailable.Ijsons
}



let state: IPoolControllerState;

class PoolController extends React.Component<any, IPoolControllerState> {
    constructor( props: IPoolControllerState )
    {
        super( props );

        this.clearLog = this.clearLog.bind( this );
        this.formatLog = this.formatLog.bind( this );
        this.state =
            {
                config: {
                    systemReady: 0,
                    equipment: {
                        controller: {
                            intellicom: { installed: 0, friendlyName: '' },
                            intellitouch: {
                                "installed": 1,
                                "friendlyName": "",
                                "numberOfCircuits": 0,
                                "numberOfPumps": 0,
                                "numberOfCustomNames": 0,
                                "numberOfSchedules": 0
                            }
                        },
                        chlorinator: {
                            installed: 0,
                            desiredOutput: {
                                pool: 0,
                                spa: 0
                            }
                        },
                        circuit: {
                            friendlyName: {},
                            hideAux: false,
                            nonLightCircuit: {},
                            lightCircuit: {}
                        },
                        pump: {
                            pump: 1,
                            name: '',
                            friendlyName: '',
                            type: 'VS',
                            time: '',
                            run: 0,
                            mode: 0,
                            drivestate: 0,
                            watts: 0,
                            rpm: 0,
                            gpm: 0,
                            ppc: 0,
                            err: 0,
                            timer: 0,
                            duration: 0,//duration on pump, not program duration
                            currentrunning: {
                                mode: '',
                                value: 0,
                                remainingduration: 0
                            },
                            currentprogram: 0,
                            externalProgram: {
                                1: 0,
                                2: 0,
                                3: 0,
                                4: 0
                            },
                            remotecontrol: 0,
                            power: 0,
                            virtualControllerType: 'never',
                            virtualControllerStatus: 'disabled' 
                        },
                        pumpConfig: {
                            1: {
                                type: 'VS',
                                circuitSlot: {
                                    1: {
                                        number: 1,
                                        friendlyName: '',
                                        flag: 'rpm'
                                    }
                                }
                            }
                        },
                        intellichem: {
                            installed: 0
                        },
                        spa: {
                            installed: 0
                        },
                        solar: {
                            installed: 0
                        }
                    },
                    client: {
                        hideAux: true,
                        panelState: {
                            system: {
                                state: "visible"
                            },
                            pool: {
                                state: "visible"
                            },
                            spa: {
                                state: "visible"
                            },
                            chlorinator: {
                                state: "visible"
                            },
                            feature: {
                                state: "visible"
                            },
                            pump: {
                                state: "visible"
                            },
                            schedule: {
                                state: "visible"
                            },
                            eggtimer: {
                                state: "visible"
                            },
                            debug: {
                                state: "visible"
                            },
                            intellichem: {
                                state: "visible"
                            },
                            release: {
                                state: "visible"
                            },
                            light: {
                                state: "visible"
                            },
                            updateStatus: {
                                state: "hidden"
                            }
                        }
                    }
                },
                circuit: {
                    1: {
                        number: 1,
                        numberStr: "circuit1",
                        status: 0,
                        delay: 0,
                        freeze: 0,
                        macro: 0,
                        circuitFunction: "notset",
                        name: 'notset',
                        friendlyName: 'notset'
                    }
                },
                idOfFirstUnusedSchedule: -1,
                light: {
                    1: {
                        number: 1,
                        numberStr: "circuit1",
                        status: 0,
                        delay: 0,
                        freeze: 0,
                        macro: 0,
                        circuitFunction: "notset",
                        name: 'notset',
                        friendlyName: 'notset'
                    }
                },
                time: {
                    controllerTime: 'none',
                    controllerDateStr: 'none',
                    controllerDay: 1,
                    controllerMonth: 1,
                    controllerYear: -1,
                    controllerDayOfWeekStr: 'Sunday',
                    controllerDayOfWeek: -1,
                    automaticallyAdjustDST: 0,
                    pump1Time: 'none',
                    pump2Time: 'none',
                    minute: 0,
                    hour: 0,
                    hour24: 0,
                    meridiem: 'am',
                    UTC: 'none',
                    locale: 'none',
                    ISO: 'none',
                    pumpTime: 'none'
                },
                temperature: { airTemp: 0, poolTemp: 0, spaTemp: 0, solarTemp: 0, freeze: 0 },
                sysInfo: { airTemp: 0, solarTemp: 0, freezeProt: 0, time: '', date: '', locale: '', controllerDateStr: '', controllerTime: '' },
                poolInfo: { name: 'Pool', state: 'Off', number: 0, temperature: 0, setPoint: 0, heatMode: 0, heatModeStr: '', heaterActive: 0, solarActive: 0, lastKnownTemperature: 0 },
                spaInfo: { name: 'Spa', state: 'Off', number: 0, temperature: 0, setPoint: 0, heatMode: 0, heatModeStr: '', heaterActive: 0, solarActive: 0, lastKnownTemperature: 0 },
                pump: {
                    1: {
                        pump: 1,
                        name: '',
                        friendlyName: '',
                        type: 'VS',
                        time: '',
                        run: 0,
                        mode: 0,
                        drivestate: 0,
                        watts: 0,
                        rpm: 0,
                        gpm: 0,
                        ppc: 0,
                        err: 0,
                        timer: 0,
                        duration: 0, //duration on pump, not program duration
                        currentrunning: { mode: '', value: 0, remainingduration: 0 },
                        currentprogram: 0,
                        externalProgram: { 1: 0, 2: 0, 3: 0, 4: 0 },
                        remotecontrol: 0,
                        power: 0,
                        virtualControllerType: 'never',
                        virtualControllerStatus: 'disabled'
                    }
                },
                pumpConfig: {
                    1: {
                        type: "NONE",
                        circuitSlot: {
                            1: {
                                number: 1,
                                friendlyName: "none",
                                flag: "rpm",
                                rpm: 400
                            }
                        }
                    }
                }
                ,
                feature: {},
                counter: 0,
                chlorinator: {
                    controlledBy: 'none',
                    saltPPM: 0,
                    currentOutput: 0,
                    outputPoolPercent: 0,
                    outputSpaPercent: 0,
                    installed: 0,
                    superChlorinate: 0,
                    superChlorinateHours: 0,
                    status: '',
                    name: '',
                    version: 0
                },
                UOM: {
                    UOMByte: 0,
                    UOM: 'C',
                    UOMStr: "Celcius"
                },
                valve: {},
                intellichem: {},
                eggTimer: {},
                schedule: {},
                debugText: '',
                updateStatus: {
                    local: { version: '' },
                    remote: { version: '', tag_name: '' },
                    result: ''
                }
            }

        // console.log( `after set state:  ${ JSON.stringify( this.state ) }` )

        let lastUpdateTime = 0;
        let once = false;
        if ( !once )
        {
            emitSocket( 'all' )
            once = true
        }



        getAll( ( err: Error, d: any, which: string ) =>
        {
            let pendingChanges: IPoolControllerState = { ...this.state }

            if ( err )
            {
                console.log( `socket getall err: ${ err }` )
            }

            // here we handle all objects which do not need to have additional configuration
            if ( which === 'all' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, {
                    config: d.config,
                    UOM: d.UOM,
                    valve: d.valve,
                    intellichem: d.intellchem
                } )
            }

            /**
             * Following are sockets which can be taken care of exclusively with 'all' socket
             * so we skip them here
             */

            if ( which === 'pump' || which === 'all' )
            {
                // pumpConfig changes shouldn't be merged.  Delete keys first
                delete pendingChanges.pumpConfig
                pendingChanges = Object.assign( {},
                    pendingChanges,

                    { pump: d.pump },
                    { pumpConfig: d.pumpConfig }
                )
                // this.setState( ( state ) => { return { pump: d.pump } } )
            }

            if ( which === 'UOM' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, { UOM: d.UOM } )
                
            }

            if ( which === 'valve' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, { valve: d.valve } )
            }
            if ( which === 'intellichem' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, { intellichem: d.intellichem } )
            }

            /**
             * Following are sockets which have additional logic so we will process with both the
             * 'all' socket and the specific socket for this equipment.
             */
            if ( which === 'config' || which === 'all' )
            {
                if ( d.hasOwnProperty( 'config' ) )
                {
                    pendingChanges = Object.assign( {}, pendingChanges, { config: d.config } )
                }
                else
                {
                    console.log( `why do we have null config here?` )
                }
            }

            if ( which === 'circuit' || which === 'all' )
            {

                let circChanges = Object.assign(
                    {},
                    this.state.circuit,
                    pendingChanges.circuit,
                    this.filterAux( d.circuit )
                )
                pendingChanges = Object.assign( {}, pendingChanges, {
                    light: this.circuitsWithLights( d.circuit ),
                    circuit: circChanges,
                    feature: this.circuitsWithoutPoolSpa( d.circuit ),
                    poolInfo: {
                        ...this.state.poolInfo,  // if we don't deep copy, it will lose previous attributes
                        ...pendingChanges.poolInfo,  // if we don't deep copy this, it will lose previous pending changes
                        state: this.circuitOn( "Pool", d.circuit ) ? "On" : "Off",
                        number: this.circuitNumber( "Pool", d.circuit )
                    },
                    spaInfo: {
                        ...this.state.spaInfo,  // if we don't deep copy, it will lose previous attributes
                        ...pendingChanges.spaInfo,  // if we don't deep copy this, it will lose previous pending changes
                        state: this.circuitOn( "Spa", d.circuit ) ? "On" : "Off",
                        number: this.circuitNumber( "Spa", d.circuit )
                    }
                } )
            }

            if ( which === 'schedule' || which === 'all' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, {
                    schedule: this.scheduleEntries( d.schedule ),
                    eggTimer: this.eggTimerEntries( d.schedule ),
                    idOfFirstUnusedSchedule: this.nextUnusedScheduleId( d.schedule )
                } )
            }

            if ( which === 'temperature' || which === 'all' )
            {

                pendingChanges = Object.assign( {}, pendingChanges, {
                    poolInfo: {
                        ...this.state.poolInfo,  // if we don't deep copy, it will lose previous attributes
                        ...pendingChanges.poolInfo,  // if we don't deep copy this, it will lose previous pending changes
                        name: "Pool",
                        state: this.circuitOn( "Pool", d.circuit ) ? "On" : "Off",
                        temperature: d.temperature.poolTemp,
                        setPoint: d.temperature.poolSetPoint,
                        heatMode: d.temperature.poolHeatMode,
                        heatModeStr: d.temperature.poolHeatModeStr,
                        heaterActive: d.temperature.heaterActive,
                        solarActive: d.temperature.solarActive,
                        lastKnownTemperature: d.temperature.poolLastKnownTemperature,
                    },
                    spaInfo: {
                        ...this.state.spaInfo,
                        ...pendingChanges.spaInfo,
                        name: "Spa",
                        state: this.circuitOn( "Spa", d.circuit ) ? "On" : "Off",
                        temperature: d.temperature.spaTemp,
                        setPoint: d.temperature.spaSetPoint,
                        heatMode: d.temperature.spaHeatMode,
                        heatModeStr: d.temperature.spaHeatModeStr,
                        heaterActive: d.temperature.heaterActive,
                        solarActive: d.temperature.solarActive,
                        lastKnownTemperature: d.temperature.spaLastKnownTemperature
                    },
                    sysInfo: {
                        ...this.state.sysInfo,
                        // time: d.time.controllerTime,
                        // date: d.time.controllerDateStr,
                        // locale: d.time.locale,
                        airTemp: d.temperature.airTemp,
                        solarTemp: d.temperature.solarTemp,
                        freezeProt: d.temperature.freeze
                    }
                } )
            }

            if ( which === 'time' || which === 'all' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, {
                    time: d.time,
                    sysInfo: {
                        ...this.state.sysInfo,
                        ...pendingChanges.sysInfo,
                        controllerTime: d.time.controllerTime,
                        controllerDateStr: d.time.controllerDateStr,
                        locale: d.time.locale,
                        // airTemp: d.temperature.airTemp,
                        // solarTemp: d.temperature.solarTemp,
                        // freezeProt: d.temperature.freeze
                    }
                } )
            }


            if ( which === 'chlorinator' || which === 'all' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, {
                    chlorinator:
                    {
                        ...d.chlorinator,
                        state: d.chlorinator.currentOutput === '0' ? false : true
                    }
                } )
            }

            if ( which === 'outputLog' )
            {
                // only bother to process this if the panel isn't hidden
                if ( this.state.config.client.panelState.debug.state === 'visible' )
                {
                    let _txt: string = ''
                    if ( typeof ( d ) === 'object' )
                    {
                        _txt = JSON.stringify( d, null, 2 )
                    }
                    else
                    {
                        _txt = d
                    }
                    pendingChanges = Object.assign( {}, pendingChanges, {
                        debugText: `${ this.formatLog( _txt ) }<br>${ this.state.debugText }`
                    } )
                }
            }

            if ( which === 'updateAvailable' )
            {
                pendingChanges = Object.assign( {}, pendingChanges, {
                    updateStatus: d
                } )

            }

            // if ( Date.now() - lastUpdateTime > 1000 )
            // {
            lastUpdateTime = Date.now()
            // set counter +1 for resetting time keeping
            pendingChanges = Object.assign( {}, pendingChanges, { counter: this.state.counter + 1 } )
            // }

            // and finally, apply pending changes
            this.setState( ( state ) =>
            {
                let retObj = Object.assign( {}, this.state, pendingChanges )
                return retObj
            } )


        } )

    }

    scheduleEntries ( schedule: ScheduleModule.ScheduleObj )
    {
        const entries = Object.keys( schedule )
        //console.log(entries[1][1].name)
        const filter = entries.filter( key => !( schedule[ parseInt( key ) ].circuitNum === 0 || schedule[ parseInt( key ) ].mode === 'Egg Timer' )
        )
        //console.log(filter)

        const obj: ScheduleModule.ScheduleObj = {}
        for ( const el of filter )
        {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[ parseInt( el ) ] = schedule[ parseInt( el ) ];
        }
        return obj
    }
    filterAux ( circuit: Circuit.ICurrentCircuitsArr )
    {
        let hideAux = this.state.config.client.hideAux
        const entries = Object.keys( circuit )
        const filter = entries.filter( key =>
        {
            if ( hideAux && circuit[ parseInt( key ) ].friendlyName === 'AUX EXTRA' )
            {
                return false
            }
            return true
        } )
        //console.log(filter)

        const obj: Circuit.ICurrentCircuitsArr = {}
        for ( const el of filter )
        {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[ parseInt( el ) ] = circuit[ parseInt( el ) ];
        }
        return obj
    }
    eggTimerEntries ( schedule: ScheduleModule.ScheduleObj )
    {

        const entries = Object.keys( schedule )
        const filter = entries.filter( key => !( schedule[ parseInt( key ) ].circuitNum === 0 || schedule[ parseInt( key ) ].mode === 'Schedule' )
        )

        const obj: ScheduleModule.ScheduleObj = {}
        for ( const el of filter )
        {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[ parseInt( el ) ] = schedule[ parseInt( el ) ];
        }
        return obj
    }

    nextUnusedScheduleId ( schedule: ScheduleModule.ScheduleObj )
    {
        const entries = Object.keys( schedule )
        const filter = entries.filter( key => schedule[ parseInt( key ) ].circuit === 'NOT USED' )
        if ( !filter )
        {
            return -1
        }
        else
        {
            // return first unused schedule
            return filter[ 0 ]
        }
    }

    circuitsWithoutPoolSpa ( circuit: Circuit.ICurrentCircuits )
    {
        if ( Object.keys( circuit ).length !== 0 )
        {
            const entries = Object.keys( circuit )
            //console.log(entries[1][1].name)
            const filter = entries.filter( key => !( circuit[ parseInt( key ) ].name === 'POOL' || circuit[ parseInt( key ) ].name === 'SPA' )
            )
            //console.log(filter)

            const obj: Circuit.ICurrentCircuits = {}
            for ( const el of filter )
            {
                //console.log(`el: ${el}`)
                //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
                obj[ parseInt( el ) ] = circuit[ parseInt( el ) ];
            }
            return obj
        }
        else
        {
            return {}
        }
    }

    circuitsWithLights ( circuit: Circuit.ICurrentCircuits )
    {
        if ( Object.keys( circuit ).length !== 0 )
        {
            const entries = Object.keys( circuit )
            //console.log(entries[1][1].name)
            const filter = entries.filter( key => ( circuit[ parseInt( key ) ].hasOwnProperty( 'light' ) )
            )

            const obj: Circuit.ICurrentCircuits = {}
            for ( const el of filter )
            {
                obj[ parseInt( el ) ] = circuit[ parseInt( el ) ];
            }
            return obj
        }
        else
        {
            return {}
        }
    }

    circuitOn ( which: string, data: Circuit.CircuitBase ): boolean
    {
        try
        {
            // map the obj to an array
            // assign empty object in case invalid values are passed here.
            const circuitMap: Circuit.CircuitBase[] = Object.values( Object.assign( {}, this.state.circuit, data ) )
            if ( circuitMap.length > 1 )
            {
                // loop through the circuits
                const results = circuitMap.filter( ( n ) =>
                {
                    // find the Spa or Pool circuit
                    if ( n.circuitFunction.toLowerCase() === which.toLowerCase() )
                    {
                        // if the circuit is on return the filtered value in the list
                        if ( n.status )
                        {
                            //console.log(`${n.circuitFunction} is ${n.status}`)
                            return true
                        }
                    }
                } )
                //console.log(`res: ${JSON.stringify(results)}`)
                // if the list has 1+ "on" entry then the pool/spa pump is on
                return Object.keys( results ).length >= 1
            }
        }
        catch ( err ) 
        {
            console.log( `Caught in circuitOn: ${ err.message }` )
        }
    }

    circuitNumber ( which: string, data: Circuit.ICurrentCircuitsArr ): number
    {
        try
        {
            let keys: string[] = Object.keys( Object.assign( {}, data ) )
            if ( keys.length > 1 )
            {
                for ( var circ in data )
                {
                    if ( data[ circ ].circuitFunction.toLowerCase() === which.toLowerCase() )
                    {
                        return data[ circ ].number
                    }
                }
            }
        }
        catch ( err )
        {
            console.log( `Caught in circuitNumber: ${ err.message }` )
        }
    }

    clearLog (): void
    {
        this.setState( { debugText: '' } )
    }

    formatLog ( strMessage: string ): string
    {
        let strColor: string = '';
        interface LogColors
        {
            [ k: string ]: string
        }
        let logColors: LogColors = {
            error: "red",
            warn: "yellow",
            info: "green",
            verbose: "cyan",
            debug: "blue",
            silly: "magenta"
        };
        // Colorize Message, in HTML format
        var strSplit = strMessage.split( ' ' );
        if ( typeof ( logColors ) !== "undefined" )
            strColor = logColors[ strSplit[ 1 ].toLowerCase() ];
        else
            strColor = "lightgrey";
        if ( strColor )
        {
            strSplit[ 1 ] = strSplit[ 1 ].fontcolor( strColor ).bold();
        }

        return strSplit.join( ' ' )
    }

    render ()
    {
        const pumpControlType = (this.state.config.equipment.controller.intellitouch.installed || this.state.config.equipment.controller.intellicenter.installed)?'pumpConfig':'manual'
        return (
            <Layout counter={this.state.counter} >
                <ShouldDisplay
                    visibility={this.state.config.client.panelState.system.state}
                    systemReady={this.state.config.systemReady}>
                    <SysInfo
                        data={this.state.sysInfo}
                        id='system' visibility={this.state.config.client.panelState.system.state} />
                </ShouldDisplay>
                <PoolSpaState
                    data={this.state.poolInfo}
                    UOM={this.state.UOM}
                    id='pool'
                    visibility={this.state.config.client.panelState.pool.state} />
                <PoolSpaState
                    data={this.state.spaInfo}
                    UOM={this.state.UOM}
                    id='spa'
                    visibility={this.state.config.client.panelState.spa.state} />
                <Pump
                    data={this.state.pump}
                    id='pump'
                    visibility={this.state.config.client.panelState.pump.state}
                    circuit={this.state.circuit}
                    pumpConfig={this.state.pumpConfig}
                    controlType={pumpControlType}
                />
                <Feature
                    feature={this.state.feature}
                    hideAux={this.state.config.client.hideAux}
                    id='feature'
                    visibility={this.state.config.client.panelState.feature.state} />
                <Schedule
                    data={this.state.schedule}
                    id='schedule'
                    visibility={this.state.config.client.panelState.schedule.state}
                    idOfFirstUnusedSchedule={this.state.idOfFirstUnusedSchedule}
                />
                <EggTimer
                    data={this.state.eggTimer}
                    allCircuits={this.state.circuit}
                    id='eggtimer'
                    visibility={this.state.config.client.panelState.eggtimer.state}
                    idOfFirstUnusedSchedule={this.state.idOfFirstUnusedSchedule}
                />
                <Chlorinator
                    data={this.state.chlorinator}
                    id='chlorinator'
                    visibility={this.state.config.client.panelState.chlorinator.state} />
                <Light
                    data={this.state.light}
                    id='light'
                    visibility={this.state.config.client.panelState.light.state} />
                <DebugLog
                    id='debug'
                    visibility={this.state.config.client.panelState.debug.state} debugText={this.state.debugText} clearLog={this.clearLog} />
                <Footer updateStatus={this.state.updateStatus} updateStatusVisibility={this.state.config.client.panelState.updateStatus.state} />
            </Layout>
        );
    }
}

export default PoolController;