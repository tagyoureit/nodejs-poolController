import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;

describe( 'processes 10 (Custom Names) packets', function ()
{
  var data = [
    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 2, 77, 65, 88, 0, 0, 0, 218, 222, 114, 229, 251, 5, 237 ] ),
    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 1, 67, 76, 32, 66, 79, 79, 83, 84, 0, 229, 251, 5, 18 ] ),
    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 5, 8 ] ),
    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 10, 12, 9, 85, 83, 69, 82, 78, 65, 77, 69, 45, 49, 48, 3, 242 ] )
  ]

  /*

  10:48:53.365 SILLY Msg# 12  Custom Circuit Name Raw:  [67,76,32,66,79,79,83,84,0,229,251]  & Decoded: CL BOOST
                                                        165,33,15,16,10,12,1,67,76,32,66,79,79,83,84,0,229,251,5,18
  10:48:53.189 SILLY Msg# 11  Custom Circuit Name Raw:  [77,65,88,0,0,0,218,222,114,229,251]  & Decoded: MAX
                                                        165,33,15,16,10,12,2,77,65,88,0,0,0,218,222,114,229,251,5,237

  08:02:35.821 SILLY Msg# 15  TYPE controller,  packet 165,33,15,16,10,12,3,87,116,114,70,97,108,108,32,51,0,251,5,8
  08:02:35.823 SILLY Msg# 15  Custom Circuit Name Raw:  [87,116,114,70,97,108,108,32,51,0,251]  & Decoded: WtrFall 3
  08:02:37.594 SILLY Msg# 22  TYPE controller,  packet 165,33,15,16,10,12,9,85,83,69,82,78,65,77,69,45,49,48,3,242
  08:02:37.596 SILLY Msg# 22  Custom Circuit Name Raw:  [85,83,69,82,78,65,77,69,45,49,48]  & Decoded: USERNAME-10
  08:02:37.598 INFO
  Custom Circuit Names retrieved from configuration:
[null, "CL BOOST","MAX","WtrFall 3",null,null,null,null,null,"USERNAME-10"]

   */

  var equip = 'controller'

  describe( '#When Custom Name packets arrive', function ()
  {
    context( 'via serialport or Socat', function ()
    {

      before( async function ()
      {
        await globalAny.initAllAsync()

      } );

      beforeEach( function ()
      {
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )

      } )

      afterEach( function ()
      {
        sinon.restore()

      } )

      after( async function ()
      {
        await globalAny.stopAllAsync()
      } )

      it( '#Custom Names should be parsed correctly', async function ()
      {
        packetBuffer.push( data[ 0 ] )
        packetBuffer.push( data[ 1 ] )
        packetBuffer.push( data[ 2 ] )
        packetBuffer.push( data[ 3 ] )
        await globalAny.wait( 50 )
        customNames.getCustomName( 1 ).should.eq( 'CL BOOST' )
        customNames.getCustomName( 2 ).should.eq( 'MAX' )
        customNames.getCustomName( 3 ).should.eq( 'WtrFall 3' )
        customNames.getCustomName( 9 ).should.eq( 'USERNAME-10' )
      } )
    } )
  } )
} )