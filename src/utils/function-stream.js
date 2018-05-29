const reduceStream = require('./reduce-stream')
// const mapStream = require('./map-stream')
const applyStream = require('./apply-stream')
const Ma = require('./moving-average')
const Stats = require('online-stats')

module.exports = function (t, params, valueCallback) {
  const type = t.toLowerCase()
  switch (type) {
    case 'abs' :
      return applyStream(obj => { obj[params.outputColumn] = Math.abs(parseFloat(obj[params.inputColumn])) })
    case 'max' :
      const max = Stats.Max()
      return reduceStream((acc, obj) => max(parseFloat(obj[params.inputColumn])), 0, valueCallback)
    case 'mean' :
      const mean = Stats.Mean()
      return reduceStream((acc, obj) => mean(parseFloat(obj[params.inputColumn])), 0, valueCallback)
    case 'median' :
      const median = Stats.Median()
      return reduceStream((acc, obj) => median(parseFloat(obj[params.inputColumn])), 0, valueCallback)
    case 'min' :
      const min = Stats.Min()
      return reduceStream((acc, obj) => min(parseFloat(obj[params.inputColumn])), 0, valueCallback)
    case 'sum' :
      return reduceStream((acc, obj) => acc + parseFloat(obj[params.inputColumn]), 0, valueCallback)
    case 'sqrt' :
      return applyStream(obj => { obj[params.outputColumn] = Math.sqrt(parseFloat(obj[params.inputColumn])) })
    case 'movingaverage':
      const ma = Ma(params.period)
      return applyStream(obj => { obj[params.outputColumn] = ma(parseFloat(obj[params.inputColumn])) })
    case 'std' :
      const tempVariance = Stats.Variance({ddof: params.sample ? 1 : 0})
      return reduceStream((acc, obj) => Math.sqrt(tempVariance(parseFloat(obj[params.inputColumn]))), 0, valueCallback)
    case 'variance' :
      const variance = Stats.Variance({ddof: params.sample ? 1 : 0})
      return reduceStream((acc, obj) => variance(parseFloat(obj[params.inputColumn])), 0, valueCallback)
  }
}
