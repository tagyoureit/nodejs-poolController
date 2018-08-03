var server, protocol, user, password;


describe('tests web servers and authorization', function () {
    describe('#http with authorization', function () {

        context('by a URL', function () {
            before(function () {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_auth.json'})

                // //stop the express auth and restart with authentication
                // bottle.container.settings.set('expressAuth', 1)
                // bottle.container.settings.set('expressAuthFile', '/specs/assets/auth/users.htpasswd')
                // bottle.container.settings.set('expressDir', '/bootstrap')
                // bottle.container.settings.set('logReload', 1)
                // return global.initAllAsync()
            })

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                protocol = 'http://'
                server = 'localhost:' + bottle.container.settings.get('httpExpressPort') + '/'
                user = ''
                password = ''

            })

            afterEach(function () {
                //sinon.restore()
            })

            after(function () {
                return global.stopAllAsync()

            })

            it('fails with no authorization provided', function (done) {
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
                        function (res) {
                            // console.log('1:', res.statusCode)
                            res.statusCode.should.not.eq(200)
                        }).catch(function (error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });

            it('authorizes a known user', function (done) {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)

                promise.then(function (res) {
                    res.statusCode.should.eq(200)
                    res.statusMessage.should.eq('OK')
                    done()
                });

            });

            it('fails to authorize an unknown user ', function (done) {
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
                    function (res) {
                        // console.log('1:', res.statusCode)
                        res.statusCode.should.not.eq(200)
                    }).catch(function (error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });


        });

    });


    describe('#with https and auth', function () {

        context('by a URL', function () {
            before(function () {
                protocol = 'https://'
                server = 'localhost:' + bottle.container.settings.get('httpsExpressPort') + '/'
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_https.json'})

            })

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub', 'spy')


            })

            afterEach(function () {
                // sinon.restore()
            })

            after(function () {

                return global.stopAllAsync()
            })


            it('starts auth with https ', function (done) {

                // var key = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.key'))
                // var crt = bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))
                // var fsStat = sinon.stub(bottle.container.fs, 'statSync')

                // var fileStub = sinon.stub(bottle.container.fs, 'readFileSync')
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
                //bottle.container.server.initAsync()
                promise.then(
                    function (res) {
                        res.req.connection.encrypted.should.be.true
                    })
                    .catch(/* istanbul ignore next */ function (error) {
                        error.message.should.not.eq('Error: self signed certificate')

                    })
                    .finally(done, done)

            });

            it('fails with no authorization provided', function (done) {
                var options = {
                    method: 'GET',
                    uri: protocol + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };
                var promise = global.rp(options)

                promise

                    .then(
                        /* istanbul ignore next */
                        function (res) {
                            // console.log('1:', res.statusCode)
                            res.statusCode.should.not.eq(200)
                        }).catch(function (error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });

            it('authorizes a known user', function (done) {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };
                var promise = global.rp(options)

                promise.then(function (res) {
                    res.statusCode.should.eq(200)
                    res.statusMessage.should.eq('OK')
                    done()
                });

            });

            it('fails to authorize an unknown user ', function (done) {
                user = 'mr'
                password = 'hacker'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };
                var promise = global.rp(options)
                // console.log('htaccess file: ', bottle.container.settings.expressAuthFile)
                promise.then(
                    /* istanbul ignore next */
                    function (res) {
                        // console.log('1:', res.statusCode)
                        res.statusCode.should.not.eq(200)
                    }).catch(function (error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });


        });

        describe('#with http redirect to https', function () {

            context('by a URL', function () {
                before(function () {
                    protocol = 'http://'
                    server = 'localhost:' + bottle.container.settings.get('httpExpressPort') + '/'
                    return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_https_httpRedirect.json'})
                })

                beforeEach(function () {
                    loggers = setupLoggerStubOrSpy('stub', 'spy')


                })

                afterEach(function () {

                })

                after(function () {
                    return global.stopAllAsync()
                })


                it('forces a 302 error by not following redirects', function (done) {
                    user = 'user'
                    password = 'password'

                    var options = {
                        method: 'GET',
                        uri: protocol + user + ':' + password + '@' + server + 'pump',
                        resolveWithFullResponse: true,
                        json: true,
                        ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                        rejectUnauthorized: true,
                        requestCert: true,
                        agent: false,
                        followRedirect: false

                    };
                    var promise = global.rp(options)

                    promise
                        .then(function (res) {
                            done(new Error('Redirect did happen.  We wanted a 302'))
                        })
                        .catch(function (res) {
                            res.statusCode.should.eq(302)
                            done()
                        });

                });
                it('authorizes a known user after redirect', function (done) {
                    user = 'user'
                    password = 'password'

                    var options = {
                        method: 'GET',
                        uri: protocol + user + ':' + password + '@' + server + 'pump',
                        resolveWithFullResponse: true,
                        json: true,
                        ca: [bottle.container.fs.readFileSync(path.join(process.cwd(), 'specs/assets/data/server.crt'))],
                        rejectUnauthorized: true,
                        requestCert: true,
                        agent: false
                    };
                    var promise = global.rp(options)

                    promise
                        .then(function (res) {
                            res.statusCode.should.eq(200)
                            done()
                        })
                        .catch(function (res) {
                            done(new Error('Redirect did not happen. Code: ' + res.statusCode))
                        });

                });

            });
        });
    })
})
