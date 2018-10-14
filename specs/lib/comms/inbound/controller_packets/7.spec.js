describe('processes 7 (Pump Status) packets', function() {
    var data = [
        Buffer.from([255, 0, 255, 165,0,16,96,7,15,10,0,0,1,156,7,58,0,0,0,0,0,1,9,38,2,67]),
        Buffer.from([255, 0, 255, 165,0,16,97,7,15, 4,0,0,0,90,0,30,0,0,0,0,0,0,9,40,1,217])
    ]

    var equip = 'pump'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')

                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                circuitNameStub = sinon.stub(bottle.container.circuit, 'getCircuitName').returns("POOL")
            })

            afterEach(function() {
                sinon.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#Pump 1 and 2 status should be logged', function() {
                return Promise.resolve()
                    .then(function() {
                        bottle.container.packetBuffer.push(data[0])
                        bottle.container.packetBuffer.push(data[1])
                    })
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
                    .delay(200)
                    .then(function() {
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for schedule 1: ', JSON.stringify(json,null,2))
                        json[1].watts.should.equal(412)
                        json[1].rpm.should.equal(1850)
                        json[1].run.should.equal(10)
                        json[2].watts.should.equal(90)
                        json[2].rpm.should.equal(30)
                    })
            })


        })
    })
})
