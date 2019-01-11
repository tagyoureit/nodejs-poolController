import io from 'socket.io-client'
const socket = io({})
let lastUpdateTime = 0;

function getAll(cb){
    socket.emit('all');
    socket.on('all', (data) => {
        let milli = Date.now() - lastUpdateTime;
        lastUpdateTime = Date.now()
        console.log(`milli: ${milli}`)
        if (milli < 500){
            // throw out results.  find better server side solution to this
            console.log('throwing out results')
            
        }
        else {
            console.log(`Retrieved data: ${data.config.systemReady}`)
            cb(null, data);
    
        }
    })
}

export { getAll };