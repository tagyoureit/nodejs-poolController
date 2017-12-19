// var protocol = 'https://'
// var auth = 'localhost:3000/'
//
// var sandbox,
//     user = '',
//     password = ''
//
// sourceCrtFile = path.join(process.cwd(), '/specs/assets/data/auth.crt')
// targetCrtFile =path.join(process.cwd(), '/data/auth.crt')
// sourceKeyFile = path.join(process.cwd(), '/specs/assets/data/auth.key')
// targetKeyFile =path.join(process.cwd(), '/data/auth.key')
//
//
//
// describe('auth', function() {
//     describe('#with authorization', function() {
//
//         context('by a URL', function() {
//             before(function() {
//
//                 global.useShadowConfigFile('/specs/assets/config/templates/config_auth.json')
//                     .then(global.initAll)
//                 // return Promise.resolve().then(
//                 //     function(){
//                 //         //stop the express auth and restart with authentication
//                 //         bottle.container.settings.set('expressAuth', 1)
//                 //         bottle.container.settings.set('expressAuthFile', '/specs/assets/auth/users.htpasswd')
//                 //         bottle.container.settings.set('expressDir', '/bootstrap')
//                 //         bottle.container.settings.set('logReload', 1)
//                 //     })
//                 //     .then(global.initAll)
//             })
//
//             beforeEach(function() {
//                 sandbox = sinon.sandbox.create()
//                 loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//                 loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
//                 loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//                 loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//                 loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//                 exitStub  = sandbox.stub(process, 'exit');
//
//             })
//
//             afterEach(function() {
//                 sandbox.restore()
//             })
//
//             after(function() {
//                 return global.removeShadowConfigFile()
//                     .then(global.stopAll)
//                 // // set express auth to restart without authentication
//                 // bottle.container.settings.set('expressAuth', 0)
//                 // bottle.container.settings.set('expressAuthFile', '')
//                 // bottle.container.settings.set('logReload', 0)
//                 // return global.stopAll()
//             })
//
//             it('fails with no authorization provided', function(done) {
//                 var options = {
//                     method: 'GET',
//                     uri: protocol + auth + 'pump',
//                     resolveWithFullResponse: true,
//                     json: true,
//                 };
//                 var promise = global.rp(options)
//                 promise
//                     .then(function(res){
//
//
//
//
//                         // console.log('1:', res.statusCode)
//                         res.statusCode.should.not.eq(200)
//
//                         console.log('2:', error)
//                         error.statusCode.should.eq(401)
//
//                     })
//                     .finally(done,done)
//
//
//             });
//
//             it('authorizes a known user', function(done) {
//                 user = 'user'
//                 password = 'password'
//
//                 var options = {
//                     method: 'GET',
//                     uri: protocol + user + ':' + password + '@' + auth + 'pump',
//                     resolveWithFullResponse: true,
//                     json: true,
//                 };
//                 var promise = global.rp(options)
//
//                 promise.then(function(res) {
//                     res.statusCode.should.eq(200)
//                     res.statusMessage.should.eq('OK')
//                     done()
//                 });
//
//             });
//
//             it('fails to authorize an unknown user ', function(done) {
//                 user = 'mr'
//                 password = 'hacker'
//
//                 var options = {
//                     method: 'GET',
//                     uri: protocol + user + ':' + password + '@' + auth + 'pump',
//                     resolveWithFullResponse: true,
//                     json: true,
//                 };
//                 var promise = global.rp(options)
//                 // console.log('htaccess file: ', bottle.container.settings.expressAuthFile)
//                 promise.then(
//                     /* istanbul ignore next */
//                     function(res) {
//                         // console.log('1:', res.statusCode)
//                         res.statusCode.should.not.eq(200)
//                     }).catch(function(error) {
//                     // console.log('2:', error)
//                     error.statusCode.should.eq(401)
//                     done()
//                 });
//
//             });
//
//
//         });
//
//     });
//
//
//     describe('#with https', function() {
//
//         context('by a URL', function() {
//             before(function() {
//                 // return Promise.resolve()
//                 //     .then(function(){
//                 //         protocol = 'https://'
//                 //         fs.writeFileSync(targetCrtFile, fs.readFileSync(sourceCrtFile));
//                 //         fs.writeFileSync(targetKeyFile, fs.readFileSync(sourceKeyFile));
//                 //     })
//                 //
//                 //stop the express auth and restart with authentication
//                 bottle.container.settings.set('expressAuth', 0)
//                 bottle.container.settings.set('expressAuthFile', '/specs/assets/auth/users.htpasswd')
//                 bottle.container.settings.set('expressDir', '/bootstrap')
//                 bottle.container.settings.set('expressTransport', 'https')
//                 // bottle.container.auth.closeAll()
//
//                 bottle.container.logger.changeLevel('console', 'silly')
//             })
//
//             beforeEach(function() {
//                 sandbox = sinon.sandbox.create()
//                 loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//                 loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
//                 loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//                 loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//                 loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//
//
//             })
//
//             afterEach(function() {
//                 sandbox.restore()
//             })
//
//             after(function() {
//                 //stop the express auth and restart without authentication
//                 bottle.container.settings.set('expressAuth', 0)
//                 bottle.container.settings.set('expressAuthFile', '')
//                 bottle.container.settings.set('expressTransport', 'http')
//                 return global.stopAll()
//             })
//
//
//
//             it('starts auth with https, but fails ', function(done) {
//                 //we cannot test this successfully because the browser won't trust the self-signed cert.
//
//                 var key = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/auth.key'))
//                 var crt = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/auth.crt'))
//                 var fileStub = sandbox.stub(bottle.container.fs, 'readFileSync')
//                 fileStub.onCall(0).returns(key)
//                 fileStub.onCall(1).returns(crt)
//                 bottle.container.auth.init()
//
//                 var options = {
//                     method: 'GET',
//                     uri: protocol + auth,
//                     resolveWithFullResponse: true,
//                     json: true,
//                     ca: [fs.readFileSync(targetKeyFile, {encoding: 'utf-8'})]
//                 };
//
//
//                 var promise = global.rp(options)
//                 promise.then(
//                     /* istanbul ignore next */
//                     function(res) {
//                         res.statusCode.should.not.eq(200)  //should not get here
//                     }).catch(function(error) {
//                     error.message.should.eq('Error: self signed certificate')
//                     done()
//                 });
//
//             });
//
//         });
//
//     });
//
//
// });

var protocol = 'http://'
var server = 'localhost:3000/'

    user = '',
    password = ''


describe('tests https and authorization', function() {
    describe('#with authorization', function() {

        context('by a URL', function() {
            before(function() {
                return global.useShadowConfigFile('/specs/assets/config/templates/config_auth.json')
                    .then(global.initAll)
                // //stop the express auth and restart with authentication
                // bottle.container.settings.set('expressAuth', 1)
                // bottle.container.settings.set('expressAuthFile', '/specs/assets/auth/users.htpasswd')
                // bottle.container.settings.set('expressDir', '/bootstrap')
                // bottle.container.settings.set('logReload', 1)
                // return global.initAll()
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {
                return global.removeShadowConfigFile()
                    .then(global.stopAll)
                // // set express auth to restart without authentication
                // bottle.container.settings.set('expressAuth', 0)
                // bottle.container.settings.set('expressAuthFile', '')
                // bottle.container.settings.set('logReload', 0)
                // return global.stopAll()
            })

            it('fails with no authorization provided', function(done) {
                var options = {
                    method: 'GET',
                    uri: protocol + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)

                promise

                    .then(
                        /* istanbul ignore next */
                        function(res) {
                            // console.log('1:', res.statusCode)
                            res.statusCode.should.not.eq(200)
                        }).catch(function(error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });

            it('authorizes a known user', function(done) {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)

                promise.then(function(res) {
                    res.statusCode.should.eq(200)
                    res.statusMessage.should.eq('OK')
                    done()
                });

            });

            it('fails to authorize an unknown user ', function(done) {
                user = 'mr'
                password = 'hacker'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)
                // console.log('htaccess file: ', bottle.container.settings.expressAuthFile)
                promise.then(
                    /* istanbul ignore next */
                    function(res) {
                        // console.log('1:', res.statusCode)
                        res.statusCode.should.not.eq(200)
                    }).catch(function(error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });


        });

    });


    describe('#with https and auth', function() {

        context('by a URL', function() {
            before(function() {
                protocol = 'https://'
                return global.useShadowConfigFile('/specs/assets/config/templates/https.json')
                    .then(global.initAll)

                //stop the express auth and restart with authentication
                // bottle.container.settings.set('expressAuth', 0)
                // bottle.container.settings.set('expressAuthFile', '/specs/assets/auth/users.htpasswd')
                // bottle.container.settings.set('expressDir', '/bootstrap')
                // bottle.container.settings.set('expressTransport', 'https')
                // bottle.container.auth.closeAll()

                bottle.container.logger.changeLevel('console', 'silly')
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')


            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {
                //stop the express auth and restart without authentication
                // bottle.container.settings.set('expressAuth', 0)
                // bottle.container.settings.set('expressAuthFile', '')
                // bottle.container.settings.set('expressTransport', 'http')
                return global.stopAll()
            })



            it('starts auth with https, but fails ', function(done) {
                //we cannot test this successfully because the browser won't trust the self-signed cert.

                // var key = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.key'))
                // var crt = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))
                // var fsStat = sandbox.stub(bottle.container.fs, 'statSync')

                // var fileStub = sandbox.stub(bottle.container.fs, 'readFileSync')
                // fileStub.onCall(0).returns(key)
                // fileStub.onCall(1).returns(crt)


                var options = {
                    method: 'GET',
                    uri: protocol + server,
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false
                };


                var promise = global.rp(options)
                //bottle.container.server.init()
                  promise.then(
                        function(res) {
                            res.req.connection.encrypted.should.be.true
                        })
                    .catch( /* istanbul ignore next */ function(error) {
                        error.message.should.not.eq('Error: self signed certificate')

                    })
                    .finally(done,done)

            });

        });

    });


});
