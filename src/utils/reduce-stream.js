const through2 = require('through2') // Transform stream

module.exports = function (reducer, accumInitial, valueCallback) {
  let accum = accumInitial
  return through2.obj(function (obj, enc, streamCallback) {
    accum = reducer(accum, obj)
    valueCallback(accum)
    this.push(obj)
    streamCallback()
  })
}
