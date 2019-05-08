import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;

describe( 'processes 7 (Pump Status) packets', function ()
{
  var data = [
    Buffer.from( [ 255, 0, 255, 165, 0, 16, 96, 7, 15, 10, 0, 0, 1, 156, 7, 58, 0, 0, 0, 0, 0, 1, 9, 38, 2, 67 ] ),
    Buffer.from( [ 255, 0, 255, 165, 0, 16, 97, 7, 15, 4, 0, 0, 0, 90, 0, 30, 0, 0, 0, 0, 0, 0, 9, 40, 1, 217 ] )
  ]

  var equip = 'pump'

  describe( '#When packets arrive', function ()
  {
    context( 'via serialport or Socat', function ()
    {

      before( async function ()
      {
        await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )
      } );

      beforeEach( function ()
      {
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )

      } )

      afterEach( function ()
      {
        sinon.restore()

      } )

      after( async function ()
      {
        await globalAny.stopAllAsync()
      } )

      it( '#Pump 1 and 2 status should be logged', async function ()
      {

        /*
        json for schedule 1:  {
          "1": {
            "pump": 1,
            "name": "Pump 1",
            "type": "VS",
            "time": "9:38 AM",
            "run": 10,
            "mode": 0,
            "drivestate": 0,
            "watts": 412,
            "rpm": 1850,
            "gpm": 0,
            "ppc": 0,
            "err": 0,
            "timer": 1,
            "duration": "durationnotset",
            "currentrunning": {
              "mode": "off",
              "value": 0,
              "remainingduration": -1
            },
            "externalProgram": {
              "1": 1000,
              "2": 2500,
              "3": -1,
              "4": 3000
            },
            "remotecontrol": "remotecontrolnotset",
            "power": "powernotset",
            "friendlyName": "Pump 1"
          },
          "2": {
            "pump": 2,
            "name": "Pump 2",
            "type": "VS",
            "time": "9:40 AM",
            "run": 4,
            "mode": 0,
            "drivestate": 0,
            "watts": 90,
            "rpm": 30,
            "gpm": 0,
            "ppc": 0,
            "err": 0,
            "timer": 0,
            "duration": "durationnotset",
            "currentrunning": {
              "mode": "off",
              "value": 0,
              "remainingduration": -1
            },
            "externalProgram": {
              "1": 1010,
              "2": 2500,
              "3": 3450,
              "4": -1
            },
            "remotecontrol": "remotecontrolnotset",
            "power": "powernotset",
            "friendlyName": "Pump 2"
          }
        }

         */
        packetBuffer.push( data[ 0 ] )
        packetBuffer.push( data[ 1 ] )
        await globalAny.wait( 100 )
        let json = pump.getCurrentPumpStatus().pump
        json[ 1 ].watts.should.equal( 412 )
        json[ 1 ].rpm.should.equal( 1850 )
        json[ 1 ].run.should.equal( 10 )
        json[ 2 ].watts.should.equal( 90 )
        json[ 2 ].rpm.should.equal( 30 )
      } )
    } )
  } )
} )
