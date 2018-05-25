const reduceStream = require('./reduce-stream')
const mapStream = require('./map-stream')
const Ma = require('./moving-average')

module.exports = function (t, params, valueCallback) {
  const type = t.toLowerCase()
  switch (type) {
    case 'sum' :
      return reduceStream((acc, obj) => acc + parseFloat(obj[params.inputColumn]), 0, valueCallback)
    case 'sqrt' :
      return mapStream(obj => { obj[params.outputColumn] = Math.sqrt(parseFloat(obj[params.inputColumn])); return obj })
    case 'movingaverage':
      const ma = Ma(params.period)
      return mapStream(obj => { obj[params.outputColumn] = ma(parseFloat(obj[params.inputColumn])); return obj })
  }

  // return functionStreams[t.toLowerCase()](params, valueCallback)
}
