import io from 'socket.io-client'
const socket = io({})
let lastUpdateTime = 0;
let subscribed = 0;

function getAll(cb) {

    if (!subscribed) {
        //console.log(`SUBSCRIBING!`)
        socket.emit('all');

        socket.on('all', (data) => {
            let milli = Date.now() - lastUpdateTime;
            lastUpdateTime = Date.now()
            //console.log(`milli: ${milli}`)
            /*         if (milli < 500){
                        // throw out results.  find better server side solution to this
                        console.log('throwing out results')
                        
                    }
                    else {
                        console.log(`Retrieved data: ${data.config.systemReady}`)
                        cb(null, data);
                
                    } */
            cb(null, data, 'all');
        })

        socket.on('circuit', data => {
           // console.log('circuit socket received')
            cb(null, data, 'circuit')
        })

        socket.on('pump', data => {
            //console.log('pump socket')
            cb(null, data, 'pump')
        })

        socket.on('temperature', data => {
            cb(null, data, 'temperature')
        })

        socket.on('chlorinator', data => {
            cb(null, data, 'chlorinator')
        })

        subscribed = 1;
    }
    else {
        //console.log(`NOT SUBSCRIBING`)
    }
}



function setDateTime(newDT) {
    //socket.on('setDateTime', function (hh, mm, dow, dd, mon, yy, dst)
    //socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST)
    let autoDST = 1 // implement later in UI
    socket.emit('setDateTime', newDT.getHours(), newDT.getMinutes(), Math.pow(2, newDT.getDay()), newDT.getDate(), newDT.getMonth() + 1, newDT.getFullYear().toString().slice(-2), autoDST)
}

function toggleCircuit(circuit) {
    console.log(`emitting toggle circuit ${circuit}`)
    socket.emit('toggleCircuit', circuit)
}

function setHeatMode(equip, mode){
    if (equip.toLowerCase()==='spa'){
        socket.emit('spaheatmode', mode)
    }
    else {
        socket.emit('poolheatmode', mode)
    }
}

function setHeatSetPoint(equip, temp){
    if (equip.toLowerCase()==='spa'){
        socket.emit('setSpaSetPoint', temp)
    }
    else {
        socket.emit('setPoolSetPoint', temp)
    } 
}

function setChlorinatorLevels(poolLevel, spaLevel, superChlorinateHours){
    socket.emit('setchlorinator', poolLevel, spaLevel, superChlorinateHours)
}

function hidePanel(panel){
    socket.emit('hidePanel', panel)
}

export { getAll, setDateTime, toggleCircuit, setHeatMode, setHeatSetPoint, setChlorinatorLevels, hidePanel };