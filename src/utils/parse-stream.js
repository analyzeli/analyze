var csv = require('csv-parser')
var xmlObjects = require('xml-objects')

module.exports = function (streamType, delimiter) {
  return (streamType === 'csv')
    ? csv({
      raw: false,     // do not decode to utf-8 strings
      separator: delimiter, // specify optional cell separator
      quote: '"',     // specify optional quote character
      escape: '"',    // specify optional escape character (defaults to quote value)
      newline: '\n',  // specify a newline character
      strict: true    // require column length match headers length
    })
  : xmlObjects({
    explicitRoot: false,
    explicitArray: false,
    mergeAttrs: false
  })
}
