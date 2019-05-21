import { string } from 'prop-types';


let io = require( 'socket.io-client' )
const socket = io( {} )
let lastUpdateTime = 0;
let subscribed = 0;

function emitSocket ( which: string )
{
    socket.emit( which )
}

function getAll ( cb: any )
{

    console.log( `in getall` )

    if ( !subscribed )
    {
        //console.log(`SUBSCRIBING!`)
        //socket.emit('all');

        socket.on( 'all', ( data: WWW.IPoolOrSpaState ) =>
        {
            console.log( `all socket!` )
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



function setDateTime ( newDT: any )
{
    //socket.on('setDateTime', function (hh, mm, dow, dd, mon, yy, dst)
    //socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST)
    let autoDST = 1 // implement later in UI
    socket.emit( 'setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow( 2, newDT.getDay() ), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice( -2 ), autoDST )
}

function toggleCircuit ( circuit: number ): void
{
    console.log( `emitting toggle circuit ${ circuit }` )
    socket.emit( 'toggleCircuit', circuit )
}

function setHeatMode ( equip: string, mode: number ): void
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

function setHeatSetPoint ( equip: string, temp: number ): void
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

function hidePanel ( panel: string ): void
{
    socket.emit( 'hidePanel', panel )
}

function resetPanels (): void
{
    socket.emit( 'resetConfigClient' )
}

function setLightMode ( light: number ): void
{
    socket.emit( 'setLightMode', light )
}

function updateVersionNotification ( bool: boolean ): void
{
    socket.emit( 'updateVersionNotificationSetting', bool )
}

function search ( src: number, dest: number, action: number )
{
    console.log( `Emitting search start: ${ src } ${ dest } ${ action }` )
    socket.emit( 'search', 'start', src, dest, action )
}

function searchStop ()
{
    socket.emit( 'search', 'stop' )
}

function searchLoad ()
{
    socket.emit( 'search', 'load' );
}

function sendPacket ( arrToBeSent: number[][] )
{
    socket.emit( 'sendPacket', arrToBeSent )
}

function receivePacket ( arrToBeSent: number[][] )
{

    socket.emit( 'receivePacket', JSON.stringify( arrToBeSent ) )
}

function receivePacketRaw ( packets: number[] )
{
    socket.emit( 'receivePacketRaw', packets )
}

function setLightColor ( circuit: number, color: number )
{
    socket.emit( 'setLightColor', circuit, color )
}

function setLightPosition ( circuit: number, position: number )
{
    socket.emit( 'setLightPosition', circuit, position )
}

function setLightSwimDelay ( circuit: number, position: number )
{
    socket.emit( 'setLightSwimDelay', circuit, position )
}

function setScheduleCircuit ( _id: number, _circuit: number )
{
    socket.emit( 'setScheduleCircuit', _id, _circuit )
}

export function setEggTimer ( _id: number, _circuit: number, _hour: number, _minute: number )
    {
    socket.emit( 'setEggTimer', _id, _circuit, _hour, _minute )
}

export { getAll, emitSocket, setDateTime, toggleCircuit, setHeatMode, setHeatSetPoint, setChlorinatorLevels, hidePanel, resetPanels, setLightMode, updateVersionNotification, search, searchStop, searchLoad, sendPacket, receivePacket, receivePacketRaw, setLightColor, setLightPosition, setLightSwimDelay, setScheduleCircuit};