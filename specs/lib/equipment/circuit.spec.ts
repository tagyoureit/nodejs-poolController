
let customNamePackets = [
    [ 255,0,255,165,33, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 5, 3 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 1, 87, 116, 114, 70, 97, 108, 108, 32, 49, 46, 53, 4, 108 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 2, 87, 116, 114, 70, 97, 108, 108, 32, 50, 0, 251, 5, 6 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 5, 8 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 72, 105, 103, 104, 0, 251, 5, 52 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 5, 80, 111, 111, 108, 32, 76, 116, 68, 101, 101, 112, 4, 248 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 6, 80, 111, 111, 108, 32, 76, 116, 83, 104, 108, 119, 5, 25 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 7, 85, 83, 69, 82, 78, 65, 77, 69, 45, 48, 56, 3, 247 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 8, 85, 83, 69, 82, 78, 65, 77, 69, 45, 48, 57, 3, 249 ],
    [ 255,0,255,165,33, 15, 16, 10, 12, 9, 85, 83, 69, 82, 78, 65, 77, 69, 45, 49, 48, 3, 242 ]
]

let circPackets = [
    [ 255,0,255,165,33, 15, 16, 11, 5, 1, 1, 72, 0, 0, 1, 63 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 2, 16, 205, 0, 0, 1, 212 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 3, 0, 2, 0, 0, 0, 250 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 4, 5, 22, 0, 0, 1, 20 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 5, 64, 201, 0, 0, 2, 3 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 6, 66, 61, 0, 0, 1, 122 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 7, 16, 74, 0, 0, 1, 86 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 8, 16, 206, 0, 0, 1, 219 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 9, 7, 55, 0, 0, 1, 60 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 10, 0, 0, 0, 0, 0, 255 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 11, 14, 79, 0, 0, 1, 93 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 12, 0, 200, 0, 0, 1, 201 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 13, 0, 202, 0, 0, 1, 204 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 14, 0, 203, 0, 0, 1, 206 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 15, 0, 204, 0, 0, 1, 208 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 16, 0, 46, 0, 0, 1, 51 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 17, 14, 53, 0, 0, 1, 73 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 18, 14, 101, 0, 0, 1, 122 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 19, 0, 0, 0, 0, 1, 8 ],
    [ 255,0,255,165,33, 15, 16, 11, 5, 20, 0, 93, 0, 0, 1, 102 ]
]




import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, pumpConfig } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub
let controllerConfigNeededStub: sinon.SinonStub;
describe( 'circuit controller', function ()
{

    describe( '#sets the friendlyNames', function ()
    {

        var equip = 'controller'
        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/configFriendlyNames.json' } )

        } );

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'spy', 'stub' )
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked9!' }
            updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
            controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )
        } )

        afterEach( function ()
        {
            //restore the sinon after each function
            sinon.restore()


        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )
        
        it( 'reads incoming custom names', async function ()
        {
            customNamePackets.forEach( ( packet ) =>
            {
                packetBuffer.push( new Buffer( packet ) )
            } )
            await globalAny.wait( 500 )
            customNames.getCustomName(0).should.eq('WtrFall 1')
            customNames.getCustomName(5).should.eq('Pool LtDeep')            
        } )

        it( 'reads incoming circuit packets', async function ()
        {
            circPackets.forEach( ( packet ) =>
            {
                packetBuffer.push( new Buffer( packet ) )
            } )
            await globalAny.wait( 500 )
            let circuits = circuit.getCurrentCircuits().circuit
            circuits[ 1 ].friendlyName.should.eq( 'SPA' )
            circuits[ 20 ].name.should.eq( 'AUX EXTRA' )
            
        } )

    } )



} )
