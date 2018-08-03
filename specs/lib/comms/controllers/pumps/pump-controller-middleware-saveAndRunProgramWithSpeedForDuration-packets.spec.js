//TODO: clean up global promises, fs, io...
var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)
describe('pump controller - save and run program with speed for duration', function() {


    describe('#checks that the right packets are queued', function() {

        before(function() {
            return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})


        });

        beforeEach(function() {
            setupLoggerStubOrSpy('stub', 'spy')
            queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
            //socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
            settingsStub = sinon.stub(bottle.container.settings, 'updateExternalPumpProgramAsync')
        })

        afterEach(function() {
            sinon.restore()

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
