const lineParser = require('csv-parse/lib/sync')

function getCsvStreamStructure(rs, cb) {
  var head = '' //some bytes of the file
  rs.on('readable', function() {
    if (head.length == 0) {
      var isFirstLine = true
      while (isFirstLine) {
        var chunk = rs.read(1)
        head += chunk
        if (chunk == '\n') {
          isFirstLine = false
        }
      }
      rs.unshift(head) //throw back the readed chunk to the buffer.
      cb(lineParser(head.slice(0, -1))[0])
    }
  })
}

module.exports = getCsvStreamStructure
