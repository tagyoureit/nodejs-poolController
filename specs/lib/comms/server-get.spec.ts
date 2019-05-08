import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
import * as fs from 'fs'

let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked11!' }

describe('server', function() {
    describe('#get functions', function() {

        context('with a URL', function() {

            before(async ()=> {
                await globalAny.initAllAsync()
            })

            beforeEach(function() {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
                //clock = sinon.useFakeTimers()

            })

            afterEach(function() {
                sinon.restore()
            })

            after(async() => {

                await globalAny.stopAllAsync()
            })

            // it('reloads the config.json', async function () {
            //
            //     let obj: any = await globalAny.requestPoolDataWithURLAsync('reload')
            //         console.log('obj: ', obj)
            //         obj.should.contain('Reloading')
            //         done()
            //     })
            // });

            it('returns pump status in a JSON', async function () {
                let fakeRet = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'pumpstatus.json'),'UTF-8'))
                let pumpStub = sinon.stub(pump, 'getCurrentPumpStatus').callsFake(() =>{
                    return fakeRet
                })

                let obj: any = await globalAny.requestPoolDataWithURLAsync('pump')
                    //console.log('valuePumpObj:', obj)
                    //console.log('????')
                    //console.log('pumpStub called x times: ', pumpStub.callCount)
                    pumpStub.callCount.should.eq(1)
                    obj[1].watts.should.eq(999);

            });


            it('returns everything in a JSON (/all)', async ()=> {
                updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve(fakeObj))
                let allStub = sinon.stub(helpers, 'allEquipmentInOneJSON').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json'),'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('all')
                    obj.circuits[1].friendlyName.should.eq('SPA')


            });


            it('returns everything in a JSON (/one)', async()=> {
                updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve(fakeObj))

                let allStub = sinon.stub(helpers, 'allEquipmentInOneJSON').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json'), 'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('one')
                    obj.circuits[1].friendlyName.should.eq('SPA')
           

            });

            it('returns circuits in a JSON', async() => {
                let circuitStub = sinon.stub(circuit, 'getCurrentCircuits').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit.json'), 'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('circuit')
                    circuitStub.callCount.should.eq(1)
                    obj[1].number.should.eq(1)
            });
            it('returns heat in a JSON', async function () {
                let heatStub = sinon.stub(heat, 'getCurrentHeat').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'heat.json'), 'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('temperature')
                    heatStub.callCount.should.eq(1)
                    obj.temperature.should.have.property('poolHeatMode');;

            });
            it('returns schedule in a JSON', async function () {
                let scheduleStub = sinon.stub(schedule, 'getCurrentSchedule').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'schedule.json'), 'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('schedule')
                    scheduleStub.callCount.should.eq(1)
                    obj[1].should.have.property('DURATION');

            });

            it('returns time in a JSON', async function () {
                let timeStub = sinon.stub(time, 'getTime').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'time.json'),'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('time')
                    timeStub.callCount.should.eq(1)
                    obj.should.have.property('controllerTime');;
            });
            it('returns chlorinator in a JSON', async function () {
                let chlorStub = sinon.stub(chlorinator, 'getChlorinatorStatus').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'chlorinator.json'),'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('chlorinator')
                    chlorStub.callCount.should.eq(1)
                    obj.should.have.property('saltPPM');;
            });
            it('returns circuit (9) in a JSON', async function () {
                let circuit9Stub = sinon.stub(circuit, 'getCircuit').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit9.json'),'UTF-8'))
                })
                let obj: any = await globalAny.requestPoolDataWithURLAsync('circuit/9')
                    circuit9Stub.callCount.should.eq(1)
                    obj.should.have.property('status');
            });
            it('fails with circuit /circuit/21', async function () {
                let obj: any = await globalAny.requestPoolDataWithURLAsync('circuit/21')
                    obj.should.eq('Not a valid circuit')
            });
        });

    });
});
