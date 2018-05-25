const through2 = require('through2') // Transform stream

module.exports = function (params, valueCallback) {
  console.log('Generate SUM stream')
  let sum = 0
  return through2.obj(function (obj, enc, streamCallback) {
    sum += parseFloat(obj[params.inputColumn])
    valueCallback(sum)
    this.push(obj)
    streamCallback()
  })
}
