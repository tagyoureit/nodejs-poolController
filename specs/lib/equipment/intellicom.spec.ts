import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;


describe( 'processes Intellitouch packets', function ()
{
    describe('#when requested', function() {

        before(async function () {

                    await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config_intellitouch.json'})

        })

        beforeEach(function() {
            let loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
            let clock = sinon.useFakeTimers()

            settings.set('intellitouch.installed', 0)
            settings.set('intellicom.installed', 1)
        })

        afterEach(function() {
            sinon.restore()

        })

        after(async function () {

                    await globalAny.stopAllAsync()

        })


        it('#should request checkIfNeedControllerConfiguration before preamble is set', function() {
            intellitouch.getPreambleByte().should.equal(-1)
            intellitouch.checkIfNeedControllerConfiguration().should.equal(0)
        })



        it('#will not get configuration with Easytouch installed', function(){
            intellitouch.init()

            intellitouch.checkIfNeedControllerConfiguration().should.equal(0)
        })
    })
})
