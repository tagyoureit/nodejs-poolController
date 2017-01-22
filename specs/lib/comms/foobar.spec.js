var rewire = require('rewire')
var myModule = rewire(__dirname + '/foobar.js')

myModule.__with__({
    'bar': function(){
      console.log('changing return to false from rewire')
      return false
    },
    'someVar': "abcde"

})(function() {

    var result = myModule('a').foo()
    console.log('result is: ', result)

})
