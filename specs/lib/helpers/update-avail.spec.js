var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)
describe('checks if there is a newer version available', function() {


    describe('#by talking (stubbing) to Git', function() {
        context('compares local version to latest published release', function() {

            before(function() {

            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()

                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')

                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                return global.initAll()

            })

            afterEach(function() {
                nock.cleanAll();
                sandbox.restore()
                return global.removeShadowConfigFile()
                    .then(global.stopAll)
            })

            after(function() {



            })

            it('#notifies of a new release available (remote > local)', function() {
                // published release: 4.1.200
                // current version running: 4.1.0
                // cached remote release: 3.0.0
                // dismissUntilNextVerBump: false
                // expected result: update avail notifies of new release

                this.timeout(10000) //times out on Travis with 5000 timeout.

                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))

                Promise.resolve()
                    .then(function(){
                        return global.useShadowConfigFile('/specs/assets/config/templates/config_vanilla.json')
                    })
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})
                    .then(function(){
                        //check internally we return the right value
                        bottle.container.updateAvailable.getResults().result.should.eq('older')
                    })
                    // check the file now has the right version stored
                    .then(function(){return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')})
                    .then(function(configFile){
                        configFile = JSON.parse(configFile)
                        configFile.poolController.notifications.version.remote.version.should.equal('4.1.200')
                        clearTimeout(a)
                        scope.done()
                        myResolve()
                    })

                    .catch(function(err){
                        'error'.should.equal('not an error')
                        myReject(new Error(err))
                    })

                var myResolve, myReject
                var a = setTimeout(function(){myReject(new Error('timeout in update avail spec'))},3000)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })
            })


            it('#notifies of a new release available (remote > local) with local cached version blank', function() {
                // published release: 4.1.200
                // current version running: 4.1.0
                // cached remote release: 3.0.0
                // dismissUntilNextVerBump: false
                // expected result: update avail notifies of new release

                this.timeout(10000) //times out on Travis with 5000 timeout.

                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))

                Promise.resolve()
                    .then(function(){return global.useShadowConfigFile('/specs/assets/config/templates/config_updateavail_blank.json')})
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})


                    .then(function(){
                        //check internally we return the right value
                        bottle.container.updateAvailable.getResults().result.should.eq('older')
                    })
                    // check the file now has the right version stored
                    .then(function(){return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')})
                    .then(function(configFile){
                        configFile = JSON.parse(configFile)
                        configFile.poolController.notifications.version.remote.version.should.equal('4.1.200')
                        clearTimeout(a)
                        scope.done()
                        myResolve()
                    })

                    .catch(function(err){
                        myReject(new Error(err))
                    })

                var myResolve, myReject
                var a = setTimeout(function(){myReject(new Error('timeout in update avail spec'))},3000)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })
            })


            // it('#returns with equal versions', function(done) {
            // this.timeout(5000)
            // var scope = nock('https://api.github.com')
            //     .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
            //     .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json'))
            //
            // //need to use rewire so variables are not already set
            // var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
            // myModule.__with__({
            //     'location': path.join(process.cwd(), '/specs/assets/package.json')
            // })(function() {
            //     myModule(bottle.container).check()
            //         .then(function() {
            //             loggerInfoStub.args[0][0].should.contain('is the same as the')
            //             done()
            //         })
            // })
            // })

            it('#returns with newer version running locally (newer < remote)', function() {
                // published release: 4.0.0
                // current version running: 4.1.0
                // cached remote release: 4.1.0
                // dismissUntilNextVerBump: false
                // expected result: update avail notifies of new release
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.0.0.json'))

                // //need to use rewire so variables are not already set
                // var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                // myModule.__with__({
                //     'location': path.join(process.cwd(), '/specs/assets/package.json')
                // })(function() {
                //     myModule(bottle.container).check()
                //         .then(function() {
                //             loggerInfoStub.args[0][0].should.contain('You are running a newer release')
                //             done()
                //         })
                // })
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)

                global.useShadowConfigFile('/specs/assets/config/templates/config_updateavail_410_dismissfalse.json')
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})
                    .then(function(){


                        client.on('connect', function(data) {
                            bottle.container.io.emitToClients('updateAvailable')
                        })
                        client.on('updateAvailable', function(msg) {
                            msg.result.should.equal('newer')
                            client.disconnect()
                            clearTimeout(a)
                            scope.done()

                            myResolve()

                        })
                    })

                var myResolve, myReject
                var a = setTimeout(function() {
                    myReject(new Error('should not reach timeout'))
                },1800)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })
            })

            it('#sends updateAvailable with dismissUntilNextRemoteVersionBump=false', function() {

                // published release: 4.1.200
                // current version running: 4.1.0
                // cached remote release: 3.0.0
                // dismissUntilNextVerBump: false
                // expected result: update avail notifies of new release

                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))


                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                Promise.resolve()
                    .then(function(){return global.useShadowConfigFile('/specs/assets/config/templates/config_vanilla.json')})
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})
                    .then(function(){
                        client.on('connect', function(data) {
                            bottle.container.io.emitToClients('updateAvailable')
                        })
                        client.on('updateAvailable', function(msg) {
                            msg.result.should.equal('older')
                            client.disconnect()
                            clearTimeout(a)
                            scope.done()

                            myResolve()

                        })
                    })

                var myResolve, myReject
                var a = setTimeout(function(){
                    myReject(new Error('timeout in update avail spec'))
                },1900)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })

            })

            it('#should not send updateAvailable equal with dismissUntilNextRemoteVersionBump=true', function() {

                // published release: 4.1.0
                // current version running: 4.1.0
                // cached remote release: 4.1.0
                // dismissUntilNextVerBump: true
                // expected result: no updateAvail socket sent because of dismissUntil; versions equal

                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json'))

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                Promise.resolve()
                    .then(function(){return global.useShadowConfigFile('/specs/assets/config/templates/config_updateavail_410_dismisstrue.json')})
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})
                    .then(function(){


                        client.on('connect', function(data) {
                            bottle.container.io.emitToClients('updateAvailable')
                        })
                        client.on('updateAvailable', function(msg) {
                            msg.result.should.equal('equal')
                            client.disconnect()
                            clearTimeout(a)
                            scope.done()

                            myReject(new Error('should not receive an emit'))

                        })
                        return
                    })

                var myResolve, myReject
                var a = setTimeout(function() {
                    client.disconnect()
                    scope.done()
                    bottle.container.updateAvailable.getResults().result.should.equal('equal')
                    myResolve()
                },1800)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })

            })

            it('#should send updateAvailable with dismissUntilNextRemoteVersionBump=true (new version available)', function() {

                // published release: 4.1.200
                // current version running: 4.1.0
                // cached remote release: 4.1.0
                // dismissUntilNextVerBump: true
                // expected result: current release is 'older'.
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))

                Promise.resolve()
                    .then(function(){return global.useShadowConfigFile('/specs/assets/config/templates/config_updateavail_410_dismisstrue.json')})
                    .then(function(){return bottle.container.updateAvailable.init('/specs/assets/package.json')})
                    .then(function(){
                        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

                        client.on('connect', function(data) {
                            bottle.container.io.emitToClients('updateAvailable')
                        })
                        client.on('updateAvailable', function(msg) {
                            msg.result.should.equal('older')
                            client.disconnect()
                            clearTimeout(a)
                            scope.done()

                            myResolve()

                        })
                    })

                var myResolve, myReject
                var a = setTimeout(function(){myReject(new Error('timeout in update avail spec'))},1900)
                return new Promise(function(resolve,reject){
                    myResolve = resolve
                    myReject = reject
                })

            })

        })
    })
})
