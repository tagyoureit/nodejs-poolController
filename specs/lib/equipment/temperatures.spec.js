describe('temperature tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevel)
    var equip = 'controller'

    describe('setChlorinatorLevel', function() {
            it('should return a string when called without a callback', sinon.test(function() {
                bottle.container.temperatures.setTempFromController(75,70,65,60,0)
                var res = bottle.container.temperatures.getTemperatures()
                console.log(res)
                expect(res).to.eq({ poolTemp: 75,
  spaTemp: 70,
  airTemp: 65,
  solarTemp: 60,
  freeze: 0 })

            }))
        })

})
