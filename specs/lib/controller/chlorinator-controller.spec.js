describe('chlorinator controller', function() {

    describe('#startChlorinatorController starts the timer for 1 or 2 chlorinators', function() {
        context('on app startup', function() {
            it('sets chlorinator timer to run after 3.5 seconds', function() {
                expect(bottle.container.chlorinatorController.startChlorinatorController()).to.be.true;
            });
        })

    });

    describe('#chlorinatorStatusCheck requests chlorinator status', function() {
        context('upon timer execution', function() {
            it('requests status and resets the timer with a valid desired output (10)', function() {
              bottle.container.chlorinator.setChlorinatorLevel(2);
                expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
            });
        })

    });

});
