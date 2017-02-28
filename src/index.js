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
  //Objects
const flat = require('flat')
const path = require('object-path') //Acess nested object properties with a variable
const saveToCollection = require('./save-to-collection.js')
const json2csv = require('json2csv') //Convert array of objects to CSV
  //Stats
const group = require('./group.js') //Group by a properties
  //Vis
const Vue = require('vue')
const VueMaterial = require('vue-material')
const Chartist = require('vue-chartist')
const dnd = require('drag-and-drop-files') //Handle Drag and Drop events
// const chart = require('chart.js')

window.onload = function(e){
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

var app = new Vue({
  el: '#app',
  data: {
    chartData: {
            labels: ["A", "B", "C"],
            series:[[1, 3, 2]]
    },
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
    url: undefined,
    httpError: '',
    file: undefined,
    fileSize: 0,
    loading: false,
    w: 0,
    statTypes: ['Group','Median'],
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
    analyze: function(event) {
      analyze(event.target.files)
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
    checkUrl: function() {
      var readed = false
      var request = http.get(app.url, function (res) {
          res.on('readable', function () {
              if (!readed) {
                var r = res.read(5)
                readed = true
              console.log('1',r+'')
              res.unshift(r)
              r = res.read(5)
              console.log('2',r+'')
              console.log('BREAK')
            }
              // analyze(res)
          });
          res.on('end', function () {
          });
      })
      request.on('error', function (e) {
        app.httpError = e.message
      })
    }
  },
  computed: {
    selectedColumns: function() {
      return (this.structure.showAll) ? this.columns : this.structure.newColumns
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

var csvParser = csv({
  raw: false,     // do not decode to utf-8 strings
  separator: ',', // specify optional cell separator
  quote: '"',     // specify optional quote character
  escape: '"',    // specify optional escape character (defaults to quote value)
  newline: '\n',  // specify a newline character
  strict: true    // require column length match headers length
})

var meter = Meter()

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
      console.log(line+'')
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

  var rs = new ReadStream(app.file, {
    chunkSize: 1024*100
  })
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

      //Process stats
      // stats = {
      //   "Stat1": {
      //     input: ["FirstName"],
      //     output: {}
      //     process: function(obj) {
      //       group(obj)
      //     },
      //   }
      // }

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
      console.log(app.collections.main)
      app.loading = false
    })
}

function analyzeCSV(stream, cb) {
  var head = '' //some bytes of the file
  stream.on('readable', function() {
    if (head.length == 0) {
      var chunk = ''
      while ('\n' != (chunk = stream.read(1))) {
        head += chunk
      }
      cb(lineParser(head)[0])
    }
  })
}

function analyzeXML(stream, cb) {
  var head = ''
  stream.on('readable', function() {
    if (head.length == 0) {
    //Pre-process XML
      var itemsReaded = 0
      var node = ''
      var item = ''
      var nodes = []
      var columns = []
      var saveNode = false
      var chunk = ''
      while ((itemsReaded < 10) && (null != (chunk = stream.read(1)))) {
        head += chunk
        //Adding node
        if ((saveNode) && ((chunk == '>') || (chunk == ' '))) {
          saveNode = false

          item = ''
          itemsReaded = 0
          nodes.push(node)

          for (var i = 0; i < nodes.length - 1; i++) {
            if ((nodes.indexOf(nodes[i],i+1) > 0) && (item.length == 0)) {
              item = nodes[i]
              itemsReaded = 2
              //console.log(nodes)
            }
            else if ((item.length > 0) && (nodes[i] == item)) {
              itemsReaded += 1
            }
          }
          //console.log(node,item,itemsReaded)
          node = ''
        }

        //End of node name
        if ((saveNode) && ((chunk == '/') || (chunk == '?'))) {
          saveNode = false
        }

        //Reading node name
        if ((saveNode) && (chunk != '/')) {
          node += chunk + ''
        }

        //Start of node
        if (chunk == '<') {
          saveNode = true
        }

      } //end of while
      if (item.length == 0) { item = nodes[0] }
      //console.log(item, head)
      var xmlPreParser = xmlNodes(item)
      xmlPreParser.write(head)
      xmlPreParser.push(null)
      xmlPreParser.pipe(xmlObjects({explicitRoot: false, explicitArray: false, mergeAttrs: true, ignoreAttrs: true}))
                  .on('data',function(obj){
                    // console.log(obj)
                    var arr = []
                    for (var prop in flat(obj)) {
                      arr.push(prop)
                    }
                    if (columns.length < arr.length) {
                      columns = arr.slice(0)
                    }
                  })
                  .on('end', function() {
                    cb(columns, item)
                  })
    } //end of if head
  })
}

function analyze(files) {

  app.file = files[0]
  console.log(app.file)
  app.fileType = (app.file.type.slice(app.file.type.indexOf('/') + 1))
  app.fileSize = app.file.size

  var rs = new ReadStream(app.file)
  rs.setEncoding('utf8')

  //Pre-process CSV if nothing readed
  if (app.fileType == 'csv') {
    analyzeCSV(rs, function(columns) {
      app.columns = columns.slice(0)
      app.searchColumn = app.columns[0]
    })
  }
  else if (app.fileType == 'xml') {
    analyzeXML(rs, function(columns, item) {
      app.columns = columns.slice(0)
      app.searchColumn = app.columns[0]
      app.item = item
    })
  }
}

function collectionToObjects(collection) {
  var objects = []
  for (var i = 0; i < collection.length; i++ ) {
    var object = {}
    for (column in collection.records) {
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
  for (column in collection.records) {
    header.push(column)
  }
  return header
}

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
  FileSaver.saveAs(blob, app.file.name.split('.')[0] + '-' + collectionName.toLowerCase() + '.' + type)
}

if (window.File && window.FileReader && window.FileList && window.Blob) {
  dnd(document.body, analyze)
} else {
  alert("Your browser doesn't support File API");
}
