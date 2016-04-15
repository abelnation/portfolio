
var _ = require('lodash')
var chalk = require('chalk')

function Log(opts) {
    this.options = opts
}
_.extend(Log.prototype, {
    log: function info(msg, obj, chalkFn) {
        if (!chalkFn) {
            chalkFn = function(x) { return x }
        }

        console.log(chalkFn(msg))
        if (obj instanceof Error) {
            console.log(chalkFn(obj.stack))
        } else if (_.isObject(obj)) {
            console.log(chalkFn(JSON.stringify(obj, null, 2)))
        } else if (obj) {
            console.log(chalkFn(obj))
        }
    },

    info: function info(msg, obj) {
        this.log(msg, obj, chalk.white)
    },

    debug: function debug(msg, obj) {
        if (this.options.debug) {
            this.log(msg, obj, chalk.green)
        }
    }
})

module.exports = Log
