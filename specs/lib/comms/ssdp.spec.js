describe('tests SSDP/uPNP', function () {
      // TODO : Nock doesn't seem to be grabbing requests.  Turn off wifi/network and see errors.

    context('#with the SSDP client', function () {
        before(function () {
            return global.initAllAsync()
                .then(function () {
                    loggers = setupLoggerStubOrSpy('stub', 'stub')
                })
                .then(bottle.container.updateAvailable.initAsync('/specs/assets/packageJsonTemplates/package_3.1.9.json'))
        })

        beforeEach(function () {

            this.timeout(5000)
            scope = nock('https://api.github.com')
                .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.0.0.json'))
                .persist()
        })

        afterEach(function () {
            nock.cleanAll();
        })

        after(function () {
            return bottle.container.updateAvailable.initAsync('/specs/assets/package.json')
                .then(global.stopAllAsync)
        })

        it('responds to an m-search', function (done) {
            var ssdp = require('node-ssdp').Client
                , client = new ssdp({})

            client.on('response', function inResponse(headers, code, rinfo) {
                // console.log('Got a response to an m-search:\n%d\n%s\n%s', code, JSON.stringify(headers, null, '  '), JSON.stringify(rinfo, null, '  '))
                headers.ST.should.equal('urn:schemas-upnp-org:device:PoolController:1')
                code.should.equal(200)
                client.stop()
                done()
            })

            client.search('urn:schemas-upnp-org:device:PoolController:1')
        });

        it('requests /device URI', function (done) {
            global.requestPoolDataWithURLAsync('device')
                .delay(50)
                .then(function (obj) {
                    obj.should.contain('<major>3</major>')  // should really parse XML, but this may do for now.
                    obj.should.contain('<minor>1</minor>')
                }).then(done, done)
        });


    });

})
