describe('Tests the code that captures packets and a full log for troubleshooting', function () {

    const readline = require('readline');
    const fs = require('fs');
    let fileContents = []

    const loadFile = (file) => {

        return new Promise(function (resolve, reject) {
            const rl = readline.createInterface({
                input: fs.createReadStream(bottle.container.path.join(process.cwd(), file))
            });

            rl.on('line', function (line) {
                newline = JSON.parse(line)
                fileContents.push(newline);
            });

            rl.on('close', function () {
                resolve()
            });
        })

    }

    let playFile = () => {

        return Promise.resolve()
            .then(function () {
                fileContents.forEach(function (line) {


                    if (line.type === 'packet') {
                        bottle.container.packetBuffer.push(Buffer.from(line.packet))
                    }
                    else {
                        bottle.container.logger.debug('Skipping packet %s', JSON.stringify(line))
                    }



                })
            })
            .then(function(){
                bottle.container.logger.debug('Read %s lines. ', fileContents.length)
            })
            .delay(10*fileContents.length)

    }


    describe('#Replay packets from various systems', function () {
        context('via the replay tool', function () {

            before(function () {
            });

            beforeEach(function () {

            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                global.stopAllAsync()
            })

            it('#Check intellibrite with two controllers', function () {
                this.timeout(0)
                return global.initAllAsync({
                    'configLocation': './specs/assets/replays/1/config.json',
                    'suppressWrite': true
                })
                    .then(function(){
                        loggers = setupLoggerStubOrSpy('stub', 'spy')
                    })
                    .then(function () {
                        return loadFile('./specs/assets/replays/1/packetCapture.json')
                    })
                    .then(playFile)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:', JSON.stringify(json))
                        json[3].position.should.eq(1)
                        json[4].colorSet.should.eq(0)
                        json[4].colorSwimDelay.should.eq(5)
                    })


            })
        })
    })
})
