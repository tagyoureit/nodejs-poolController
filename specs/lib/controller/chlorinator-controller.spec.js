var myModule = rewire(path.join(process.cwd(), '/lib/controllers/chlorinator-controller.js'))

describe('chlorinator controller', function() {

    describe('#startChlorinatorController starts the timer for 1 or 2 chlorinators', function() {

        before(function() {
            //this.clock = sinon.useFakeTimers();
        })

        after(function() {
            //this.clock.restore();
        })

        it('sets chlorinator timer to run after 3.5 seconds', function() {
            myModule.__with__({

                'chlorinatorTimer': {
                    'setTimeout': function() {
                        console.log('timer stubbed')
                    }
                }
            })(function(){
              //console.log('before time:', this.clock.now)
              var res = myModule(bottle.container).startChlorinatorController()
            })
            //this.timeout(4000)


            //console.log('res:', res)
            //this.clock.tick(3500)
            //console.log('after time:', this.clock.now, res)

            //expect(stub).to.be.true
            //console.log('stub: ', stub)
            //return expect(stub).to.be.calledOnce
        });


    });

    describe('#chlorinatorStatusCheck requests chlorinator status', function() {


      it('requests status and resets the timer with a valid desired output (0)', function() {

        var stub = sinon.stub()
        stub.returnsArg(2)

          myModule.__with__({

              'bottle.container': {
                  'chlorinator': {
                      'getDesiredChlorinatorOutput': function() {
                          console.log('desired chlor output stubbed')
                          return 0
                      }
                  },
                  'queuePacket': {
                      'queuePacket': function() {
                          //console.log('queuePacket was called')
                      }
                  }


              },
              'chlorinatorTimer': {
                  'setTimeout': stub,
                  'clearTimeout': function() {
                      console.log('clear timer stubbed')
                  }
              }
          })(function(){

          //bottle.container.chlorinator.setChlorinatorLevel(2);
          //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
          var res = myModule(bottle.container).chlorinatorStatusCheck()
          res.should.be.eq('1800s')
        })
      });


        it('requests status and resets the timer with a valid desired output (10)', function() {

          var stub = sinon.stub()
          stub.returnsArg(2)

            myModule.__with__({

                'bottle.container': {
                    'chlorinator': {
                        'getDesiredChlorinatorOutput': function() {
                            console.log('desired chlor output stubbed')
                            return 10
                        }
                    },
                    'queuePacket': {
                        'queuePacket': function() {
                            //console.log('queuePacket was called')
                        }
                    }


                },
                'chlorinatorTimer': {
                    'setTimeout': stub,
                    'clearTimeout': function() {
                        console.log('clear timer stubbed')
                    }
                }
            })(function(){

            //bottle.container.chlorinator.setChlorinatorLevel(2);
            //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
            var res = myModule(bottle.container).chlorinatorStatusCheck()
            res.should.be.eq('4s')
          })
        });

        it('requests status and resets the timer with a valid desired output (102) (should fail)', function() {

          var stub = sinon.stub()
          stub.returnsArg(2)

            myModule.__with__({

                'bottle.container': {
                    'chlorinator': {
                        'getDesiredChlorinatorOutput': function() {
                            console.log('desired chlor output stubbed')
                            return 102
                        }
                    },
                    'queuePacket': {
                        'queuePacket': function() {
                            //console.log('queuePacket was called')
                        }
                    }


                },
                'chlorinatorTimer': {
                    'setTimeout': stub,
                    'clearTimeout': function() {
                        console.log('clear timer stubbed')
                    }
                }
            })(function(){

            //bottle.container.chlorinator.setChlorinatorLevel(2);
            //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
            var res = myModule(bottle.container).chlorinatorStatusCheck()
            res.should.be.false
          })
        });
    });

});
