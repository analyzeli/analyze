const through2 = require('through2') // Transform stream

module.exports = function (map) {
  return through2.obj(function (obj, enc, streamCallback) {
    console.log(obj)
    obj = map(obj)
    console.log(obj)
    this.push(obj)
    streamCallback()
  })
}
