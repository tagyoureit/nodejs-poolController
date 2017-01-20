describe('decodeHelper', function() {
    var testarrayGOOD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 148],
        [165, 16, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 4, 247],
        [165, 16, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 5, 7],
        [165, 16, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var testarrayBAD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 149],
        [165, 16, 15, 17, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 1, 251, 4, 247],
        [165, 16, 15, 16, 12, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 2, 7],
        [165, 16, 15, 16, 10, 12, 0, 99, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var spiedChecksum = sinon.spy(bottle.container.decodeHelper.checksum)
    var equip = 'controller'

    describe('#Checksum', function() {
        context('when packets arrive', function() {
            it('it should return true with various controller packets', function() {
                for (var i = 0; i < testarrayGOOD.length; i++) {
                    console.log('running test with: ', testarrayGOOD[i].toString())
                    expect(spiedChecksum(testarrayGOOD[i], 25, equip)).to.be.true

                }
            })
            it('should return false with various invalid controller packets', function() {

                for (var i = 0; i < testarrayBAD.length; i++) {
                    console.log('running test with: ', testarrayBAD[i].toString())
                    expect(spiedChecksum(testarrayBAD[i], 25, equip)).to.be.false

                }
            })
        })
    })

    describe('#processChecksum', function() {
        var spiedChecksum = sinon.spy(bottle.container.decodeHelper.decode)

        context('incoming packets', function() {
            it('should return true with various controller packets', function() {
                for (var i = 0; i < testarrayGOOD.length; i++) {
                    console.log('running test with: ', testarrayGOOD[i].toString())
                    bottle.container.decodeHelper.processChecksum(testarrayGOOD[i], i * 10, equip)
                    expect(spiedChecksum).to.be.calledOnce
                }
            })

        })
    })

    after(function() {
        
    })

})
