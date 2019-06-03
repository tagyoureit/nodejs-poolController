
//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { settings, logger, circuit, time, queuePacket, intellitouch, io, influx, pump, BYTES } from '../../etc/internal'
import * as c from '../../etc/constants'

let currentPumpConfig: Pump.ExtendedConfigObj = {};
export namespace pumpConfig
{

    class PumpExtendedConfig implements Pump.ExtendedConfigObj
    {

        [ key: number ]: any
        [ BYTES ]?: number[]
        type: Pump.PumpType
        prime: Pump.ConfigPrimingValues
        circuitSlot: {
            [ key: number ]: Pump.ConfigCircuitSlotValues
        }
        filtering: {
            filter: Pump.ConfigFilterValues
            vacuum: Pump.ConfigVacuumValues
            priming: Pump.ConfigVFPrimingValues
            backwash: Pump.ConfigBackwashValues
        }
        backgroundCircuit?: Pump.PumpType

        constructor( _type: Pump.PumpType = 'NONE', data: number[] = [] )
        {
            this[ BYTES ] = data
            this.type = _type;
            if ( this.type === 'NONE' )
            {
                logger.debug( `Initializing empty pump configuration` )
                this.prime = {
                    primingMinutes: 0,
                    rpm: 0
                }
                this.circuitSlot = {
                    1: {
                        number: 1,
                        friendlyName: '',
                        flag: 'rpm'
                    }

                }
            } else if ( this.type === 'VS' )
            {
                this.parseVSPump( data );
            } else if ( this.type === 'VSF' )
            {
                this.parseVSFPump( data );
            } else
            // pump type is VF
            {
                this.parseVFPump( data );
            }
        }

        private associate_circuit ( circuitnum: number ): { number: number, friendlyName: string }
        {

            let _circuit: { number: number, friendlyName: string }
            if ( circuitnum === 0 )
            {
                _circuit = {
                    number: 0,
                    friendlyName: 'none'

                }
            } else if ( circuitnum <= circuit.getNumberOfCircuits() )
            {
                _circuit = {
                    number: circuitnum,
                    friendlyName: circuit.getFriendlyName( circuitnum )

                }
            } else
            {
                // if there is no speed/circuit assignment
                _circuit = {
                    number: circuitnum,
                    friendlyName: circuit.getFriendlyName( circuitnum )
                }
            }
            return _circuit
        }

        private getRpmOrGPMFromFlag ( _high: number, _low: number, _flag: number, _circuitSlot: number ): { flag: Pump.PumpSpeedType, gpm?: number, rpm?: number }
        {

            // decode flag
            var single_flag = ( ( _flag >> _circuitSlot - 1 ) & 1 ) === 0
            if ( single_flag === true )
            // GPM
            {
                return {
                    flag: 'gpm',
                    gpm: _high
                }
            } else
            {
                return {
                    flag: 'rpm',
                    rpm: ( _high * 256 ) + _low
                }
            }
        }

        private parseVSPump ( data: number[] ): void
        {
            this.circuitSlot = {}
            for ( let i = 1; i <= 8; i++ )
            {

                let circ = `CIRCUIT${ i }`
                let rpml = `CIRCUIT${ i }RPML`
                let rpmh = `CIRCUIT${ i }RPMH`
                let tempObj: Pump.ConfigCircuitSlotValues = Object.assign(
                    this.associate_circuit( data[ c.pumpConfigFieldsVSF[ circ ] ] ),
                    { flag: 'rpm' as Pump.PumpSpeedType },
                    { rpm: ( data[ c.pumpConfigFieldsVS[ rpmh ] ] * 256 ) + data[ c.pumpConfigFieldsVS[ rpml ] ] }
                )
                this.circuitSlot[ i ] = tempObj
            }

            this.prime = {
                primingMinutes: data[ c.pumpConfigFieldsVS[ 'PRIMINGMINS' ] ],
                rpm: ( data[ c.pumpConfigFieldsVS[ 'PRIMERPMH' ] ] * 256 ) + data[ c.pumpConfigFieldsVS[ 'PRIMERPML' ] ]
            }

        }

        private parseVSFPump ( data: number[] )
        {
            this.circuitSlot = {}
            for ( let i = 1; i <= 8; i++ )
            {
                let circ = `CIRCUIT${ i }`
                let h = `CIRCUIT${ i }H`
                let rpml = `CIRCUIT${ i }RPML`
                let tempObj: Pump.ConfigCircuitSlotValues = Object.assign(
                    this.associate_circuit( data[ c.pumpConfigFieldsVSF[ circ ] ] ),
                    this.getRpmOrGPMFromFlag( data[ c.pumpConfigFieldsVSF[ h ] ], data[ c.pumpConfigFieldsVSF[ rpml ] ], data[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ], i )
                )
                this.circuitSlot[ i ] = tempObj
            }
        }

        private parseVFPump ( data: number[] )
        {
            this.backgroundCircuit = this.type
            this.circuitSlot = {}
            for ( let i = 1; i <= 8; i++ )
            {
                let circ = `CIRCUIT${ i }`
                let circgpm = `CIRCUIT${ i }GPM`
                let tempObj: Pump.ConfigCircuitSlotValues = Object.assign(
                    this.associate_circuit( data[ c.pumpConfigFieldsVSF[ circ ] ] ),
                    { flag: 'gpm' as Pump.PumpSpeedType },
                    { gpm: data[ c.pumpConfigFieldsVF[ circgpm ] ] }
                )
                this.circuitSlot[ i ] = tempObj
            }

            let filter: Pump.ConfigFilterValues = {
                poolSize: data[ c.pumpConfigFieldsVF[ 'POOLSIZE' ] ] * 1000,
                turnOvers: data[ c.pumpConfigFieldsVF[ 'TURNOVERS' ] ],
                manualFilterGPM: data[ c.pumpConfigFieldsVF[ 'MANUALFILTERGPM' ] ]
            }
            let vacuum: Pump.ConfigVacuumValues = {
                flow: data[ c.pumpConfigFieldsVF[ 'VACUUMFLOW' ] ] + 1,
                time: data[ c.pumpConfigFieldsVF[ 'VACUUMTIME' ] ]
            }
            let priming: Pump.ConfigVFPrimingValues = {
                maxFlow: data[ c.pumpConfigFieldsVF[ 'MAXPRIMEFLOW' ] ],
                maxTime: data[ c.pumpConfigFieldsVF[ 'MAXPRIMESYSTEMTIME' ] ] & 15, //mask lower 4 bits
                systemMaxTime: data[ c.pumpConfigFieldsVF[ 'MAXPRIMESYSTEMTIME' ] ] >> 4, // higher 4 bits
            }

            let backwash: Pump.ConfigBackwashValues = {
                maxPressureIncrease: data[ c.pumpConfigFieldsVF[ 'MAXPRESSUREINCREASE' ] ],
                flow: data[ c.pumpConfigFieldsVF[ 'BACKWASHFLOW' ] ],
                time: data[ c.pumpConfigFieldsVF[ 'BACKWASHTIME' ] ],
                rinseTime: data[ c.pumpConfigFieldsVF[ 'RINSETIME' ] ]
            }
            this.filtering = Object.assign( { filter: filter }, { vacuum: vacuum }, { priming: priming }, { backwash: backwash } )
        }

        setSpeed ( _circuitSlot: number, _speed: number )
        {
            let proceed = true;
            // Validation of speed/type combos
            if ( this.type === 'VS' )
            {
                if ( _speed < 450 || _speed > 3450 )
                {
                    proceed = false
                }
            }
            else if ( this.type === 'VF' )
            {
                if ( _speed > 130 || _speed < 15 ) 
                {
                    proceed = false
                }
            }
            else if ( this.type === 'VSF' )
            {
                if ( _speed < 15 || _speed > 3450 ||
                    ( _speed > 130 && _speed < 450 ) )
                {
                    proceed = false
                }
            }

            if ( !proceed )
            {
                logger.warn( `API: Set Speed called on ${ this.type } with speed ${ _speed }.  Speed needs to be 13-130 GPM (VF/VSF) or 450-3450 RPM (VS/VSF).` )
                return
            }

            let _bytes = this[ BYTES ].slice()
            _bytes[ c.packetFields[ 'ACTION' ] ] = 155

            // if the circuitSlot doesn't exist yet
            // EG if the pump is none we need to create it.
            // and RPM
            switch ( this.type )
            {
                case 'VS':
                    let rpmlVS = `CIRCUIT${ _circuitSlot }RPML`
                    let rpmhVS = `CIRCUIT${ _circuitSlot }RPMH`
                    let _rpmh = Math.floor( _speed / 256 )
                    let _rpml = _speed - ( _rpmh * 256 )
                    _bytes[ c.pumpConfigFieldsVS[ rpmlVS ] ] = _rpml
                    _bytes[ c.pumpConfigFieldsVS[ rpmhVS ] ] = _rpmh
                    break;
                case 'VF':
                    let gpm = `CIRCUIT${ _circuitSlot }GPM`
                    _bytes[ c.pumpConfigFieldsVF[ gpm ] ] = _speed
                    break;
                case 'VSF':
                    let rpmlVSF = `CIRCUIT${ _circuitSlot }RPML`
                    let rpmhVSF = `CIRCUIT${ _circuitSlot }H`
                    if ( _speed <= 130 )
                    {
                        // GPM
                        _bytes[ c.pumpConfigFieldsVSF[ rpmhVSF ] ] = _speed
                        _bytes[ c.pumpConfigFieldsVSF[ rpmlVSF ] ] = 0
                    }
                    else
                    {
                        // RPM
                        let _rpmh = Math.floor( _speed / 256 )
                        let _rpml = _speed - ( _rpmh * 256 )
                        _bytes[ c.pumpConfigFieldsVSF[ rpmhVSF ] ] = _rpmh
                        _bytes[ c.pumpConfigFieldsVSF[ rpmlVSF ] ] = _rpml
                    }

                    // set bit
                    // from https://hackernoon.com/programming-with-js-bitwise-operations-393eb0745dc4
                    let mask = 1 << ( _circuitSlot - 1 )
                    let flag = _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ]
                    _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ] = flag | mask

            }

            // remove check high/low
            _bytes.pop()
            _bytes.pop()
            _bytes[ c.packetFields[ 'DEST' ] ] = 16
            _bytes[ c.packetFields[ 'FROM' ] ] = settings.get( 'appAddress' )
            queuePacket.queuePacket( _bytes )
            // request to get pump config to reprocess new pump config
            pumpConfig.getPumpConfiguration()
        }

        setCircuit ( _circuitSlot: number, _circuit: number )
        {
            let circ = `CIRCUIT${ _circuitSlot }`
            let _bytes = this[ BYTES ].slice()
            _bytes[ c.packetFields[ 'ACTION' ] ] = 155

            // ciruits are consistent across VS/VF/VSF
            _bytes[ c.pumpConfigFieldsVS[ circ ] ] = _circuit

            // remove check high/low
            _bytes.pop()
            _bytes.pop()
            _bytes[ c.packetFields[ 'DEST' ] ] = 16
            _bytes[ c.packetFields[ 'FROM' ] ] = settings.get( 'appAddress' )
            queuePacket.queuePacket( _bytes )
            // request to get pump config to reprocess new pump config
            pumpConfig.getPumpConfiguration()
        }

        setType ( _type: Pump.PumpType )
        {
            let _bytes = this[ BYTES ].slice()
            _bytes[ c.packetFields[ 'ACTION' ] ] = 155
            _bytes[ c.pumpConfigFieldsCommon[ 'TYPE' ] ] = c.pumpType[ _type ]

            if ( _type === 'VS' )
            {
                _bytes[ c.pumpConfigFieldsVS[ 'PRIMINGMINS' ] ] = 0
                _bytes[ c.pumpConfigFieldsVS[ 'PRIMERPMH' ] ] = 3
                _bytes[ c.pumpConfigFieldsVS[ 'PRIMERPML' ] ] = 232

                // for each circuit slot
                for ( let i = 1; i <= 8; i++ )
                {

                    let _speed = 1000; // default
                    let rpml = `CIRCUIT${ i }RPML`
                    let rpmh = `CIRCUIT${ i }RPMH`
                    let _rpmh = Math.floor( _speed / 256 )
                    let _rpml = _speed - ( _rpmh * 256 )
                    _bytes[ c.pumpConfigFieldsVS[ rpml ] ] = _rpml
                    _bytes[ c.pumpConfigFieldsVS[ rpmh ] ] = _rpmh
                }
            }
            else if ( _type === 'VF' )
            {
                // Filter Params
                _bytes[ c.pumpConfigFieldsVF[ 'POOLSIZE' ] ] = 15
                _bytes[ c.pumpConfigFieldsVF[ 'TURNOVERS' ] ] = 2
                _bytes[ c.pumpConfigFieldsVF[ 'MANUALFILTERGPM' ] ] = 30
                // Vacuum Params
                _bytes[ c.pumpConfigFieldsVF[ 'VACUUMFLOW' ] ] = 50
                _bytes[ c.pumpConfigFieldsVF[ 'VACUUMTIME' ] ] = 10
                // Priming Params
                _bytes[ c.pumpConfigFieldsVF[ 'MAXPRIMEFLOW' ] ] = 55
                _bytes[ c.pumpConfigFieldsVF[ 'MAXPRIMESYSTEMTIME' ] ] = 5

                // Backwash Params
                _bytes[ c.pumpConfigFieldsVF[ 'MAXPRESSUREINCREASE' ] ] = 10
                _bytes[ c.pumpConfigFieldsVF[ 'BACKWASHFLOW' ] ] = 60
                _bytes[ c.pumpConfigFieldsVF[ 'BACKWASHTIME' ] ] = 5
                _bytes[ c.pumpConfigFieldsVF[ 'RINSETIME' ] ] = 1
                _bytes[ c.pumpConfigFieldsVF[ 'UNUSED_35' ] ] = 0


                // for each circuit slot
                for ( let i = 1; i <= 8; i++ )
                {
                    let circ = `CIRCUIT${ i }`
                    let circgpm = `CIRCUIT${ i }GPM`
                    _bytes[ c.pumpConfigFieldsVF[ circ ] ] = 0
                    _bytes[ c.pumpConfigFieldsVF[ circgpm ] ] = 30
                }
            }
            else if ( _type === 'VSF' )
            {
                _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ] = 0
                _bytes[ c.pumpConfigFieldsVSF[ 'PRIMINGMINS' ] ] = 0
                _bytes[ c.pumpConfigFieldsVSF[ 'UNKNOWNCONSTANT_9' ] ] = 0
                _bytes[ c.pumpConfigFieldsVSF[ 'PRIMERPML' ] ] = 0
                _bytes[ c.pumpConfigFieldsVSF[ 'PRIMERPMH' ] ] = 0
                for ( let i = 1; i <= 8; i++ )
                {
                    let _speed = 30;
                    let rpml = `CIRCUIT${ i }RPML`
                    let rpmh = `CIRCUIT${ i }H`
                    _bytes[ c.pumpConfigFieldsVSF[ rpml ] ] = 0
                    _bytes[ c.pumpConfigFieldsVSF[ rpmh ] ] = _speed
                }
            }
            else
            {
                // for None
                // for each circuit slot
                for ( let i = 1; i <= 8; i++ )
                {
                    let _speed = 1000; // default
                    let rpml = `CIRCUIT${ i }RPML`
                    let rpmh = `CIRCUIT${ i }RPMH`
                    let _rpmh = Math.floor( _speed / 256 )
                    let _rpml = _speed - ( _rpmh * 256 )
                    _bytes[ c.pumpConfigFieldsVS[ rpml ] ] = _rpml
                    _bytes[ c.pumpConfigFieldsVS[ rpmh ] ] = _rpmh
                }
            }

            // separate logic for extended bytes 37-44
            for ( let i = 37; i <= 44; i++ )
            {
                _bytes[ i ] = _type === 'VSF' ? 255 : 0
            }

            // remove check high/low
            _bytes.pop()
            _bytes.pop()
            _bytes[ c.packetFields[ 'DEST' ] ] = 16
            _bytes[ c.packetFields[ 'FROM' ] ] = settings.get( 'appAddress' )
            queuePacket.queuePacket( _bytes )
            // request to get pump config to reprocess new pump config
            pumpConfig.getPumpConfiguration()

        }

        setRPMGPM ( _circuitSlot: number, _speedType: Pump.PumpSpeedType )
        {
            // VSF only
            if ( this.type !== 'VSF' )
            {
                logger.warn( `Can only call set type on VSF.  Pump is ${ this.type }` )
                return
            }
            let _bytes = this[ BYTES ].slice()
            _bytes[ c.packetFields[ 'ACTION' ] ] = 155

            // if the circuitSlot doesn't exist yet
            // EG if the pump is none we need to create it.
            // and RPM
            let _h = `CIRCUIT${ _circuitSlot }H`
            let _l = `CIRCUIT${ _circuitSlot }RPML`
            let flag = _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ]

            if ( _speedType === 'rpm' )
            {
                let _speed = 1000;
                let _rpmh = Math.floor( _speed / 256 )
                let _rpml = _speed - ( _rpmh * 256 )
                _bytes[ c.pumpConfigFieldsVSF[ _h ] ] = _rpmh
                _bytes[ c.pumpConfigFieldsVSF[ _l ] ] = _rpml
                // set bit
                // from https://hackernoon.com/programming-with-js-bitwise-operations-393eb0745dc4
                let mask = 1 << ( _circuitSlot - 1 )
                _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ] = flag | mask
            }
            else // gpm
            {
                let _speed = 30;
                _bytes[ c.pumpConfigFieldsVSF[ _h ] ] = _speed
                _bytes[ c.pumpConfigFieldsVSF[ _l ] ] = 0
                // clear bit (gpm = 0)
                // from https://hackernoon.com/programming-with-js-bitwise-operations-393eb0745dc4
                let mask = ~( 1 << ( _circuitSlot - 1 ) )
                _bytes[ c.pumpConfigFieldsVSF[ 'RPMGPMFLAG' ] ] = flag & mask
            }

            // remove check high/low
            _bytes.pop()
            _bytes.pop()
            _bytes[ c.packetFields[ 'DEST' ] ] = 16
            _bytes[ c.packetFields[ 'FROM' ] ] = settings.get( 'appAddress' )
            queuePacket.queuePacket( _bytes )
            // request to get pump config to reprocess new pump config
            pumpConfig.getPumpConfiguration()
        }
    }


    export function init (): void
    {
        if ( currentPumpConfig === undefined )
            currentPumpConfig = {}
        // delete all entries
        for ( var key in currentPumpConfig )
        {
            delete currentPumpConfig[ key ]
        }
        // load from settings
        let _pC = settings.get( 'pumpConfig' )
        Object.assign( currentPumpConfig, _pC )

        if ( settings.get( 'logPumpMessages' ) )
            logger.silly( 'Pump extended config loaded from configuration file.' )
    }

    export function getExtendedPumpConfig (): Pump.ExtendedConfigObj
    {
        // return JSON.parse(JSON.stringify(currentPumpConfig))
        return currentPumpConfig
    }

    export function setSpeedViaAPI ( _pump: Pump.PumpIndex, _circuitSlot: number, _speed: number ): void
    {
        try
        {
            logger.info( `API: User request to set pump ${ _pump } circuit slot ${ _circuitSlot } to ${ _speed }` )

            currentPumpConfig[ _pump ].setSpeed( _circuitSlot, _speed )
        }
        catch ( err )
        {
            logger.warn( `Application has not yet received pump configuration, trying to get it.  Please try again. \n${ err.message }` )
            getExtendedPumpConfig()
        }
    }

    export function setCircuitViaAPI ( _pump: Pump.PumpIndex, _circuitSlot: number, _circuit: number ): void
    {
        try
        {
            logger.info( `API: User request to set pump ${ _pump } circuit slot ${ _circuitSlot } to ${ circuit.getFriendlyName( _circuit ) } (${ _circuit })` )
            currentPumpConfig[ _pump ].setCircuit( _circuitSlot, _circuit )
        }
        catch ( err )
        {
            logger.warn( `Application has not yet received pump configuration, trying to get it.  Please try again.  \n${ err.message }` )
            getExtendedPumpConfig()
        }
    }

    export function setTypeViaAPI ( _pump: Pump.PumpIndex, _type: Pump.PumpType ): void
    {
        try
        {
            logger.info( `API: User request to set pump ${ _pump } type to ${ _type }` )
            currentPumpConfig[ _pump ].setType( _type )
        }
        catch ( err )
        {
            logger.warn( `Application has not yet received pump configuration, trying to get it.  Please try again. \n${ err.message }` )
            getExtendedPumpConfig()
        }
    }

    export function setRPMGPMViaAPI ( _pump: Pump.PumpIndex, _circuitSlot: number, _speedType: Pump.PumpSpeedType ): void
    {
        try
        {
            logger.info( `API: User request to set pump ${ _pump } circuit slot ${ _circuitSlot } to ${ _speedType }.` )
            currentPumpConfig[ _pump ].setRPMGPM( _circuitSlot, _speedType )
        }
        catch ( err )
        {
            logger.warn( `Application has not yet received pump configuration, trying to get it.  Please try again.  \n${ err.message }` )
            getExtendedPumpConfig()
        }
    }
    export function getPumpConfiguration ()
    {
        //get pump Configution
        for ( var i = 1; i <= pump.numberOfPumps(); i++ )
        {
            //NOTE: pump config for pump 0 returns data but not sure what it is

            // if ( currentPumpStatus[ i ].type === 'VS' || currentPumpStatus[ i ].type === 'VF' || currentPumpStatus[ i ].type === 'VSF' )
            queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 219, 1, i ] );
        }
    }

    export function process ( data: number[], counter: number )
    {
        if ( settings.get( 'logPumpMessages' ) )
            logger.debug( 'Msg# %s   Pump Config (Extended) status packet: %s', counter, data )

        let pumpNum = data[ c.pumpConfigFieldsCommon[ 'NUMBER' ] ]
        let _pumpType = <Pump.PumpType> c.pumpTypeStr[ data[ c.pumpConfigFieldsCommon[ 'TYPE' ] ] ]
        currentPumpConfig[ pumpNum ] = new PumpExtendedConfig( _pumpType, data )

        logger.info( `Discovered extended pump config:\nPump: ${ pumpNum }\n${ JSON.stringify( currentPumpConfig[ pumpNum ], null, 2 ) }` )

        if ( pumpNum === pump.numberOfPumps() )
        {
            settings.updatePumpConfig( currentPumpConfig )
        }
        io.emitToClients( 'pump',
            pump.getCurrentPumpStatus()
        )

        return true
    }
}