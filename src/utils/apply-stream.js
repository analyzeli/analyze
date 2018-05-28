const through2 = require('through2') // Transform stream

module.exports = function (apply) {
  return through2.obj(function (obj, enc, streamCallback) {
    apply(obj)
    this.push(obj)
    streamCallback()
  })
}
