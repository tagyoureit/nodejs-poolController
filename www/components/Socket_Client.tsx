import { string } from 'prop-types';


let io = require( 'socket.io-client' )
const socket = io( {} )
let lastUpdateTime = 0;
let subscribed = 0;

export function emitSocket ( which: string )
{
    socket.emit( which )
}

export function getAll ( cb: any )
{
    if ( !subscribed )
    {
        //console.log(`SUBSCRIBING!`)
        //socket.emit('all');

        socket.on( 'all', ( data: WWW.IPoolOrSpaState ) =>
        {
            let milli = Date.now() - lastUpdateTime;
            lastUpdateTime = Date.now()
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'all'` )
            } else
                cb( null, data, 'all' );
        } )

        socket.on( 'circuit', ( data: Circuit.ICurrentCircuitsArr ) =>
        {
            // console.log('circuit socket received')
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'circuit'` )
            } else

                cb( null, data, 'circuit' )
        } )

        socket.on( 'pump', ( data: Pump.Equipment ) =>
        {
            //console.log('pump socket')
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'pump'` )
            } else

                cb( null, data, 'pump' )
        } )

        socket.on( 'temperature', ( data: Temperature.PoolTemperature ) =>
        {
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'temperature'` )
            } else

                cb( null, data, 'temperature' )
        } )

        socket.on( 'chlorinator', ( data: Chlorinator.IChlorinatorOutput ) =>
        {
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'chlorinator'` )
            } else

                cb( null, data, 'chlorinator' )
        } )

        socket.on( 'intellichem', ( data: any ) =>
        {
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'intellichem'` )
            } else

                cb( null, data, 'intellichem' )
        } )

        socket.on( 'outputLog', ( data: any ) =>
        {
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'outputLog'` )
            } else

                cb( null, data, 'outputLog' )
        } )
        socket.on( 'updateAvailable', ( data: IUpdateAvailable.Ijsons ) =>
        {
            if ( data === null || data === undefined )
            {
                console.log( `ALERT: Null socket data received for 'outputLog'` )
            } else

                cb( null, data, 'updateAvailable' )
        } )

        socket.on( 'searchResults', function ( data: any )
        {
            cb( null, data, 'searchResults' )
        } );

        socket.on( 'schedule', function ( data: any )
        {
            cb( null, data, 'schedule' )
        } );


        subscribed = 1;
    }
    else
    {
        //console.log(`NOT SUBSCRIBING`)
    }
}



export function setDateTime ( newDT: any )
{
    //socket.on('setDateTime', function (hh, mm, dow, dd, mon, yy, dst)
    //socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST)
    let autoDST = 1 // implement later in UI
    socket.emit( 'setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow( 2, newDT.getDay() ), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice( -2 ), autoDST )
}

export function toggleCircuit ( circuit: string ): void
{
    socket.emit( 'toggleCircuit', parseInt(circuit) )
}

export function setHeatMode ( equip: string, mode: number ): void
{
    if ( equip.toLowerCase() === 'spa' )
    {
        socket.emit( 'spaheatmode', mode )
    }
    else
    {
        socket.emit( 'poolheatmode', mode )
    }
}

export function setHeatSetPoint ( equip: string, temp: number ): void
{
    if ( equip.toLowerCase() === 'spa' )
    {
        socket.emit( 'setSpaSetPoint', temp )
    }
    else
    {
        socket.emit( 'setPoolSetPoint', temp )
    }
}

function setChlorinatorLevels ( poolLevel: number, spaLevel: number, superChlorinateHours: number ): void
{
    socket.emit( 'setchlorinator', poolLevel, spaLevel, superChlorinateHours )
}

export function hidePanel ( panel: string ): void
{
    socket.emit( 'hidePanel', panel )
}

export function resetPanels (): void
{
    socket.emit( 'resetConfigClient' )
}

export function setLightMode ( light: number ): void
{
    socket.emit( 'setLightMode', light )
}

export function updateVersionNotification ( bool: boolean ): void
{
    socket.emit( 'updateVersionNotificationSetting', bool )
}

export function search (  allOrAny: string, dest: string, src: string, action: string )
{

    console.log( `Emitting search start: ${ dest } ${ src } ${ action }` )
    socket.emit( 'search', 'start', allOrAny, dest, src, action )
}

export function searchStop ()
{
    socket.emit( 'search', 'stop' )
}

export function searchLoad ()
{
    socket.emit( 'search', 'load' );
}

export function sendPacket ( arrToBeSent: number[][] )
{
    socket.emit( 'sendPacket', arrToBeSent )
}

export function receivePacket ( arrToBeSent: number[][] )
{

    socket.emit( 'receivePacket', JSON.stringify( arrToBeSent ) )
}

export function receivePacketRaw ( packets: number[][] )
{
    socket.emit( 'receivePacketRaw', packets )
}

export function setLightColor ( circuit: number, color: number )
{
    socket.emit( 'setLightColor', circuit, color )
}

export function setLightPosition ( circuit: number, position: number )
{
    socket.emit( 'setLightPosition', circuit, position )
}

export function setLightSwimDelay ( circuit: number, position: number )
{
    socket.emit( 'setLightSwimDelay', circuit, position )
}

export function setScheduleCircuit ( _id: number, _circuit: number )
{
    socket.emit( 'setScheduleCircuit', _id, _circuit )
}

export function setEggTimer ( _id: number, _circuit: number, _hour: number, _minute: number )
    {
    socket.emit( 'setEggTimer', _id, _circuit, _hour, _minute )
}

export function deleteScheduleOrEggTimer ( _id: number )
{
    socket.emit( 'deleteScheduleOrEggTimer', _id )
}

export function setPumpConfigSpeed  (_pump: Pump.PumpIndex, _circuitSlot: number, _speed: number)
{
    socket.emit('setPumpConfigSpeed', _pump, _circuitSlot, _speed)
}

export function setPumpConfigCircuit ( _pump: Pump.PumpIndex, _circuitSlot: number, _circuit: number )
{
    socket.emit('setPumpConfigCircuit', _pump, _circuitSlot, _circuit)
}

export function setPumpConfigType ( _pump: Pump.PumpIndex, _type: Pump.PumpType )
{
    socket.emit('setPumpConfigType', _pump, _type)
}

export function setPumpConfigRPMGPM ( _pump: Pump.PumpIndex, _circuitSlot: number, _speedType: Pump.PumpType )
{
    socket.emit('setPumpConfigRPMGPM', _pump, _circuitSlot, _speedType)
}

