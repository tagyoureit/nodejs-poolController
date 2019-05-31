import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, pumpConfig } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub

let customNameAndCircuitPackets = [
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 5, 3 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 1, 87, 116, 114, 70, 97, 108, 108, 32, 49, 46, 53, 4, 108 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 2, 87, 116, 114, 70, 97, 108, 108, 32, 50, 0, 251, 5, 6 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 5, 8 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 72, 105, 103, 104, 0, 251, 5, 52 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 5, 80, 111, 111, 108, 32, 76, 116, 68, 101, 101, 112, 4, 248 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 6, 80, 111, 111, 108, 32, 76, 116, 83, 104, 108, 119, 5, 25 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 7, 85, 83, 69, 82, 78, 65, 77, 69, 45, 48, 56, 3, 247 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 8, 85, 83, 69, 82, 78, 65, 77, 69, 45, 48, 57, 3, 249 ],
    [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 9, 85, 83, 69, 82, 78, 65, 77, 69, 45, 49, 48, 3, 242 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 1, 1, 72, 0, 0, 1, 63 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 2, 16, 205, 0, 0, 1, 212 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 3, 0, 2, 0, 0, 0, 250 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 4, 5, 22, 0, 0, 1, 20 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 5, 64, 201, 0, 0, 2, 3 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 6, 66, 61, 0, 0, 1, 122 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 7, 16, 74, 0, 0, 1, 86 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 8, 16, 206, 0, 0, 1, 219 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 9, 7, 55, 0, 0, 1, 60 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 10, 0, 0, 0, 0, 0, 255 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 11, 14, 79, 0, 0, 1, 93 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 12, 0, 200, 0, 0, 1, 201 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 13, 0, 202, 0, 0, 1, 204 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 14, 0, 203, 0, 0, 1, 206 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 15, 0, 204, 0, 0, 1, 208 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 16, 0, 46, 0, 0, 1, 51 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 17, 14, 53, 0, 0, 1, 73 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 18, 14, 101, 0, 0, 1, 122 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 19, 0, 0, 0, 0, 1, 8 ],
    [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 20, 0, 93, 0, 0, 1, 102 ]
]

const resubmit = async ( qP: number[] ) =>
{
    packetBuffer.push( new Buffer( qP ) )
    await globalAny.wait( 100 )
    queuePacket.init()
}

describe( 'pump configuration tests', function ()
{
    before( async function ()
    {
        await globalAny.initAllAsync()
        controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
    } );

    beforeEach( function ()
    {
        queuePacket.init()
    } )

    afterEach( function ()
    {
    } )

    after( async function ()
    {
        sinon.restore()
        await globalAny.stopAllAsync()
    } )

    it( 'initializes a pump config as None', async function ()
    {
        customNameAndCircuitPackets.forEach( ( packet ) =>
        {
            packetBuffer.push( new Buffer( packet ) )
        } )
        let pump1Pkt = [ 255, 0, 255, 165, 33, 16, 34, 155, 46, 1, 128, 0, 2, 0, 16, 12, 6, 4, 1, 9, 4, 11, 11, 3, 128, 8, 0, 2, 18, 2, 3, 128, 226, 196, 184, 232, 152, 188, 238, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 34 ]
        let pump2Pkt = [ 255, 0, 255, 165, 33, 16, 34, 155, 46, 2, 0, 15, 2, 0, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 30, 55, 5, 10, 60, 5, 1, 50, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 166 ]
        packetBuffer.push( new Buffer( pump1Pkt ) )
        packetBuffer.push( new Buffer( pump2Pkt ) )
        await globalAny.wait( 550 )
        let _pumpConfig: Pump.ExtendedConfigObj = pumpConfig.getExtendedPumpConfig()
        _pumpConfig[ 1 ].type.should.eq( 'VS' )
        _pumpConfig[ 1 ].circuitSlot[ 1 ].friendlyName.should.eq( 'JETS' )
        _pumpConfig[ 1 ].circuitSlot[ 1 ].rpm.should.eq( 3200 )
        _pumpConfig[ 2 ].type.should.eq( 'NONE' )
      

    } )

    it( 'changes pump 2 to a VS pump', async function ()
    {

        pumpConfig.setTypeViaAPI( 2, 'VS' )
        await globalAny.wait( 50 )
        let qP = queuePacket.entireQueue()[0]
        // 17:23:16.000 info: Msg# 84   Set Pump/Circuit/Speed Extended Config: 165,33,16,33,155,46,2,128,0,2,0,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,3,232,232,232,232,232,232,232,232,232,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,135
        qP.should.deep.eq( [ 255, 0, 255, 165,33,16,33,155,46,2,128,0,2,0,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,3,232,232,232,232,232,232,232,232,232,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,135 ] )
        await resubmit( qP )
        await globalAny.wait(100)
        let _pC:Pump.ExtendedConfigObj = pumpConfig.getExtendedPumpConfig()
        _pC[ 2 ].circuitSlot[ 8 ].rpm.should.eq( 1000 )
        _pC[ 2 ].prime.primingMinutes.should.eq( 0 )
        _pC[ 2 ].prime.rpm.should.eq( 1000 )
    } )

    it( 'sets pump 2 circuit and speed for a VS pump', async () =>
    {
        pumpConfig.setTypeViaAPI( 2, 'VS' )
        await globalAny.wait( 50 )
        queuePacket.init()
        pumpConfig.setCircuitViaAPI( 2, 1, 1 )
        // resubmit to get changes
        await resubmit( queuePacket.entireQueue()[ 0 ] )
        pumpConfig.setCircuitViaAPI( 2, 2, 5 )
        await resubmit( queuePacket.entireQueue()[0] )
        pumpConfig.setCircuitViaAPI( 2, 3, 4 )
        await resubmit( queuePacket.entireQueue()[0] )
        pumpConfig.setSpeedViaAPI( 2, 1, 1000 )
        await resubmit( queuePacket.entireQueue()[0] )
        pumpConfig.setSpeedViaAPI( 2, 2, 2020 )
        await resubmit( queuePacket.entireQueue()[0] )
        pumpConfig.setSpeedViaAPI( 2, 3, 3400 )
        // don't use resubmit here because we don't want to clear the queue automatically
        // wait for the api to process
        await globalAny.wait( 100 )
        // get the queue
        let qP = queuePacket.entireQueue()[ 0 ]
        // send the packet that we just created
        packetBuffer.push( new Buffer( qP ) )
        // wait again
        await globalAny.wait( 100 )
                
        // message below from SL (address 34) --> change to 33 for this app testing
        // 08:22:45.000 debug: Msg# 180  Incoming controller packet: 165, 33, 16, 34, 155, 46, 2, 128, 0, 2, 0, 1, 3, 5, 7, 4, 13, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 3, 232, 228, 72, 232, 232, 232, 232, 232, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 252
        
        qP.should.deep.eq( [ 255, 0, 255, 165, 33, 16, 33, 155, 46, 2, 128, 0, 2, 0, 1, 3, 5, 7, 4, 13, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 3, 232, 228, 72, 232, 232, 232, 232, 232, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 251 ] )
        await resubmit( queuePacket.entireQueue()[0] )
    } )

    it( 'changes pump 2 to a VF pump', async function ()
    {

        pumpConfig.setTypeViaAPI( 2, 'VF' )
        await globalAny.wait( 50 )
        let qP = queuePacket.entireQueue()[ 0 ]
        // from SL (address 34) --> change to 33 for testing
        // 17:21:43.000 info: Msg# 315   Set Pump/Circuit/Speed Extended Config: 165,33,16,34,155,46,2,6,15,2,0,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,30,30,55,5,10,60,5,1,50,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,172
        qP.should.deep.eq( [ 255, 0, 255, 165,33,16,33,155,46,2,6,15,2,0,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,30,30,55,5,10,60,5,1,50,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,171 ] )
        await resubmit( qP )
        await globalAny.wait(100)
        let _pC:Pump.ExtendedConfigObj = pumpConfig.getExtendedPumpConfig()
        _pC[ 2 ].type.should.eq( 'VF' )
        _pC[ 2 ].circuitSlot[ 8 ].gpm.should.eq( 30 )
        _pC[ 2 ].filtering.filter.poolSize.should.eq( 15000 )
        _pC[ 2 ].filtering.backwash.flow.should.eq( 60 )
    } )

    it( 'changes pump 2 to a VSF pump', async function ()
    {

        pumpConfig.setTypeViaAPI( 2, 'VSF' )
        await globalAny.wait( 50 )
        let qP = queuePacket.entireQueue()[ 0 ]
        // from SL (address 34) --> change to 33 for testing
        // 19:41:49.000 info: Msg# 219   Set Pump/Circuit/Speed Extended Config: 165,33,16,34,155,46,2,64,0,0,0,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,255,255,255,0,0,0,0,0,0,0,10,235
        qP.should.deep.eq( [ 255, 0, 255, 165,33,16,33,155,46,2,64,0,0,0,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,30,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,255,255,255,0,0,0,0,0,0,0,10,234 ] )
        await resubmit( qP )
        await globalAny.wait(100)
        let _pC:Pump.ExtendedConfigObj = pumpConfig.getExtendedPumpConfig()
        _pC[ 2 ].type.should.eq( 'VSF' )
        _pC[ 2 ].circuitSlot[ 8 ].gpm.should.eq( 30 )
    } )


    it( 'sets parameters via API on the VSF', async function ()
    {
        await globalAny.requestPoolDataWithURLAsync( 'pumpConfig/pump/2/circuitSlot/1/speed/2000' )
        // await globalAny.wait(200)
        await resubmit( queuePacket.entireQueue()[ 0 ] )


        await globalAny.requestPoolDataWithURLAsync('pumpConfig/pump/2/circuitSlot/1/circuit/1')
        // await globalAny.wait(200)
        await resubmit( queuePacket.entireQueue()[ 0 ] )

        let _pC:Pump.ExtendedConfigObj = pumpConfig.getExtendedPumpConfig()
        _pC[ 2 ].circuitSlot[ 1 ].rpm.should.eq( 2000 )
        _pC[ 2 ].circuitSlot[ 1 ].number.should.eq( 1 )
        
        
        await globalAny.requestPoolDataWithURLAsync('pumpConfig/pump/2/circuitSlot/1/speedType/gpm')
        // await globalAny.wait(200)
        await resubmit( queuePacket.entireQueue()[ 0 ] )
        
        _pC = pumpConfig.getExtendedPumpConfig()
        _pC[ 2 ].circuitSlot[ 1 ].gpm.should.eq( 30 )
    })

        


} )
