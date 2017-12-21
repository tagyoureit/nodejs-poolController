describe('processes 32_33 (Spa Side Remotes) packets', function() {
    var data = [

        Buffer.from([255, 0, 255, 165, 33, 15, 16, 32, 11, 1, 8, 2, 7, 7, 5, 8, 9, 8, 9, 3, 1, 83]),
        Buffer.from([255, 0, 255, 165, 33, 15, 16, 32, 11, 0, 1, 5, 18, 13, 5, 6, 7, 8, 9, 10, 1, 98]),
        Buffer.from([255, 0, 255, 165, 33, 15, 16, 33, 4, 12, 7, 14, 5, 1, 48])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAllAsync()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                loggers = setupLoggerStubOrSpy(sandbox, 'stub', 'spy')

                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')
                writeNETPacketStub = sandbox.stub(bottle.container.sp, 'writeNET')
                controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')

            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#Spa side remote is4/is10/Quicktouch', function() {
                global.customNames_chk.forEach(function(el) {
                    bottle.container.packetBuffer.push(el)
                })
                global.circuits_chk.forEach(function(el) {
                    bottle.container.packetBuffer.push(el)
                })
                data.forEach(function(el) {
                    bottle.container.packetBuffer.push(el)
                })


                //
                // bottle.container.packetBuffer.push(data[1])
                //                 bottle.container.packetBuffer.push(data[2])
                //                   bottle.container.packetBuffer.push(data[3])
                clock.tick(1000)
                //var json = bottle.container.schedule.getCurrentSchedule()
                //console.log('json for schedule 1: ', JSON.stringify(json,null,2))

                JSON.parse(loggers.loggerDebugStub.args[loggers.loggerDebugStub.args.length-1][2]).is4.button1.should.equal("SPA")
                JSON.parse(loggers.loggerDebugStub.args[loggers.loggerDebugStub.args.length-1][2]).is10.button1.should.equal("POOL LIGHT")
                JSON.parse(loggers.loggerDebugStub.args[loggers.loggerDebugStub.args.length-1][2]).quicktouch.button2.should.equal("SPA LIGHT")
            })


        })
    })
})
