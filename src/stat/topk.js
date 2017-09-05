var streamcount = require('streamcount')

module.exports = class {
  constructor () {
    this.props = {
      'Input column': { type: 'Column' },
      'Amount': {
        type: 'Number',
        value: 5
      }
    }
    this.output = {
      records: {
        'Value': [],
        'Number of records': []
      },
      length: 0
    }
  }

  init () {
    this.counter = streamcount.createViewsCounter(this.props['Amount'].value)
  }

  process (obj) {
    this.counter.increment(obj[this.props['Input column'].value])
    var top = this.counter.getTopK()
    this.output.length = top.length
    top.forEach((pair, index) => {
      this.output.records['Value'][index] = pair[1]
      this.output.records['Number of records'][index] = pair[0]
    })
  }
}

/*
counter.increment('a7')
counter.increment('a2')
counter.increment('aa')
counter.increment('a1')
counter.increment('a5')
counter.increment('a2')
counter.increment('a1')
counter.increment('a2')
counter.increment('a7')
counter.increment('a1')
counter.increment('a0')
counter.increment('a6')
counter.increment('a2')
console.log(counter.getTopK())
*/
