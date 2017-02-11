var fs = require('fs'),
    fsio = require('promised-io/fs'),
    path = require('path').posix
var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/bootstrap-config-editor.js'))

describe('updates bootstrap configClient.json', function() {
    context('when called with the Socket API', function() {
        describe('#updates panelState when called with 3/4 variables', function() {

            beforeEach(function() {
                fs.createReadStream(path.join(process.cwd(), '/specs/assets/config/configClient.json')).pipe(fs.createWriteStream(path.join(process.cwd(), '/specs/assets/config/_configClient.json')));
            })

            afterEach(function() {
                fs.unlinkSync(path.join(process.cwd(), '/specs/assets/config/_configClient.json'))
            })

            it('changes system state from visible to hidden', function(done) {

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
                    client.disconnect()
                })

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
                    }, 500)

                })
            });


            it('changes hideAUX state from visible to hidden', function(done) {

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
                    client.disconnect()
                })

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
                    }, 500)

                })
            });

            it('receives a property it cannot find (should fail)', function(done) {

               var loggerStub = sinon.stub(bottle.container.logger, 'warn')

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function(data) {
                    // console.log('connected client:')
                    client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
                    client.disconnect()
                })

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
                    }, 500)

                })
            });
        })
    })
})
