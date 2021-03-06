const through2 = require('through2') // Transform stream

module.exports = function (map) {
  return through2.obj(function (obj, enc, streamCallback) {
    obj = map(obj)
    this.push(obj)
    streamCallback()
  })
}
