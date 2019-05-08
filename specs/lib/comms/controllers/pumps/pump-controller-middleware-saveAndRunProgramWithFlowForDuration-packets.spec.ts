
import
{
    settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, io,
    pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController,
    promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, pumpController, pumpControllerMiddleware, 
} from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;


//TODO: Fix tests
describe('pump controller - save and run program with flow for duration', function() {


    describe('#checks that the right packets are queued', function() {

        before(async()=> {
            await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config_vanilla.json'})
               
         pump.init()
        });

        beforeEach(function() {
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            settingsStub = sinon.stub(settings, 'updateExternalPumpProgram')
        })

        afterEach(function() {
            pump.init()
            sinon.restore()
        })

        after(async()=> {
            await globalAny.stopAllAsync()

        })


        // it('runs pump 1 program 1 at 15 gpm for 1 minute', function() {



        //     var index = 1
        //     var program = 1
        //     var flow = 15
        //     var duration = 1
        //     //var address = myModule('whatever').pumpIndexToAddress(index)
        //
        //     pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, flow, duration)
        //
        //
        //     /* Desired output
        //     run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
        //       [ [ 165, 0, 96, 33, 1, 4, 3, 39, 0, 15 ] ],
        //       [ [ 165, 0, 96, 33, 7, 0 ] ],
        //       [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
        //       [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
        //       [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
        //       [ [ 165, 0, 96, 33, 7, 0 ] ] ]
        //     queuePacketStub.callCount:  7
        //
        //     */
        //     // console.log('logger 1: ', loggerInfoStub.args)
        //     //  console.log('pump 1, program 1, 15 gpm, 1 minute: ', queuePacketStub.args)
        //     queuePacketStub.callCount.should.eq(7)
        //     queuePacketStub.args[0][0].should.deep.equal(globalAny.pump1RemotePacket)
        //     queuePacketStub.args[1][0].should.deep.equal(globalAny.pump1SetProgram1GPM15Packet)
        //     queuePacketStub.args[2][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
        //     queuePacketStub.args[3][0].should.deep.equal(globalAny.pump1RemotePacket)
        //
        //     queuePacketStub.args[4][0].should.deep.equal(globalAny.pump1RunProgram1Packet)
        //     queuePacketStub.args[5][0].should.deep.equal(globalAny.pump1PowerOnPacket)
        //     queuePacketStub.args[6][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
        //
        //     pumpControllerTimers.clearTimer(1)
        //     return
        //
        // });

        // it('runs pump 1 program 2 at 500 rpm for 60 minutes', function() {
        //
        //     var index = 1
        //     var program = 2
        //     var speed = 500
        //     var duration = 60
        //     //var address = myModule('whatever').pumpIndexToAddress(index)
        //
        //     pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, speed, duration)
        //
        //
        //     /* Desired output
        //     run 2:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
        //       [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
        //       [ [ 165, 0, 96, 33, 7, 0 ] ],
        //       [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
        //       [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ] ],
        //       [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
        //       [ [ 165, 0, 96, 33, 7, 0 ] ] ]
        //     queuePacketStub.callCount:  7
        //
        //     */
        //     // console.log('run 2: ', queuePacketStub.args)
        //     //console.log('logger 2: ', loggerInfoStub.args)
        //
        //     queuePacketStub.callCount.should.eq(7)
        //     queuePacketStub.args[0][0].should.deep.equal(globalAny.pump1RemotePacket)
        //     queuePacketStub.args[1][0].should.deep.equal(globalAny.pump1SetProgram2RPM500Packet)
        //     queuePacketStub.args[2][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
        //     queuePacketStub.args[3][0].should.deep.equal(globalAny.pump1RemotePacket)
        //     queuePacketStub.args[4][0].should.deep.equal(globalAny.pump1RunProgram2Packet)
        //     queuePacketStub.args[5][0].should.deep.equal(globalAny.pump1PowerOnPacket)
        //     queuePacketStub.args[6][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
        //     pumpControllerTimers.clearTimer(1)
        //     return
        //
        // });
        //
        //
        //
        // it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {
        //
        //     var index = 2
        //     var program = 4
        //     speed = 3450
        //     var duration = 120
        //     //var address = myModule('whatever').pumpIndexToAddress(index)
        //
        //     pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, speed, duration)
        //
        //
        //     /* Desired output
        //     run 2/4:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
        //     [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
        //     [ [ 165, 0, 97, 33, 7, 0 ] ],
        //     [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
        //     [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
        //     [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
        //     [ [ 165, 0, 97, 33, 7, 0 ] ] ]
        //     start timer 2/4 :  [ [ 2 ] ]
        //     queuePacketStub.callCount:  7
        //
        //     */
        //     // console.log('run 2/4: ', queuePacketStub.args)
        //
        //     queuePacketStub.callCount.should.eq(7)
        //
        //     queuePacketStub.args[0][0].should.deep.equal(globalAny.pump2RemotePacket)
        //     queuePacketStub.args[1][0].should.deep.equal(globalAny.pump2SetProgram4RPM3450Packet)
        //     queuePacketStub.args[2][0].should.deep.equal(globalAny.pump2RequestStatusPacket)
        //     queuePacketStub.args[3][0].should.deep.equal(globalAny.pump2RemotePacket)
        //     queuePacketStub.args[4][0].should.deep.equal(globalAny.pump2RunProgram4Packet)
        //     queuePacketStub.args[5][0].should.deep.equal(globalAny.pump2PowerOnPacket)
        //     queuePacketStub.args[6][0].should.deep.equal(globalAny.pump2RequestStatusPacket)
        //     pumpControllerTimers.clearTimer(2)
        //     return
        //
        // });



    })
})
