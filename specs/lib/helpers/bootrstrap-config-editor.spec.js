var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)
//var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/bootstrap-config-editor.js'))

describe('updates/resets bootstrap configClient.json', function() {
    context('when called with the internal function', function() {
        describe('#updates panelState', function() {

            before(function() {
                bottle.container.logger.transports.console.level = 'silly';

            })

            beforeEach(function() {
                return Promise.resolve()
                    .then(function(){
                        sandbox = sinon.sandbox.create()
                        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                        loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                        var origFile = '/specs/assets/config/configClient.json'
                        var copyFile = '/specs/assets/config/_configClient.json'
                        return fs.readFileAsync(path.join(process.cwd(), origFile))
                            .then(function(orig) {
                                return fs.writeFileAsync(path.join(process.cwd(), copyFile), orig)
                            })
                            .then(function() {
                                return fs.readFileAsync(path.join(process.cwd(), copyFile), 'utf-8')
                            })
                            // .then(function(copy) {
                            //     console.log('just copied _configClient', copy)
                            // })
                            .then(function(){
                                bottle.container.bootstrapConfigEditor.init(copyFile)
                            })
                            .catch(function(err) {
                                /* istanbul ignore next */
                                console.log('oops, we hit an error', err)
                            })
                    })

            })

            afterEach(function() {
                sandbox.restore()
                return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'))
                    .then(bottle.container.bootstrapConfigEditor.init)
                // .then(function() {
                //     console.log('file removed')
                // })
            })

            after(function() {
                bottle.container.logger.transports.console.level = 'info';

            })

            it('changes system state from visible to hidden', function(done) {
                // myModule.__with__({
                //     'dir': '/specs/assets/config',
                //     'file': '_configClient.json'
                //
                // })(function() {
                //     myModule(bottle.container).update('panelState', 'system', 'state', 'hidden')
                //     setTimeout(function() {
                //         //need delay to allow for file to write to disk
                //         return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                //             .then(function(changed) {
                //                 changed = JSON.parse(changed)
                //                 changed.panelState.system.state.should.eq('hidden')
                //                 done()
                //             })
                //
                //     }, 150)
                //
                // })

                bottle.container.bootstrapConfigEditor.init('/specs/assets/config/_configClient.json')
                    .then(function(){
                        return bottle.container.bootstrapConfigEditor.update('panelState', 'system', 'state', 'hidden')
                    })
                    .then(function(){
                        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                    })
                    .then(function(changed) {
                        changed = JSON.parse(changed)
                        changed.panelState.system.state.should.eq('hidden')
                    })
                    .then(done,done)



            });


            it('changes hideAUX state from visible (false) to hidden (true)', function(done) {
                // myModule.__with__({
                //     'dir': '/specs/assets/config',
                //     'file': '_configClient.json'
                //
                // })(function() {
                //     myModule(bottle.container).update('generalParams', 'hideAUX', null, true)
                //     setTimeout(function() {
                //         return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                //             .then(function(changed) {
                //                 changed = JSON.parse(changed)
                //                 changed.generalParams.hideAUX.should.eq(true)
                //                 done()
                //             })
                //
                //     }, 150)
                // })


                //---
                bottle.container.bootstrapConfigEditor.init('/specs/assets/config/_configClient.json')
                    .then(function(){
                        return bottle.container.bootstrapConfigEditor.update('generalParams', 'hideAUX', null, true)
                    })
                    .then(function(){
                        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                    })
                    .then(function(changed) {
                        changed = JSON.parse(changed)
                        changed.generalParams.hideAUX.should.eq(true)
                        return
                    })
                    .then(done,done)


                //---

            });

            it('receives a property it cannot find (should fail)', function(done) {
                // myModule.__with__({
                //     'dir': '/specs/assets/config',
                //     'file': '_configClient.json'
                //
                // })(function() {
                //     myModule(bottle.container).update('not', 'here', null, true)
                //     setTimeout(function() {
                //
                //         var original = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/configClient.json'), 'utf-8')
                //         var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                //         changed.should.eq(original)
                //         loggerWarnStub.callCount.should.eq(1)
                //         done()
                //
                //     }, 150)
                //
                // })

                bottle.container.bootstrapConfigEditor.init('/specs/assets/config/_configClient.json')
                    .then(function(){
                        return bottle.container.bootstrapConfigEditor.update('not', 'here', null, true)
                    })
                    .then(function() {
                        var original = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/configClient.json'), 'utf-8')
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                        // these are both returned as strings (not parsed) so we can directly compare them
                        changed.should.eq(original)
                    })
                    .then(done,done)

            });


            it('resets all panelStates to visible', function(done) {
                // myModule.__with__({
                //     'dir': '/specs/assets/config',
                //     'file': '_configClient.json'
                //
                // })(function() {
                //     myModule(bottle.container).reset()
                //     setTimeout(function() {
                //         var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                //         changed = JSON.parse(changed)
                //         for (var key in changed.panelState) {
                //             changed.panelState[key].state.should.eq("visible")
                //         }
                //         done()
                //     }, 150)
                //
                // })

                bottle.container.bootstrapConfigEditor.init('/specs/assets/config/_configClient.json')
                    .then(function(){
                        return bottle.container.bootstrapConfigEditor.reset()
                    })
                    .then(function() {
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                        changed = JSON.parse(changed)
                        for (var key in changed.panelState) {
                            changed.panelState[key].state.should.eq("visible")
                        }
                    })
                    .then(done,done)


            });

        })
    })
    context('when called with the Socket API', function() {
        describe('#updates panelState', function() {

            before(function() {
                bottle.container.logger.transports.console.level = 'silly';

                bottle.container.server.init()
                bottle.container.io.init()
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.spy(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.spy(bottle.container.logger, 'silly')
                bceStub = sandbox.stub(bottle.container.bootstrapConfigEditor, 'update')
                return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/configClient.json'))
                    .then(function(orig) {
                        return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), orig)
                    })
                    .then(function() {
                        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                    })
                    // .then(function(copy) {
                    //     console.log('just copied _configClient', copy)
                    // })
                    .catch(function(err) {
                        /* istanbul ignore next */
                        console.log('oops, we hit an error', err)
                    })

            })

            afterEach(function() {
                sandbox.restore()
                return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'))
                // .then(function() {
                //     console.log('file removed')
                // })
            })

            after(function() {
                bottle.container.server.close()
                bottle.container.logger.transports.console.level = 'info';

            })

            it('changes system state from visible to hidden', function(done) {
                /* NOTE: best we can do here is make sure the function is called...
                  no good way I know of to rewire the internal variables if not calling the function directly.
                  So long as we test the function above, this should be sufficient.
                  */
                Promise.resolve()
                    .then(function(){
                        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('connect', function(data) {
                            // console.log('connected client:')
                            client.emit('setConfigClient', 'panelState', 'system', 'state', 'hidden')
                            client.disconnect()

                        })
                    })
                    .delay(100)
                    .then( function() {
                        bceStub.callCount.should.eq(1)
                        bceStub.args[0].should.contain.members(['panelState', 'system', 'state', 'hidden'])

                    })
                    .then(done,done)

            });


            it('changes hideAUX state from visible (false) to hidden (true)', function(done) {

                Promise.resolve()
                    .then(function(){
                        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('connect', function(data) {
                            // console.log('connected client:')
                            client.emit('setConfigClient', 'generalParams', 'hideAUX', null, true)
                            client.disconnect()
                        })
                    })
                    .delay(100)
                    .then(function(){
                        bceStub.callCount.should.eq(1)
                        bceStub.args[0].should.contain.members(['generalParams', 'hideAUX', null, true])
                    })
                    .then(done,done)
            });

            it('receives a property it cannot find (should fail)', function(done) {
                var client;
                Promise.resolve()
                    .then(function(){
                        client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('connect', function(data) {
                            // console.log('connected client:')
                            client.emit('setConfigClient', 'not', 'here', null, true)
                            client.disconnect()
                        })
                    })
                    .delay(120)
                    .then(function(){
                        bceStub.callCount.should.eq(1)
                        bceStub.args[0].should.contain.members(['not', 'here', null, true])
                    })
                    .then(done,done)


            });
        })
    })

})
