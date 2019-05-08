import
{
    settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer,
    pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController,
    promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, pumpController, pumpControllerMiddleware, io
} from '../../../../../src/etc/internal';

import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
let emitToClientsStub: sinon.SinonStub;
let updateAvailStub: sinon.SinonStub;

describe( 'pump controller - save speed (1/2)', function ()
{


    describe('#checks that the right packets are queued', function() {


        before(async()=> {
            await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config.pump.VS.json'})
        });

        beforeEach(function() {
            loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
            emitToClientsStub = sinon.stub(io,'emitToClients')
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            settingsStub = sinon.stub( settings, 'updateExternalPumpProgram' )
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked3!' }
            let updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
        })

        afterEach(function() {
            //restore the sinon after each function
            sinon.restore()
        })

        after(async()=> {
            await globalAny.stopAllAsync()
        })


        it('sets pump 1 program 1 to 1000 rpm', function() {


            var index = <Pump.PumpIndex> 1
            var program = 1
            var speed = 1000
            //var address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            loggerInfoStub:  []
            queuePacketStub.args: [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  3

            */

            //loggerInfoStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
            // console.log('sets pump 1 program 1 to 1000 rpm queuePacketStub:', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 96, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 96, 33, 1, 4, 3, 39, 3, 232])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 96, 33, 7, 0])

        });

        it('sets pump 1 program 2 to 500 rpm', function() {

            var index = <Pump.PumpIndex> 1
            var program = 2
            var speed = 500
            //var address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            queuePacketsStub:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  4

            */
            // console.log('sets pump 1 program 2 to 500 rpm queuePacketStub:', queuePacketStub.args)
            //loggerInfoStub.callCount.should.eq(0)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 96, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 96, 33, 1, 4, 3, 40, 1, 244])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 96, 33, 7, 0])

        });



        it('sets pump 2 program 4 to 3450 rpm', function() {

            var index = <Pump.PumpIndex>2
            var program = 4
            var speed = 3450
            //var address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
                    queuePacketsStub:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
                  [ [ 165, 0, 97, 33, 7, 0 ] ] ]
                    queuePacketStub.callCount:  4

                    */

            //  loggerInfoStub.callCount.should.eq(0)
            // console.log('sets pump 2 program 4 to 3450 rpm queuePacketStub:', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 97, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 97, 33, 1, 4, 3, 42, 13, 122])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 97, 33, 7, 0])
        });



    })
})
