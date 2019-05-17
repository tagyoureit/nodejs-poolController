import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
let checkIfNeedControllerConfigurationStub: sinon.SinonStub

let circuits_no_buf = [
    [255,0,255,165,33,15,16,11,5,1,1,72,0,0,1,63],
    [255,0,255,165,33,15,16,11,5,2,0,46,0,0,1,37],
    [255,0,255,165,33,15,16,11,5,3,0,2,0,0,0,250],
    [255,0,255,165,33,15,16,11,5,4,5,22,0,0,1,20],
    [255,0,255,165,33,15,16,11,5,5,64,201,0,0,2,3],
    [255,0,255,165,33,15,16,11,5,6,66,61,0,0,1,122],
    [255,0,255,165,33,15,16,11,5,7,16,74,0,0,1,86],
    [255,0,255,165,33,15,16,11,5,8,16,63,0,0,1,76],
    [255,0,255,165,33,15,16,11,5,9,16,55,0,0,1,69],
    [255,0,255,165,33,15,16,11,5,10,0,0,0,0,0,255],
    [255,0,255,165,33,15,16,11,5,11,14,79,0,0,1,93],
    [255,0,255,165,33,15,16,11,5,12,0,200,0,0,1,201],
    [255,0,255,165,33,15,16,11,5,13,0,202,0,0,1,204],
    [255,0,255,165,33,15,16,11,5,14,0,203,0,0,1,206],
    [255,0,255,165,33,15,16,11,5,15,0,204,0,0,1,208],
    [255,0,255,165,33,15,16,11,5,16,14,53,0,0,1,72],
    [255,0,255,165,33,15,16,11,5,17,14,53,0,0,1,73],
    [255,0,255,165,33,15,16,11,5,18,14,53,0,0,1,74],
    [255,0,255,165,33,15,16,11,5,19,0,0,0,0,1,8],
    [255,0,255,165,33,15,16,11,5,20,0,93,0,0,1,102] //circuit 20
  ]

describe( 'server', function ()
{
    describe( '#schedule api calls', function ()
    {
        context( 'with a URL', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )
    
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' ).returns(0)
                // setup circuits
                circuits_no_buf.forEach( function ( el: number[] )
                {
                    console.log(`pushing ${el}`)
                    packetBuffer.push( Buffer.from(el)  )
                } )
                await globalAny.wait( 1000 )
                globalAny.schedules_chk.forEach( function ( el: number[] )
                {
                    packetBuffer.push(  Buffer.from(el) ) 
                } )
                await globalAny.wait( 550 )

            } )

            beforeEach( async function ()
            {
                sp.mockSPFlush()

            } )


            afterEach( function ()
            {

                writePacket.init()
                queuePacket.init()
            } )
            
            after( async function ()
            {
                
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            it( 'send a packet to toggle schedule 1 day Sunday', async function ()
            {
                this.timeout(6000)
                await globalAny.requestPoolDataWithURLAsync( 'schedule/toggle/id/1/day/1' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 9, 20, 15, 59, 254, 2, 251 ] )
            } );

            it( 'send a packet to delete schedule 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/delete/id/1' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 0, 0, 0, 0, 0, 0, 1, 144 ] )

            } );

            it( 'send a packet to start schedule 1 at 11:11am', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/startOrEnd/start/hour/11/min/11' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 11, 11, 15, 59, 255, 2, 245 ] )
            } );

            it( 'send a packet to end schedule 1 at 12:12am', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/startOrEnd/end/hour/12/min/12' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 9, 20, 12, 12, 255, 2, 202 ] )
            } );

            it( 'send a packet to set schedule 1 to circuit 15', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/circuit/15' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 15, 9, 20, 15, 59, 255, 3, 5 ] )
            } );

            it( 'send a packet to set egg timer 9 to circuit 10, 3 hr 45 min', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'eggtimer/set/id/9/circuit/10/hour/3/min/45' )
                sp.getLastWriteMockSP().should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 9, 10, 25, 0, 3, 45, 0, 1, 235 ] )
            } );

        } );

    } );
} )