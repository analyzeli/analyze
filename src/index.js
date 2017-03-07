/* Dependencies */
  //Streams
const ReadStream = require('filestream').read
const through2 = require('through2') //Transform stream
const ts = require('ternary-stream') //Conditionally pipe streams
const Combiner = require('stream-combiner') //Combine multiple transform streams into one
const filter = require('stream-filter') //Filter string and obj streams
const split = require('split') //Split a text stream by lines
const csv = require('csv-parser') //Parse CSV stream
const lineParser = require('csv-parse/lib/sync') //Parse CSV line
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
const Querify = require('./querify.js')

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

var querify = new Querify (['run','url','search','searchColumn','strictSearch','structure','charts'])

var rs

var app = new Vue({
  el: '#app',
  data: {
    notifyMessage: '',
    vertical: 'bottom',
    horizontal: 'center',
    duration: 4000,
    chartOptions: {
            lineSmooth: false
    },
    columns: [],
    item: '', //iterative xml node
    delimiter: ',',
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
    isStreamAnalyzed: false,
    isStreamLoadingNow: false,
    wasStreamLoaded: false,
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
    open: function() {
      history.pushState(null, null, '/');
      this.run = false
      this.search = ''
      this.strictSearch = false
      this.structure = {showAll: true,newColumns: []}
      this.charts = []
      this.stats = []
      this.wasStreamLoaded = false
      this.url = ''
      this.file = undefined
      this.resetState()
      this.isStreamAnalyzed = false
    },
    notify: function(message) {
      this.notifyMessage = message
      this.$refs.snackbar.open();
    },
    generateLink: function() {
      var copyLink = document.querySelector('#query')
      copyLink.select()
      var successful = document.execCommand('copy')
      var msg = successful ? 'Copied to the clipboard' : 'Error happened'
      app.notify(msg);
    },
    analyzeFiles: function(event) {
      analyzeFiles(event.target.files)
    },
    resetState: function() {
      this.total = 0
      this.processed = 0
      for (var collectionName in this.collections) {
        this.collections[collectionName].length = 0
        if (collectionName == 'Main') {
          this.collections[collectionName].records = {}
        }
        else {
          var groupCollection = this.collections[collectionName]
          for (var column in groupCollection.records) {
            groupCollection.records[column] = []
          }
        }
      }
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
    },
    stopStream: function() {
      rs.pause()
      rs.unpipe()
      app.isStreamLoadingNow = false
    },
    reloadStream: function() {
      this.resetState()
      if (this.fileSize) {
        rs = new ReadStream(this.file)
        rs.setEncoding('utf8')
        load()
      }
      else if (this.url && this.url.length) {
        http.get(app.url, function (res) {
          rs = res
          rs.setEncoding('utf8')
          load()
        })
      }
    }
  },
  computed: {
    streamName: function() {
      return (this.file !== undefined) ? this.file.name : this.url.slice(this.url.lastIndexOf('/') + 1, this.url.search(/tsv|csv/g) + 3)
    },
    streamInfo: function() {
      return (this.file !== undefined) ? 'Last modified: ' + this.file.lastModifiedDate.toLocaleDateString("en-US") : 'Source: ' + this.url
    },
    selectedColumns: function() {
      return (this.structure.showAll) ? this.columns : this.structure.newColumns
    },
    newQuery: function() {
      if (app.url.length > 0) {
        return location.origin + location.pathname + querify.getQueryString({
          run: 'true',
          url: app.url,
          search: app.search,
          searchColumn: app.searchColumn,
          strictSearch: app.strictSearch,
          structure: app.structure,
          charts: app.charts
        })
      }
    }
  },
  watch: {
    // selectedColumns: function(val) {
    //   this.collections.main.records = {}
    //   val.forEach((column)=>{
    //     this.collections.main.records[column] = []
    //   })
    // }
  }
})

var appInitial = Object.apply({}, app)

// 1.A Prepare stream (from URL)
function analyzeUrl(url, error) {
  if (app.url && app.url.length) {
    error.message = ""
    var readed = false
    var request = http.get(app.url, function (res) {
      rs = res
      rs.setEncoding('utf8')
      if ((app.url.indexOf('csv') > 0) || (app.url.indexOf('tsv' > 0))) {
        app.fileType = 'csv'
      }
      else if (app.url.indexOf('xml') > 0) {
        app.fileType = 'xml'
      }
      getStreamStructure(rs, app.fileType)
    })
    request.on('error', function (e) {
      showApp()
      error.message = e.message
    })
  }
}

// 1.B Prepare stream (from FILE)
function analyzeFiles(files) {
  app.file = files[0]
  app.fileType = (app.file.type.slice(app.file.type.indexOf('/') + 1))
  app.fileSize = app.file.size
  rs = new ReadStream(app.file)
  rs.setEncoding('utf8')
  getStreamStructure(rs, app.fileType)
}

// 2. Calculate data header/structure
function getStreamStructure(rs, type) {
  if (type == 'csv') {
    getCsvStreamStructure(rs, function(columns, delimiter) {
      app.delimiter = delimiter
      processStreamStructure(columns)
    })
  }
  else if (type == 'xml') {
    getXmlStreamStructure(rs, function(columns, item) {
      app.item = item
      processStreamStructure(columns)
    })
  }
}

// 2.1 Store data structure, trigger loader if needed
function processStreamStructure (columns) {
  app.columns = columns.slice(0)
  app.isStreamAnalyzed = true
  if (app.searchColumn.length == 0) app.searchColumn = app.columns[0]
  if (app.url && app.url.length && app.run) {
    Vue.nextTick(function(){
      load()
    })
  }
  showApp()
}

// 3.0.1
function filterTextStream() {
  var header = true
  return filter(function(line){
    var l = app.searchArr.length
    var found = (l == 0)
    var i = 0

    if ((header) && (app.fileType == 'csv')) {
      header = false
      return true
    }
    while ((!found) && (i < l)) {
     found = found || (line.indexOf(app.searchArr[i]) >= 0)
     i+=1
    }
    return found
  })
}

// 3.0.4 Object filter stream
function filterObjectStream() {
  return filter.obj(function(obj){
    var l = app.searchArr.length
    var found = (l == 0)
    var i = 0
    var value = path.get(obj, app.searchColumn)
    while ((!found) && (i < l)) {
     found = found || ((app.strictSearch == true) && (value == app.searchArr[i])) || ((app.strictSearch == false) && (value.indexOf(app.searchArr[i]) >= 0))
     i+=1
    }
    return found
  })
}

// 3.0.5 Object restructuring stream
function restructureObjectStream(columns) {
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
  app.isStreamLoadingNow = true // Currently loading stream
  app.wasStreamLoaded = true // Stream already opened (for Reload)
  app.searchArr = (app.search.length > 0)
                ? app.search.split(',').map((el)=>el.trim())
                : []

  if (app.plotStream.display) {
    var canvas = document.getElementById('canvas')
    var ctx = canvas.getContext('2d')
    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0,0,app.plotStream.xSize,app.plotStream.ySize)
  }

  var parsingStream = (app.fileType =='csv')
  ? Combiner([
      split((line) => line + '\n'),
      filterTextStream(),
      csv({
        raw: false,     // do not decode to utf-8 strings
        separator: app.delimiter, // specify optional cell separator
        quote: '"',     // specify optional quote character
        escape: '"',    // specify optional escape character (defaults to quote value)
        newline: '\n',  // specify a newline character
        strict: true    // require column length match headers length
      })
    ])
  : Combiner([
      xmlNodes(app.item),
      filterTextStream(),
      xmlObjects({
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: false
      })
    ])

  var byteStep = app.fileSize / 500

  rs
    .pipe(through2(function (chunk, enc, callback) {
      app.processed += chunk.length
      if (app.fileSize) {
        var prevBytes = 0
        if ((app.processed - prevBytes) > byteStep) {
          app.w = ((app.processed / app.fileSize) * 100).toFixed(1)
          prevBytes = app.processed
        }
      }
      this.push(chunk)
      callback()
    }), { end: false })
    .pipe(parsingStream, { end: false })
    .pipe(filterObjectStream(), { end: false })
    .pipe(restructureObjectStream(app.structure.newColumns), { end: false })
    .on('data', function(obj) {

    //Here the pipeline throws parsed, filtered, not flat objects
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
          if (app.collections.main.records[prop] === undefined) {
            app.collections.main.records[prop] = []
          }
          app.collections.main.records[prop][app.total] = flatObj[prop]
        }
        app.collections.main.length += 1
      }

      app.total += 1
    })

  rs.on('end', function(){
      app.notify('All data loaded')
      app.isStreamLoadingNow = false
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
  if (location.search) {
    var queryObj = querify.getQueryObject(location.search)
    Vue.nextTick(function(){
      app = Object.assign(app, queryObj)
      analyzeUrl(app.url, app.httpError)
    })
  } else {
    showApp()
    dnd(document.body, analyzeFiles)
  }
} else {
  alert("Your browser doesn't support File API");
}
