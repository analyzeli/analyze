/* Dependencies */
  //Streams
const ReadStream = require('filestream').read
const through2 = require('through2') //Transform stream
const filter = require('stream-filter') //Filter string and obj streams
const split = require('split') //Split a text stream by lines
const csv = require('csv-parser') //Parse CSV stream
const lineParser = require('csv-parse/lib/sync') //Parse CSV line
const Meter = require('stream-meter')
const FileSaver = require('file-saver')
const xmlNodes = require('xml-nodes')
const xmlObjects = require('xml-objects')
const http = require('stream-http') //XHR as a stream
const getCsvStreamStructure = require('./get-csv-stream-structure.js') //Get CSV header
const getXmlStreamStructure = require('./get-xml-stream-structure.js') //Get XML nodes and repeated node
  //Objects
const flat = require('flat')
const path = require('object-path') //Acess nested object properties with a variable
const saveToCollection = require('./save-to-collection.js')
const json2csv = require('json2csv') //Convert array of objects to CSV
const escape = require('html-escape') //Sanitize url
  //Stats
const group = require('./group.js') //Group by a properties
  //Vis
const Vue = require('vue')
const VueMaterial = require('vue-material')
const Chartist = require('vue-chartist')
const dnd = require('drag-and-drop-files') //Handle Drag and Drop events
//Other
const queryString = require('query-string')

function showApp() {
  document.getElementById('app-loader').style.display = 'none'
  document.getElementById('app').style.removeProperty('display')
}

Vue.use(VueMaterial)
Vue.use(Chartist)

class Chart {
  constructor(type) {
    this.name = type + '.' + app.charts.length
    this.type = type
    this.inputCollection = ''
    this.inputColumn = ''
    this.labelColumn = ''
  }
}

class Stat {
  constructor(type) {
    this.name = type + '.' + app.stats.length
    this.inputColumns = []

    app.collections[this.name] = {
      records: {},
      length: 0,
      display: true,
      save: true,
      name: this.name
    }

    switch (type) {
      case 'Group':
        app.collections[this.name].records = {
          'Groups': [],
          'Count': []
        }
        this.process = function(object) {
          group(object, this.inputColumns[0], app.collections[this.name])
        }
        this.inputColumns.length = 1
        break
      case 'Median':
        this.process = 'sdsdd'
        this.inputColumns.length = 2
        break
    }
    console.log(this)
  }
}

var csvParser = csv({
  raw: false,     // do not decode to utf-8 strings
  separator: ',', // specify optional cell separator
  quote: '"',     // specify optional quote character
  escape: '"',    // specify optional escape character (defaults to quote value)
  newline: '\n',  // specify a newline character
  strict: true    // require column length match headers length
})

var meter = Meter()

var simpleQuery = ['url','search','searchColumn','strictSearch']
var complexQuery = ['structure', 'charts']

var app = new Vue({
  el: '#app',
  data: {
    chartOptions: {
            lineSmooth: false
    },
    columns: [],
    item: '', //iterative xml node
    search: '',
    searchArr: [],
    searchColumn: '',
    strictSearch: true,
    processed: 0,
    total: 0, //total records loaded to memory
    structure: {
      showAll: true,
      newColumns: []
    },
    collections: {
      main: {
        length: 0,
        display: true,
        save: true,
        records: {},
        name: 'Main'
      }
    },
    readStream: undefined,
    url: '',
    httpError: {
      message: ''
    },
    file: undefined,
    fileSize: 0,
    loading: false,
    w: 0,
    statTypes: ['Group'],
    stats: [],
    chartTypes: ['Bar', 'Line', 'Pie'],
    charts: [],
    dynamicVis: [
      {
        source: {
          table: 1,
          keys: 'Keys',
          values: 'Values'
        },
        type: 'Bars'
      }
    ],
    plotStream: {
      display: false,
      xSize: 600,
      ySize: 400,
      data: {
        xColumn: '',
        yColumn: '',
        xRange: {
          min: undefined,
          max: undefined
        },
        yRange: {
          min: undefined,
          max: undefined
        }
      }
    }
  },
  methods: {
    load: load,
    save: save,
    analyzeFiles: function(event) {
      analyzeFiles(event.target.files)
    },
    test: function () {
      alert('ping')
    },
    addStat: function(type) {
      this.stats.push(new Stat(type))
    },
    removeStat: function(index) {
      this.stats.splice(index,1)
    },
    addChart: function(type) {
      this.charts.push(new Chart(type))
    },
    removeChart: function(index) {
      this.charts.splice(index,1)
    },
    analyzeUrl: function() {
      analyzeUrl(this.url, this.httpError)
    }
  },
  computed: {
    streamName: function() {
      return (this.file !== undefined) ? this.file.name : this.url.slice(this.url.lastIndexOf('/') + 1, this.url.indexOf('csv') + 3)
    },
    streamInfo: function() {
      return (this.file !== undefined) ? 'Last modified: ' + this.file.lastModifiedDate.toLocaleDateString("en-US") : this.url
    },
    analyzed: function() {
      return (this.columns && (this.columns.length > 0))
    },
    selectedColumns: function() {
      return (this.structure.showAll) ? this.columns : this.structure.newColumns
    },
    newQuery: function() {
      if (app.url.length > 0) {
        var query = location.origin + location.pathname
        var queryObj = {run: true}
        simpleQuery.forEach((key)=>{
          if (app[key]) {
            queryObj[key] = app[key]
          }
        })
        complexQuery.forEach((key)=>{
          if (app[key]) {
            queryObj[key] = JSON.stringify(app[key])
          }
        })
        // query.url = app.url
        // queryObj.appSearch = (app.search) ? app.search : undefined
        query += '?' + queryString.stringify(queryObj)
        return query
      }
    }
  },
  watch: {
    selectedColumns: function(val) {
      this.collections.main.records = {}
      val.forEach((column)=>{
        this.collections.main.records[column] = []
      })
    }
  }
})

// 1.A Prepare stream (from URL)
function analyzeUrl(url, error) {
  error.message = ""
  var readed = false
  var request = http.get(app.url, function (res) {
    app.readStream = res
    app.readStream.setEncoding('utf8')
    if (url.indexOf('csv') > 0) {
      app.fileType = 'csv'
    }
    else if (app.readStream.indexOf('xml') > 0) {
      app.fileType = 'xml'
    }
    getStreamStructure(app.readStream, app.fileType)
  })
  request.on('error', function (e) {
    showApp()
    error.message = e.message
  })
}

// 1.B Prepare stream (from FILE)
function analyzeFiles(files) {
  app.file = files[0]
  console.log(app.file)
  app.fileType = (app.file.type.slice(app.file.type.indexOf('/') + 1))
  app.fileSize = app.file.size
  app.readStream = new ReadStream(app.file)
  app.readStream.setEncoding('utf8')
  getStreamStructure(app.readStream, app.fileType)
}

// 2. Calculate data header/structure
function getStreamStructure(rs, type) {
  if (type == 'csv') {
    getCsvStreamStructure(rs, function(columns) {
      processStreamStructure(columns, '')
    })
  }
  else if (type == 'xml') {
    getXmlStreamStructure(rs, function(columns, item) {
      processStreamStructure(columns, item)
    })
  }
}

// 2.1 Store data structure, trigger loader if needed
function processStreamStructure (columns, item) {
  app.columns = columns.slice(0)
  if (app.searchColumn.length == 0) app.searchColumn = app.columns[0]
  app.item = item
  if (query && query.run) {
    Vue.nextTick(function(){
      load()
    })
  }
  showApp()
}

// 3.0.1
var filterTextStream = (function () {
  var header = true
  return filter(function(line){
    var l = app.searchArr.length
    var found = (l == 0)
    var i = 0

    // Progress
    var byteStep = (app.fileSize > 10000000) ? 1000000 : 10000
    if ((meter.bytes - app.processed) > byteStep) {
//    console.log(meter.bytes)
      app.processed = meter.bytes
      app.w = ((app.processed / app.fileSize) * 100).toFixed(1)
    }

    if ((header) && (app.fileType == 'csv')) {
      console.log('Header: ',line+'')
      header = false
      return true
    }
    while ((!found) && (i < l)) {
     found = found || (line.indexOf(app.searchArr[i]) >= 0)
     i+=1
    }
    return found
  })
})()

// 3.0.2
var filterObjectStream = filter.obj(function(obj){
  var l = app.searchArr.length
  var found = (l == 0)
  var i = 0
  var value = path.get(obj, app.searchColumn)
  while ((!found) && (i < l)) {
   found = found || ((app.strictSearch == true) && (value == app.searchArr[i])) || ((app.strictSearch == false) && (value.indexOf(app.searchArr[i]) >= 0))
   i+=1
  }
  // console.log(app.searchColumn + ': ' + value + '(' +found+')')
  return found
})

// 3.0.3
function restructureObjectStream(columns) {
  console.log('New solumns: ',columns)
  return through2.obj(function (obj, enc, callback) {
    if (columns.length > 0) {
      var structuredObj = {}
      columns.forEach((el)=>{
        path.set(structuredObj,el,path.get(obj,el))
      })
      this.push(structuredObj)
    } else {
      this.push(obj)
    }
    callback()
   })
}

// 3. Process stream
function load() {
  app.loading = true
  app.searchArr = (app.search.length > 0)
                ? app.search.split(',').map((el)=>el.trim())
                : []

  if (app.plotStream.display) {
    var canvas = document.getElementById('canvas')
    var ctx = canvas.getContext('2d')
    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0,0,app.plotStream.xSize,app.plotStream.ySize)
  }

  // var rs = new ReadStream(app.file, {
  //   chunkSize: 1024*100
  // })
  var rs = app.readStream
  console.log('read stream: ', rs)
  rs.setEncoding('utf8')

  rs = rs.pipe(meter) //Count all bytes

  //CSV Stream
  if (app.fileType == 'csv') {
    rs = rs //piping
            .pipe(split((line) => line + '\n'))
            .pipe(filterTextStream)
            .pipe(csvParser)
  }

  //XML Stream
  else {
    rs = rs //piping
            .pipe(xmlNodes(app.item))
            .pipe(filterTextStream)
            .pipe(xmlObjects({
                explicitRoot: false,
                explicitArray: false,
                mergeAttrs: false
              })
            )
  }

  //OBJECT stream
  rs = rs
            .pipe(filterObjectStream)
            .pipe(restructureObjectStream(app.structure.newColumns))

//
  rs.on('data', function(obj) {
    //Here rs throws parsed, filtered, not flat objects
      //Plot stream
      if (app.plotStream.display) {
        ctx.fillStyle = '#000'
        var x = parseFloat(path.get(obj,app.plotStream.data.xColumn))*(app.plotStream.xSize/(app.plotStream.data.xRange.max - app.plotStream.data.xRange.min)) - app.plotStream.data.xRange.min
        var y = app.plotStream.ySize - (parseFloat(path.get(obj,app.plotStream.data.yColumn))*(app.plotStream.ySize/(app.plotStream.data.yRange.max - app.plotStream.data.yRange.min)) - app.plotStream.data.yRange.min)
        ctx.fillRect(x,y,2,2)
      }

      //Feed the object to all stat functions
      app.stats.forEach((stat)=>{
        stat.process(obj)
      })

      //Store object in the main collection
      if (app.collections.main.display || app.collections.main.save){
        var flatObj = flat(obj)
        for (var prop in flatObj) {
          if (!path.has(app.collections.main.records, prop)) {
            app.collections.main.records[prop] = []
          }
          app.collections.main.records[prop][app.total] = flatObj[prop]
        }
        app.collections.main.length += 1
      }

      app.total += 1
    })

    .on('end', function(){
      app.loading = false
    })
}

function collectionToObjects(collection) {
  var objects = []
  for (var i = 0; i < collection.length; i++ ) {
    var object = {}
    for (var column in collection.records) {
      if (collection.records[column][i] != undefined) {
        object[column] = collection.records[column][i]
      }
    }
    objects.push(object)
  }
  return objects
}

function getCollectionHeader(collection) {
  var header = []
  for (var column in collection.records) {
    header.push(column)
  }
  return header
}

// 4. Save results to a file
function save(collectionName, type) {
  var objects = collectionToObjects(app.collections[collectionName])
  switch (type) {
    case 'csv':
      var header = getCollectionHeader(app.collections[collectionName])
      var blob = new Blob([json2csv({data: objects, fields: header})], {type: "text/plain;charset=utf-8"})
      break
    case 'json':
      var blob = new Blob([JSON.stringify(objects)], {type: "text/plain;charset=utf-8"})
      break
  }
  FileSaver.saveAs(blob, app.streamName.split('.')[0] + '-' + collectionName.toLowerCase() + '.' + type)
}

// Init drag and drop or throw error
if (window.File && window.FileReader && window.FileList && window.Blob) {
  // var a = queryString.parse(queryString.stringify(
  //   {
  //     a:1,
  //     b: 'sadsdd',
  //     c: [1,2,3,4],
  //     d: JSON.stringify({d1: 'ping', d2: 'pong'})
  //   }
  // ))
  // console.log(a.c, JSON.parse(a.d))
  if (location.search) {
    var query = queryString.parse(location.search, {arrayFormat: 'index'})
    Vue.nextTick(function(){
      for (var key in query) {
        if (simpleQuery.indexOf(key) >= 0) {
          switch (typeof app[key]) {
            case 'string':
              app[key] = escape(query[key])
              break
            case 'number':
              app[key] = query[key]
              break
            case 'object':
              for (var i in query[key]) {
                app[key] = escape(query[key])
              }
              break
            case 'boolean':
              app[key] = (query[key].toLowerCase() == 'true')
              break
          }
          // app[key] = query[key]
        }
        else {
          console.log(key,query[key])
          app[key] = JSON.parse(query[key])
        }
      }
      if (query.url) {
        analyzeUrl(query.url, app.httpError)
      }
    })
  } else {
    showApp()
    dnd(document.body, analyzeFiles)
  }
} else {
  alert("Your browser doesn't support File API");
}
