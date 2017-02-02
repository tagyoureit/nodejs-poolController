
var protocol = 'http://'
var server = 'localhost:3000/'

var sandbox,
  user = '',
  password = ''


describe('server', function() {
    describe('#with authorization', function() {

        context('by a URL', function() {
          before(function(){
            //stop the express server and restart with authentication
            bottle.container.settings.expressAuth = 1
            bottle.container.settings.expressAuthFile = path.join('/specs/assets/server', '/users.htpasswd')
            bottle.container.settings.expressDir = '/bootstrap'
            bottle.container.server.close()
            bottle.container.server.init()
          })

          beforeEach(function() {
              sandbox = sinon.sandbox.create()
          })

          afterEach(function() {
              sandbox.restore()
          })

          after(function(){
            //stop the express server and restart without authentication
            bottle.container.settings.expressAuth = 0
            bottle.container.settings.expressAuthFile = ''
            bottle.container.server.close()
            bottle.container.server.init()
          })

            it('authorizes a known user', function(done) {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = rp(options)

                promise.then(function(res){
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
                var promise = rp(options)

                promise.then(function(res){
                  true.should.eq(false)
                }).catch(function(error){
                  error.statusCode.should.eq(401)
                  done()
                });

            });

            it('fails with no authorization provided', function(done) {
                var options = {
                    method: 'GET',
                    uri: protocol + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = rp(options)

                promise.then(function(res){
                  true.should.eq(false)
                }).catch(function(error){
                  error.statusCode.should.eq(401)
                  done()
                });

            });

        });

    });
});
