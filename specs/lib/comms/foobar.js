module.exports = function(config) {

  function bar() {
      console.log('why am i in _%s_ bar?', config)
      //some logic
      return true
    }

  function foo() {
        if (bar()) {
            console.log('should not get here, but someVar is passing: ', someVar)
            return true
        } else {
            console.log('should get here, though, and we still see someVar: ', someVar)
            return false
        }
    }

    return {
        foo: foo,
        bar: bar
    }
}
