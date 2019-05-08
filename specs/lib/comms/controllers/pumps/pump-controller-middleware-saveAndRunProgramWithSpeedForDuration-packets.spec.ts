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
let updateAvailStub: sinon.SinonStub;

describe('pump controller - save and run program with speed for duration', function() {


    describe('#checks that the right packets are queued', function() {

        before(async()=> {
            await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config.pump.VS.json'})
        });

        beforeEach(function() {
           globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked8!' }
            let updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            settingsStub = sinon.stub(settings, 'updateExternalPumpProgram')
        })

        afterEach(function() {
            sinon.restore()

        })

        after(async()=> {
            await globalAny.stopAllAsync()
        })

        it('runs pump 1 program 1 at 1000 rpm for 1 minute', function() {
            let index = <Pump.PumpIndex> 1
            let program = 1
            let speed = 1000
            let duration = 1
            //let address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],

              [ [ 165, 0, 96, 33, 7, 0 ] ],
              ]
            queuePacketStub.callCount:  3

            */
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal(globalAny.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(globalAny.pump1SetProgram1RPM1000Packet)
            queuePacketStub.args[2][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
            pumpControllerTimers.clearTimer(1)

        });

        it('runs pump 1 program 2 at 500 rpm for 60 minutes', function() {
            let index = <Pump.PumpIndex>1
            let program = 2
            let speed = 500
            let duration = 60
            //let address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 2:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              ]
            queuePacketStub.callCount:  3

            */
            // console.log('run 2: ', queuePacketStub.args)
            //console.log('logger 2: ', loggerInfoStub.args)

            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal(globalAny.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(globalAny.pump1SetProgram2RPM500Packet)
            queuePacketStub.args[2][0].should.deep.equal(globalAny.pump1RequestStatusPacket)
            pumpControllerTimers.clearTimer(1)

        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {

            let index = <Pump.PumpIndex>2
            let program = 4
            let speed = 3450
            let duration = 120
            //let address = myModule('whatever').pumpIndexToAddress(index)

            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration(index, program, speed, duration)


            /* Desired output
            run 2/4:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
            [ [ 165, 0, 97, 33, 7, 0 ] ],]
            start timer 2/4 :  [ [ 2 ] ]
            queuePacketStub.callCount:  3

            */
            // console.log('run 2/4: ', queuePacketStub.args)

            queuePacketStub.callCount.should.eq(3)

            queuePacketStub.args[0][0].should.deep.equal(globalAny.pump2RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(globalAny.pump2SetProgram4RPM3450Packet)
            queuePacketStub.args[2][0].should.deep.equal(globalAny.pump2RequestStatusPacket)
            pumpControllerTimers.clearTimer(2)

        });



    })
})
