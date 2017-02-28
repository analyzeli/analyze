const flat = require('flat')

function saveToCollection(object, collection, isStructureDynamic) {
  var flatObject = flat(object)
  //Update the actual structure if needed
  if (isStructureDynamic) {
    for (var prop in flatObject) {
      if (collection.structure.indexOf(prop) == -1) {
        collection.structure.push(prop)
      }
    }
  }

  //Push object to collection
  collection.records.push(flatObject)
}

module.exports = saveToCollection
