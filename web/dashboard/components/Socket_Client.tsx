let io = require( 'socket.io-client' )
const socket = io( {} )
// piggyback using the event-emitter bundled with socket.io client
var patch = require('socketio-wildcard')(io.Manager);
patch(socket);
let lastUpdateTime = 0;
let subscribed = 0;

export function emitSocket ( which: string )
{
    socket.emit( which )
}

export function incoming ( cb: any )
{
    if ( !subscribed )
    {
        socket.on( '*', ( data ) =>
        {
            if ( data.data[1] === null || data.data[1] === undefined )
            {
                console.log( `ALERT: Null socket data received for ${data.data[0]}` )
            } else
                cb( data.data[1], data.data[0] )
        } )
        socket.on( 'connect_error', function ( data )
        {
            console.log( 'connection error:' + data );
            cb( { status: { val: 255, desc: 'Connection Error', name: 'error' } }, 'error' );
        } )
        socket.on( 'connect_timeout', function ( data )
        {
            console.log( 'connection timeout:' + data );
        } );

        socket.on( 'reconnect', function ( data )
        {
            console.log( 'reconnect:' + data );
        } );
        socket.on( 'reconnect_attempt', function ( data )
        {
            console.log( 'reconnect attempt:' + data );
        } );
        socket.on( 'reconnecting', function ( data )
        {
            console.log( 'reconnecting:' + data );
        } );
        socket.on( 'reconnect_failed', function ( data )
        {
            console.log( 'reconnect failed:' + data );
        } );
        socket.on( 'connect', function ( sock )
        {
            console.log( { msg: 'socket connected:', sock: sock } );
            cb( { status: { val: 1, desc: 'Connected', name: 'connected', percent: 0 } }, 'connect' );

        } );
        socket.on( 'close', function ( sock )
        {
            console.log( { msg: 'socket closed:', sock: sock } );
        } );
        subscribed = 1;
    }
}


export function setDateTime ( newDT: any )
{

    // let autoDST = 1 // implement later in UI
    // socket.emit( 'setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow( 2, newDT.getDay() ), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice( -2 ), autoDST )
}

export function toggleCircuit ( circuit: number ): void
{
    fetch( '/state/circuit/toggleState', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( { id: circuit } )
    })
    
}

export function setHeatMode ( id: number, mode: number ): void
{
    fetch( '/state/body/heatMode', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( { id: id, mode: mode } )
    })
}

export function setHeatSetPoint ( id: number, temp: number ): void
{
    fetch( '/state/body/setPoint', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( { id: id, setPoint: temp } )
    })
}

export function setChlor ( id: number, poolLevel: number, spaLevel: number, superChlorinateHours: number ): void
{
    // socket.emit( 'setchlorinator', poolLevel, spaLevel, superChlorinateHours )
    fetch( '/state/chlorinator/setChlor', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( { id: id, poolSetpoint: poolLevel, spaSetpoint: spaLevel, superChlorHours: superChlorinateHours } )
    } )
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

export function search ( allOrAny: string, dest: string, src: string, action: string )
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

export function replayPackets ( arrToBeSent: number[][] )
{
    socket.emit( 'replayPackets', arrToBeSent )
}
export function sendPackets ( arrToBeSent: number[][] )
{
    socket.emit( 'sendPackets', arrToBeSent )
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

export function setPumpConfigRate ( pump, pumpConfigId: number, rate: number )
{
    // socket.emit( 'setPumpConfigSpeed', _pump, _circuitSlot, _speed )
    fetch( '/config/pump/circuitRate', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( {id: pump, rate: rate, pumpCircuitId: pumpConfigId   } )
    } )
}

export function setPumpConfigCircuit ( pump:number, circuitId: number, pumpCircuitId: number )
{
    // socket.emit( 'setPumpConfigCircuit', _pump, _circuitSlot, _circuit )
    fetch( '/config/pump/circuit', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( {id: pump, circuitId: circuitId, pumpCircuitId: pumpCircuitId   } )
    } )
}

export function setPumpConfigType ( id, pumpType )
{
    // socket.emit( 'setPumpConfigType', _pump, _type )
    fetch( '/config/pump/type', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( {id: id, pumpType: pumpType   } )
    } )
}

export function setPumpConfigUnits ( pump, pumpCircuitId: number, units )
{
    // socket.emit( 'setPumpConfigRPMGPM', _pump, _circuitSlot, _speedType )
    fetch( '/config/pump/circuitRateUnits', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify( {id: pump, units: units, pumpCircuitId: pumpCircuitId   } )
    } )
}

