var fs = require('fs'),
    fsio = require('promised-io/fs'),
    path = require('path').posix
var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/bootstrap-config-editor.js'))

describe('updates bootstrap configClient.json', function() {
    context('when called with the internal function', function() {
        describe('#updates panelState when called with 3/4 variables', function() {

            beforeEach(function() {
                fs.createReadStream(path.join(process.cwd(), '/specs/assets/config/configClient.json')).pipe(fs.createWriteStream(path.join(process.cwd(), '/specs/assets/config/_configClient.json')));
            })

            afterEach(function() {
                fs.unlinkSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'))
            })

            it('changes system state from visible to hidden', function(done) {
                myModule.__with__({
                    'dir': '/specs/assets/config',
                    'file': '_configClient.json'

                })(function() {
                    myModule(bottle.container).update('panelState', 'system', 'state', 'hidden')
                    setTimeout(function() {
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                        changed = JSON.parse(changed)
                        changed.panelState.system.state.should.eq('hidden')
                        done()
                    }, 75)

                })
            });


            it('changes hideAUX state from visible to hidden', function(done) {
                myModule.__with__({
                    'dir': '/specs/assets/config',
                    'file': '_configClient.json'

                })(function() {
                    myModule(bottle.container).update('generalParams', 'hideAUX', null, true)
                    setTimeout(function() {
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                        changed = JSON.parse(changed)
                        changed.generalParams.hideAUX.should.eq(true)
                        done()
                    }, 75)

                })
            });

            it('receives a property it cannot find (should fail)', function(done) {

                var loggerStub = sinon.stub(bottle.container.logger, 'warn')
                myModule.__with__({
                    'dir': '/specs/assets/config',
                    'file': '_configClient.json'

                })(function() {
                    myModule(bottle.container).update('not', 'here', null, true)
                    setTimeout(function() {
                        var original = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/configClient.json'), 'utf-8')
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')
                        changed.should.eq(original)
                        loggerStub.callCount.should.eq(1)
                        loggerStub.restore()
                        done()
                    }, 75)

                })
            });
        })
    })
    context('when called with the Socket API', function() {
        describe('#updates panelState when called with 3/4 variables', function() {

            before(function() {
                bottle.container.server.init()
                bottle.container.io.init()
            })

            beforeEach(function() {
                fs.createReadStream(path.join(process.cwd(), '/specs/assets/config/configClient.json')).pipe(fs.createWriteStream(path.join(process.cwd(), '/specs/assets/config/_configClient.json')));
                sandbox = sinon.sandbox.create()
                bceStub = sandbox.stub(bottle.container.bootstrapConfigEditor, 'update')
            })

            afterEach(function() {
                fs.unlinkSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'))
                sandbox.restore()
            })

            after(function() {
                bottle.container.server.close()
            })

            it('changes system state from visible to hidden', function(done) {
                /* NOTE: best we can do here is make sure the function is called...
                  no good way I know of to rewire the internal variables if not calling the function directly.
                  So long as we test the function above, this should be sufficient.
                  */
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setConfigClient', 'panelState', 'system', 'state', 'hidden')
                    client.disconnect()
                    setTimeout(function() {
                        bceStub.callCount.should.eq(1)
                        bceStub.args[0].should.contain.members(['panelState', 'system', 'state', 'hidden'])
                        done()
                    }, 75)
                })
            });


            it('changes hideAUX state from visible to hidden', function(done) {

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setConfigClient', 'generalParams', 'hideAUX', null, true)
                    client.disconnect()
                    setTimeout(function() {
                        bceStub.callCount.should.eq(1)
                        bceStub.args[0].should.contain.members(['generalParams', 'hideAUX', null, true])
                        done()
                    }, 75)
                })
            });

            it('receives a property it cannot find (should fail)', function(done) {
                var loggerStub = sandbox.stub(bottle.container.logger, 'warn')
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)

                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setConfigClient', 'not', 'here', null, true)
                    client.disconnect()
                    setTimeout(function() {
                      bceStub.callCount.should.eq(1)
                      bceStub.args[0].should.contain.members(['not', 'here', null, true])
                        done()
                    }, 75)
                })
            });
        })
    })

})
