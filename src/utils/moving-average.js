module.exports = function MovingAverageFactory (period, type = 'simple') {
  const arr = []
  return function (value) {
    console.log('MA: ', value, period, arr)
    arr.push(value)
    if (arr.length >= parseInt(period) + 1) {
      console.log('Shifting, returning MA')
      arr.shift()
      return arr.reduce((a, v) => a + v, 0) / period
    } else {
      console.log('Array too small')
      return null
    }
  }
}
