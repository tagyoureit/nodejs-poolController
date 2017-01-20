describe('chlorinator tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevel)
    var equip = 'controller'

    describe('setChlorinatorLevel', function() {
            it('should return a string when called without a callback', sinon.test(function() {
                var res = bottle.container.chlorinator.setChlorinatorLevel(0)
                expect(res).to.have.property('status')

            }))

            it('should return a string when called with a callback', sinon.test(function() {
                var res = bottle.container.chlorinator.setChlorinatorLevel(0, function() {})
                expect(res).to.have.property('status')

            }))
        })

})
