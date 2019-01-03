var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

describe('updates/resets bootstrap configClient.json', function() {
    context('when called with the internal function', function() {


        before(function () {
            return global.initAllAsync()
        })

        beforeEach(function () {

            // sinon = sinon.sinon.create()
            loggers = setupLoggerStubOrSpy('stub', 'spy')
            updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))

            var origFile = '/specs/assets/bootstrapConfig/configClient.json'
            var copyFile = '/specs/assets/bootstrapConfig/_configClient.json'
            return fs.readFileAsync(path.join(process.cwd(), origFile))
                .then(function (orig) {
                    return fs.writeFileAsync(path.join(process.cwd(), copyFile), orig)
                })
                .then(function () {
                    return fs.readFileAsync(path.join(process.cwd(), copyFile), 'utf-8')
                })
                // .then(function(copy) {
                //     console.log('just copied _configClient.  %s bytes', copy.length)
                // })
                .then(function () {
                    return bottle.container.bootstrapsettings.init(copyFile)
                })
                .catch(function (err) {
                    /* istanbul ignore next */
                    console.log('oops, we hit an error', err)
                })


        })

        afterEach(function () {
            sinon.restore()
            return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'))
                .then(bottle.container.bootstrapsettings.init)
            // .then(function() {
            //     console.log('file removed')
            // })
        })

        after(function () {
            return global.stopAllAsync()
        })

        describe('#updates panelState', function() {

            it('#resets the Bootstrap UI Config file', function() {

                var myResolve, myReject
                //var orig = fs.readFile(path.join(process.cwd(), '/specs/assets/config/_configClient.json'), 'utf-8')

                setTimeout(function(){
                    return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                        .then(function(data){
                            data = JSON.parse(data)
                            //console.log(data)
                            for (var key in data.panelState) {
                                if (data.panelState[key].state !== "visible"){
                                    myReject(new Error('resetConfigClient did not reset all value.'))
                                }
                            }
                        }).catch(function(err){
                            myReject(new Error('resetConfigClient did not reset all value. ' + err))
                        }).finally(myResolve)


                }, 800)

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)

                client.on('connect', function(data) {
                    client.emit('resetConfigClient')
                    client.disconnect()
                })
                return new Promise(function(resolve, reject){
                    myResolve = resolve
                    myReject = reject
                })
            })

            it('changes system state from visible to hidden', function () {
                var myResolve, myReject
                bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                    .then(function () {
                        return bottle.container.bootstrapsettings.updateAsync('panelState', 'system', 'state', 'hidden')
                    })
                    .delay(50)
                    .then(function () {
                        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                    })
                    .then(function (changed) {
                        changed = JSON.parse(changed)
                        changed.panelState.system.state.should.eq('hidden')
                        myResolve()
                    })
                    .catch(function(err){
                        console.log('err with system state vis to hidden', err)
                        myReject(err)
                    })
                return new Promise(function(resolve, reject){
                    myResolve = resolve
                    myReject = reject
                })

            });




            it('changes hideAUX state from visible (false) to hidden (true)', function (done) {
                bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                    .then(function () {
                        return bottle.container.bootstrapsettings.updateAsync('generalParams', 'hideAUX', null, true)
                    })
                    .delay(50)
                    .then(function () {
                        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                    })
                    .then(function (changed) {
                        changed = JSON.parse(changed)
                        changed.generalParams.hideAUX.should.eq(true)
                        return
                    })
                    .then(done, done)
            });

            it('receives a property it cannot find (should fail)', function () {
                bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                    .then(function () {
                        loggerWarnStub.restore()
                        loggerWarnStub = sinon.stub(bottle.container.logger, 'warn')
                        return bottle.container.bootstrapsettings.updateAsync('not', 'here', null, true)
                    })
                    .delay(50)
                    .then(function () {
                        var original = fs.readFileSync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/configClient.json'), 'utf-8')
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                        // these are both returned as strings (not parsed) so we can directly compare them
                        changed.should.eq(original)
                        clearTimeout(a)
                        myResolve()
                    })
                    .catch(function(err){
                        myReject(new Error(err))
                    })
                var myResolve, myReject

                var a = setTimeout(function() {
                        myReject(new Error('Timeout on closes a connection'))
                    }
                    ,1500)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })
            });


            it('resets all panelStates to visible', function (done) {
                bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                    .then(function () {
                        return bottle.container.bootstrapsettings.resetAsync()
                    })
                    .delay(50)
                    .then(function () {
                        var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                        changed = JSON.parse(changed)
                        for (var key in changed.panelState) {
                            changed.panelState[key].state.should.eq("visible")
                        }
                    })
                    .then(done, done)
            });
        })

        context('when called with the Socket API', function() {
            describe('#updates panelState', function() {

                it('changes system state from visible to hidden', function(done) {
                    var client;
                    Promise.resolve()
                        .then(function(){
                            return bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                        })
                        .then(function(){
                            client = global.ioclient.connect(global.socketURL, global.socketOptions)
                            client.on('connect', function(data) {
                                // console.log('connected client:')
                                client.emit('setConfigClient', 'panelState', 'system', 'state', 'hidden')
                                client.disconnect()
                            })
                        })
                        .delay(50)
                        .then(function(){
                            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                        })
                        .then(function(changed) {
                            changed = JSON.parse(changed)
                            changed.panelState.system.state.should.eq('hidden')
                        })
                        .then(done,done)
                });


                it('changes hideAUX state from visible (false) to hidden (true)', function(done) {

                    var client;
                    Promise.resolve()
                        .then(function(){
                            return bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                        })
                        .then(function(){
                            client = global.ioclient.connect(global.socketURL, global.socketOptions)
                            client.on('connect', function(data) {
                                // console.log('connected client:')
                                client.emit('setConfigClient', 'generalParams', 'hideAUX', null, true)
                                client.disconnect()
                            })
                        })
                        .delay(500)
                        .then(function(){
                            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                        })
                        .then(function(changed) {
                            changed = JSON.parse(changed)
                            changed.generalParams.hideAUX.should.eq(true)
                        })
                        .then(done,done)
                });

                it('receives a property it cannot find (should fail)', function(done) {

                    var client;
                    Promise.resolve()
                        .then(function(){
                            loggerWarnStub.restore()
                            loggerWarnStub = sinon.stub(bottle.container.logger, 'warn')
                            return bottle.container.bootstrapsettings.init('/specs/assets/bootstrapConfig/_configClient.json')
                        })
                        .then(function(){
                            client = global.ioclient.connect(global.socketURL, global.socketOptions)
                            client.on('connect', function(data) {
                                // console.log('connected client:')
                                client.emit('setConfigClient', 'not', 'here', null, true)
                                client.disconnect()
                            })
                        })
                        .delay(25)
                        .then(function(changed) {
                            var original = fs.readFileSync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/configClient.json'), 'utf-8')
                            var changed = fs.readFileSync(path.join(process.cwd(), '/specs/assets/bootstrapConfig/_configClient.json'), 'utf-8')
                            // these are both returned as strings (not parsed) so we can directly compare them
                            changed.should.eq(original)
                        })
                        .then(done,done)
                });
            })
        })

    })
})

