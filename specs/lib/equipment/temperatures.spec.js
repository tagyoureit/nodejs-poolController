var myModule = rewire(path.join(process.cwd(), '/lib/equipment/temperatures.js'))


describe('temperature tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevel)
    var equip = 'controller'

    describe('gets or sets the temperatures', function() {
        it('should get the temperature', function() {

            myModule.__with__({
                temperatures: {
                    "poolTemp": 75,
                    "spaTemp": 70,
                    "airTemp": 65,
                    "solarTemp": 60,
                    "freeze": 0
                }
            })(function() {

                //bottle.container.chlorinator.setChlorinatorLevel(2);
                //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
                var res = myModule(bottle.container).getTemperatures()
                res.poolTemp.should.eq(75)
            })

        })

        it('should set the temperature', function() {

            myModule.__with__({
                'bottle.container': {
                    io: {
                        emitToClients: function() {}
                    }
                }
            })(function() {

                //bottle.container.chlorinator.setChlorinatorLevel(2);
                //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
                var res = myModule(bottle.container).setTempFromController(99,88,77,66,0)
                res.poolTemp.should.eq(99)
            })

        })
    })
})
