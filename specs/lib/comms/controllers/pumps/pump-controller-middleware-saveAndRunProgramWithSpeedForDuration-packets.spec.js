//TODO: clean up global promises, fs, io...
var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)
describe('pump controller - save and run program with speed for duration', function() {


    describe('#checks that the right packets are queued', function() {

        before(function() {


            // fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.pump.VS.json'))
            //     .then(function(pumpVS) {
            //         return JSON.parse(pumpVS)
            //     })
            //     .then(function(parsed) {
            //         bottle.container.settings.set('pump', parsed)
            //         return bottle.container.pump.init()
            //     })
            //     .then(global.initAllAsync)
            //     .catch(function(err) {
            //         /* istanbul ignore next */
            //         console.log('oops, we hit an error', err)
            //     })
            return global.initAllAsync(path.join(process.cwd(), '/specs/assets/config/config.pump.VS.json'))

        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggerInfostub = sandbox.stub(bottle.container.logger, 'info')

            loggerVerbosestub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugstub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillystub = sandbox.stub(bottle.container.logger, 'silly')

            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
            //endPumpCommandStub = sandbox.stub()
            //emitToClientsStub = sandbox.stub(bottle.container.io.emit)
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            //socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updateExternalPumpProgramAsync')
        })

        afterEach(function() {

            return sandbox.restore()

        })

        after(function() {
            return global.stopAllAsync()
        })


        it('runs pump 1 program 1 at 1000 rpm for 1 minute', function() {



            var index = 1
            var program = 1
            var speed = 1000
            var duration = 1
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],

              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],

              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  9

            */
            queuePacketStub.callCount.should.eq(7)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram1RPM1000Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RemotePacket)

            queuePacketStub.args[4][0].should.deep.equal(global.pump1RunProgram1Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump1RequestStatusPacket)

            bottle.container.pumpControllerTimers.clearTimer(1)

        });

        it('runs pump 1 program 2 at 500 rpm for 60 minutes', function() {
            var index = 1
            var program = 2
            var speed = 500
            var duration = 60
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 2:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  7

            */
            // console.log('run 2: ', queuePacketStub.args)
            //console.log('logger 2: ', loggerInfoStub.args)

            queuePacketStub.callCount.should.eq(7)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram2RPM500Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump1RunProgram2Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump1RequestStatusPacket)
            bottle.container.pumpControllerTimers.clearTimer(1)

        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {

            var index = 2
            var program = 4
            speed = 3450
            var duration = 120
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 2/4:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
            [ [ 165, 0, 97, 33, 7, 0 ] ],
            [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
            [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            start timer 2/4 :  [ [ 2 ] ]
            queuePacketStub.callCount:  7

            */
            // console.log('run 2/4: ', queuePacketStub.args)

            queuePacketStub.callCount.should.eq(7)

            queuePacketStub.args[0][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump2SetProgram4RPM3450Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump2RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump2RunProgram4Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump2PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump2RequestStatusPacket)
            bottle.container.pumpControllerTimers.clearTimer(2)

        });



    })
})
