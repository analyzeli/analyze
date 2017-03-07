var path = require('object-path')

function group(obj,inputColumn,collection) {
  var objectValue = path.get(obj, inputColumn)
  var valueExist = false
  
  //Iterate over the table and increment the counter if needed
  // collection.records[inputColumn].forEach((tableValue, index)=>{
  collection.records['Groups'].forEach((value, index)=>{
    if (value == objectValue) {
      collection.records['Count'][index] += 1
      valueExist = true
    }
  })

  //Push a new element to the table if it's not already there
  if (valueExist == false) {
    // collection.records[inputColumn].push(objectValue)
    collection.records['Groups'].push(objectValue)
    collection.records['Count'].push(1)
    collection.length += 1
  }

}

module.exports = group
