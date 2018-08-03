// This file is for replaying the logs captured by `npm run start:capture`.
// This file should be executed by `npm run test:replay`
// It requires packetCapture.json in the root of the app.



var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');

let fileContents = []


const readline = require('readline');
const fs = require('fs');
let counter = 1; // counter to label tests (pre-compiled)
let runToCounter = 1;  // counter for how many packets are processed based on runTo input
let runTo = 1;  // user input for how many packets to run until asked again
let runningCounter = 0;  // ongoing counter when running tests
let totalPackets = 0;

let input = function (done) {
    runningCounter += 1
    console.log('\nPlaying packet %s out of %s for this run.  %s of %s left.', runTo, runToCounter, totalPackets-runningCounter, totalPackets)
    if (runTo === runToCounter || !runToCounter) {

        runTo = 1
        runToCounter = 1
        let rl2 = readline.createInterface({input: process.stdin, output: process.stdout})
        rl2.question('Continue to next line or how many lines? ', (answer) => {


            if (isNaN(parseInt(answer))) {
                runToCounter = 1
            }
            else {
                runToCounter = parseInt(answer)
            }

            rl2.close();
            done()
        })

    }
    else if (runTo <= runToCounter && runningCounter <= totalPackets) {
        runTo += 1
        done()

    } else {
        // do we want to quit the app or wait?
        let rl2 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        rl2.question('\nAt end of packets.  Press enter to end. ', (answer) => {

            rl2.close();
            done()
        })
    }


}


const rl = readline.createInterface({
    input: fs.createReadStream(bottle.container.path.join(process.cwd(), './replay/packetCapture.json'))
});

rl.on('line', function (line) {
    newline = JSON.parse(line)
    fileContents.push(newline);
});

rl.on('close', function () {

    console.log('Number of packets in replayer file: ', fileContents.length)
    totalPackets = fileContents.length


    describe('Replays packets', function () {


        before(function () {
            return global.initAllAsync({'configLocation': './replay/config.json', 'suppressWrite': true})
        });

        beforeEach(function () {
            loggers = setupLoggerStubOrSpy('spy', 'spy')
            //controllerConfigNeededStub = sinon.replace(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration', sinon.fake.returns(0))

        })

        afterEach(function () {

        })

        after(function () {
            return global.stopAllAsync()
        })

        fileContents.forEach(function (line) {
                if (line.type === 'packet') {
                    if (line.direction === 'inbound') {
                        var pktType = bottle.container.whichPacket.inbound(line.packet)

                        it('#replays inbound ' + counter + '-' + pktType + ' - ' + line.packet, function (done) {
                            this.timeout(0)
                            Promise.resolve()
                                .then(function () {
                                    return bottle.container.packetBuffer.push(Buffer.from(line.packet))
                                })
                                .delay(50)
                                .then(
                                    function () {
                                        input(done)
                                    })
                        })
                    }
                    else {
                        it('#replays outbound ' + ' - ' + line.packet, function (done) {
                            this.timeout(0)
                            Promise.resolve()
                                .then(function () {
                                    return bottle.container.packetBuffer.push(Buffer.from(line.packet))
                                })
                                .delay(50)
                                .then(
                                    function () {
                                        bottle.container.logger.info('test this?')
                                        input(done)
                                    })
                                .catch(function (err) {
                                    console.error(err)
                                    sinon.assert.fail('Something is wrong')
                                    done()
                                })


                        })
                    }
                }

                counter += 1;
            }
        )


    })


    // see https://mochajs.org/#delayed-root-suite
    run()

})


