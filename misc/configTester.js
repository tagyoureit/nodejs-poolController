var diff = require('deep-diff').diff;
var observableDiff = require('deep-diff').observableDiff,
    applyChange = require('deep-diff').applyChange;

var fs = require('fs')
var path = require('path').posix
var customConfigFile = process.argv[2] || 'config.json';
var file = process.argv[3]==='overwriteFile' || false
var screen = process.argv[3]==='outputToScreen' || false
var rhsPath = path.join(__dirname, '../sysDefault.json')
var lhsPath = path.join(process.cwd(), customConfigFile)
var rhs, lhs
var diffs = {'newKeys': [], 'deprecatedKeys': []}

console.log('\n')
console.log('Utility to add/remove keys to bring config file current.')
console.log('Usage:  node deepdiff.js %config.json% [overwriteFile or outputToScreen]')
console.log('\toverwriteFile will write updates and delete expired keys, outputToScreen will output the modified file to the screen, or (blank) will just log the deltas')
console.log('\tCustom integrations and any edits are retained.')
console.log('\nUsing:\n\tDefaults file: %s   \n\tUser config file: %s', lhsPath, rhsPath)
console.log('\nWrite file changes: %s   Show full changes on screen:  %s', file, screen)
console.log('')

fs.readFile(lhsPath, function (err, data) {
    if (err) {
        throw err;
    }
    lhs = JSON.parse(data)
})
fs.readFile(rhsPath, function (err, data) {
    if (err) {
        throw err;
    }
    rhs = JSON.parse(data)
})


setTimeout(function () {
    var differences = diff(lhs, rhs);
    //console.log('All differences:\n', differences)
    //console.log('\n\n')

    observableDiff(lhs, rhs, function (d) {
            // console.log(d, d.kind)
            if (d.kind === 'D') {
                diffs.deprecatedKeys.push(d.path.join('.') + ':' + JSON.stringify(d.lhs))

            }
            /*if (d.kind === 'E') {
                ignore edits
                console.log('changes that are edited:', d)
            } */
            if (d.kind === 'N') {
                diffs.newKeys.push(d.path.join('.') + ':' + JSON.stringify(d.rhs))

                applyChange(lhs, rhs, d)
            }
        }, function (path, key) {

                for (var integration in lhs.integrations) {
                    if (lhs.integrations.hasOwnProperty(integration)) {
                        // ignore all of the custom integration entries
                        if (key === integration) {
                            return true
                        }
                    }
                }
                if (path[0] === 'integrations') {
                    // ignore the 'integrations' object
                    return true
                }

                // if nothing else is true, continue processing
                return false
            }


    )
    var str
    if (diffs.deprecatedKeys.length > 0) {
        str = 'Potential expired/deprecated keys in: ' + lhsPath
        diffs.deprecatedKeys.forEach(function (key) {
            str += '\n\tkey: ' + key
        })
        console.log(str)
    }
    if (diffs.newKeys.length > 0) {
        str = '\n\nNew keys to be added \n\tfrom: ' + lhsPath + '\n\t  to: ' + rhsPath
        diffs.newKeys.forEach(function (key) {
            str += '\n\t' + key
        })
        console.log(str)
    }

    if (file){
        fs.writeFile(lhsPath, JSON.stringify(lhs,null,4))
    }
    if (screen){
        console.log('\nComplete file contents (not saved):')
        console.log(JSON.stringify(lhs,null,4))
    }

}, 500)



