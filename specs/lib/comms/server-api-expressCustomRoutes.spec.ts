import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;


describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(async()=> {
                await globalAny.initAllAsync()
            })

            beforeEach(function() {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
            })

            afterEach(function() {
                // sinon.restore()
            })

            after(async()=> {
                await globalAny.stopAllAsync()
            })

            it('Requests a custom express route', async()=> {
                let res: {runtime: string} = await globalAny.requestPoolDataWithURLAsync('api/myruntimeroute')
                    res.runtime.should.equal('route')
            });

        });

    });
});
