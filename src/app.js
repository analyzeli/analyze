// Streams reading and transformation
const ReadStream = require('filestream').read
const through2 = require('through2') // Transform stream
const filter = require('stream-filter') // Filter string and obj streams
const FileSaver = require('file-saver')
const http = require('stream-http') // XHR as a stream
const getCsvStreamStructure = require('./utils/get-csv-stream-structure.js') // Get CSV header
const getXmlStreamStructure = require('./utils/get-xml-stream-structure.js') // Get XML nodes and repeated node
const splitStream = require('./utils/split-stream')
const parseStream = require('./utils/parse-stream')
// const xmlObjects = require('xml-objects') // Parse XML
// const csv = require('csv-parser') // Parse CSV
// const Combiner = require('stream-combiner') // Combine multiple transform streams into one
// const ts = require('ternary-stream') // Conditionally pipe streams
// const split = require('split') // Split a text stream by lines
// const lineParser = require('csv-parse/lib/sync') // Parse CSV line
// const xmlNodes = require('xml-nodes')

// Objects
const flat = require('flat')
const path = require('object-path') // Acess nested object properties with a variable
const json2csv = require('json2csv') // Convert array of objects to CSV
// const saveToCollection = require('./save-to-collection.js')
// const escape = require('html-escape') // Sanitize url

// Stats
const dnd = require('drag-and-drop-files') // Handle Drag and Drop events
// const group = require('./group.js') //Group by a properties

// Other
const Querify = require('./utils/querify.js')
// const queryString = require('query-string')

function showApp () {
  document.getElementById('app-loader').style.display = 'none'
  document.getElementById('app').style.removeProperty('display')
}

class Chart {
  constructor (type, id) {
    this.name = type + '.' + id
    this.type = type
    this.inputCollection = ''
    this.inputColumn = ''
    this.labelColumn = ''
  }
}

const TopK = require('./stat/topk')
// var Group = require('./stat/group')
const Stats = {TopK}
const querify = new Querify(['run', 'url', 'search', 'searchColumn', 'strictSearch', 'structure', 'charts'])

// Read stream
let rs

// const streams = []
/*
function preload (event) {
  const app = this // context: app object

  // If event exists - it's a file input.
  if (event) {
    // Store file info in app's data
    app.file = event.target.files[0]
    app.fileType = (app.file.type.slice(app.file.type.indexOf('/') + 1))
    app.fileSize = app.file.size
    // Initialize read stream
    rs = loadFiles()
  } else {
    // Preload was launched without arguments - source is url
    // ...
  }
  getStreamStructure(rs, app.fileType)
}
*/

// 1a. Prepare stream (from URL)
function analyzeUrl (url, error) {
  const app = this
  if (app.url && app.url.length) {
    error.message = ''
    var request = http.get(app.url, function (res) {
      rs = res
      rs.setEncoding('utf8')
      if ((app.url.indexOf('csv') > 0) || (app.url.indexOf('tsv' > 0))) {
        app.fileType = 'csv'
      } else if (app.url.indexOf('xml') > 0) {
        app.fileType = 'xml'
      }
      app.getStreamStructure(rs, app.fileType)
    })
    request.on('error', function (e) {
      showApp()
      error.message = e.message
    })
  }
}

// 1b. Prepare stream (from FILE)
// Creates a source object for each file, adds them to array of new sources, calls universal function loadSources

function loadFiles (event) {
  const app = this
  const files = event.target.files
  const newSources = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const source = {
      file: file, // file object
      name: file.name, // name of the source
      type: file.type.slice(file.type.indexOf('/') + 1), // file type (csv or xml)
      size: file.size, // size
      stream: new ReadStream(file), // node readable stream
      counter: 0 // number of rows readed
    }
    source.stream.setEncoding('utf8')
    newSources.push(source)
  }

  app.loadSources(newSources)

  /*
  app.file = event.target.files[0]
  app.fileType = (app.file.type.slice(app.file.type.indexOf('/') + 1))
  app.fileSize = app.file.size
  rs = new ReadStream(app.file)
  rs.setEncoding('utf8')
  app.getStreamStructure(rs, app.fileType)
  */
}

// Calculate data header/structure
function getStreamStructure (rs, type) {
  return new Promise((resolve, reject) => {
    if (type === 'csv') {
      getCsvStreamStructure(rs, function (columns, delimiter) {
        resolve({columns, delimiter})
      })
    } else if (type === 'xml') {
      getXmlStreamStructure(rs, function (columns, item) {
        resolve({columns, item})
      })
    }
  })
}

// Here we have sources and their streams. Not files or urls.
async function loadSources (sources) {
  const app = this
  for (let source of sources) {
    const structure = await getStreamStructure(source.stream, source.type)
    source = Object.assign(source, structure)
    console.log(source)
    const collection = {
      length: 0, // length
      display: true, // display table
      save: true, // can save
      records: {}, // actual table records
      name: source.name, // name, same as source name
      source: source // collection info source
    }
    app.sources.push(source)
    app.loadSource(source, collection)
    app.collections.unshift(collection)
    // app.showCollection(app.collections.length - 1) // show latest added collection
    console.log('Switch to collection: ', app.activeCollection)
  }
  app.states.loader = false

  document.addEventListener('scroll', function () {
    if ((document.body.scrollHeight - window.innerHeight - window.scrollY) < 100) {
      console.log('Loading more data...')
      app.collections[app.activeCollection].source.counter = 0
      app.collections[app.activeCollection].source.previewStream.resume()
      // rs.resume()
    }
  }, false)
  // showApp()
}

// 2.1 Store data structure, trigger loader if needed
function loadSource (source, collection) {
  // const app = this
  // source.isStreamAnalyzed = true
  // if (app.searchColumn.length === 0) app.searchColumn = app.columns[0]
  /*
  if (app.url && app.url.length && app.run) {
    setTimeout(function () {
      load()
    }, 200)
  }
  */

  // We need extra stream (previewStream) to be able pause/resume it.
  // If we just pause readable stream that is piped to transform streams,
  // it will miss huge buffer chunks
  source.previewStream = source.stream
    .pipe(splitStream(source.type, source.item), { end: false }) // Split text stream into text blocks (one for each record)
    .pipe(parseStream(source.type, source.delimiter), { end: false }) // 'end' <boolean> End the writer when the reader ends. Defaults to true

  //
  source.previewStream.on('data', function (obj) {
    // If stream sends data read it anyway. Not to miss between line
    const flatObj = flat(obj)
    for (let prop in flatObj) {
      if (collection.records[prop] === undefined) {
        collection.records[prop] = []
      }
      collection.records[prop].push(flatObj[prop])
    }
    collection.length += 1

    // Check counter
    if (source.counter < 50) {
      source.counter += 1
    } else {
      source.previewStream.pause()
    }
  })
}

/*
function getStreamStructure (rs, type) {
  const app = this
  if (type === 'csv') {
    getCsvStreamStructure(rs, function (columns, delimiter) {
      app.delimiter = delimiter
      app.processStreamStructure(columns)
    })
  } else if (type === 'xml') {
    getXmlStreamStructure(rs, function (columns, item) {
      app.item = item
      app.processStreamStructure(columns)
    })
  }
}
*/

// Load some more data when scroll to bottom
/*
function resumeStreamIfBottom () {
  if ((document.body.scrollHeight - window.innerHeight - window.scrollY) < 100) {
    counter = 0
    rs.resume()
  }
}
*/

// 2.1 Store data structure, trigger loader if needed
function processStreamStructure (columns) {
  const app = this
  app.columns = columns.slice(0)
  app.isStreamAnalyzed = true
  if (app.searchColumn.length === 0) app.searchColumn = app.columns[0]
  if (app.url && app.url.length && app.run) {
    setTimeout(function () {
      load()
    }, 200)
  }
  showApp()

  // Preload data
  rs
    .pipe(splitStream(app.fileType, app.item), { end: false }) // Split text stream into text blocks (one for each record)
    .pipe(parseStream(app.fileType, app.delimiter), { end: false }) // 'end' <boolean> End the writer when the reader ends. Defaults to true
    .on('data', function (obj) {
      if (counter < 50) {
        counter += 1
        var flatObj = flat(obj)
        for (var prop in flatObj) {
          if (app.collections.main.records[prop] === undefined) {
            app.collections.main.records[prop] = []
          }
          app.collections.main.records[prop].push(flatObj[prop])
        }
        app.collections.main.length += 1
      } else {
        rs.pause()
      }
    })

  document.addEventListener('scroll', resumeStreamIfBottom, false)
}

// 3. Process stream
function load () {
  let app = this
  app.isStreamLoadingNow = true // Currently loading stream
  app.wasStreamLoaded = true // Stream already opened (for Reload)
  app.searchArr = (app.search.length > 0)
    ? app.search.split(',').map((el) => el.trim())
    : []

  // Remove 'scroll' event listener that resumes stream
  document.removeEventListener('scroll', resumeStreamIfBottom)

  // Initialize all stream algorithms
  app.stats.forEach((stat) => {
    // if (typeof stat.init === 'function')
    stat.init()
  })

  if (app.plotStream.display) {
    var canvas = document.getElementById('canvas')
    var ctx = canvas.getContext('2d')
    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, app.plotStream.xSize, app.plotStream.ySize)
  }

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
    .pipe(splitStream(app.fileType, app.item), { end: false }) // Split text stream into text blocks (one for each record)
    .pipe(filterTextStream(app.searchArr, app.fileType), { end: false }) // Filter text blocks if needed
    .pipe(parseStream(app.fileType, app.delimiter), { end: false }) // 'end' <boolean> End the writer when the reader ends. Defaults to true
    .pipe(filterObjectStream(app.searchArr, app.searchColumn, app.strictSearch), { end: false })
    .pipe(restructureObjectStream(app.structure.newColumns, app.structure.showAll), { end: false })
    .on('data', function (obj) {
      // Here the pipeline throws parsed, filtered, not flat objects
      // Plot stream
      if (app.plotStream.display) {
        ctx.fillStyle = '#000'
        var x = parseFloat(path.get(obj, app.plotStream.data.xColumn)) * (app.plotStream.xSize / (app.plotStream.data.xRange.max - app.plotStream.data.xRange.min)) - app.plotStream.data.xRange.min
        var y = app.plotStream.ySize - (parseFloat(path.get(obj, app.plotStream.data.yColumn)) * (app.plotStream.ySize / (app.plotStream.data.yRange.max - app.plotStream.data.yRange.min)) - app.plotStream.data.yRange.min)
        ctx.fillRect(x, y, 2, 2)
      }

      // Feed the object to all stat functions
      app.stats.forEach((stat) => {
        stat.process(obj)
      })

      // Store object in the main collection
      if (app.collections.main.display || app.collections.main.save) {
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

  rs.on('end', () => {
    app.notify('All data loaded')
    app.isStreamLoadingNow = false
  })
}

// 3.0.1
function filterTextStream (searchArr, fileType) {
  let header = true
  return filter((line) => {
    let l = searchArr.length
    let found = (l === 0)
    let i = 0
    if ((header) && (fileType === 'csv')) {
      header = false
      return true
    }
    while ((!found) && (i < l)) {
      found = found || (line.indexOf(searchArr[i]) >= 0)
      i += 1
    }
    return found
  })
}

// 3.0.4 Object filter stream
function filterObjectStream (searchArr, searchColumn, strictSearch) {
  return filter.obj((obj) => {
    const l = searchArr.length
    const value = path.get(obj, searchColumn)
    let found = (l === 0)
    let i = 0
    while ((!found) && (i < l)) {
      found = found || ((strictSearch === true) && (value === searchArr[i])) || ((strictSearch === false) && (value.indexOf(searchArr[i]) >= 0))
      i += 1
    }
    return found
  })
}

// Open new file or url
function open () {
  const app = this
  // window.history.pushState(null, null, '/analyze/')
  app.states.loader = true
  /*
  app.search = ''
  app.run = false
  app.searchArr = []
  app.strictSearch = false
  app.structure = {showAll: true, newColumns: []}
  app.charts = []
  app.stats = []
  app.wasStreamLoaded = false
  app.url = ''
  app.file = undefined
  app.resetState()
  app.isStreamAnalyzed = false
  */
}

// Show notification
function notify (message) {
  const app = this
  app.notifyMessage = message
  app.$refs.snackbar.open()
}

// Select query string and copy to clipboard
function generateLink () {
  const app = this
  document.querySelector('#query').select()
  const successful = document.execCommand('copy')
  const msg = successful ? 'Copied to the clipboard' : 'Error happened'
  app.notify(msg)
}

function resetState () {
  const app = this
  app.total = 0
  app.processed = 0
  for (var collectionName in app.collections) {
    app.collections[collectionName].length = 0
    if (collectionName.toLowerCase() === 'main') {
      app.collections[collectionName].records = {}
    } else {
      const groupCollection = app.collections[collectionName]
      for (let column in groupCollection.records) {
        groupCollection.records[column] = []
      }
    }
  }
}

var appOptions = {
  data: function () {
    return {
      sources: [],
      states: {
        loader: true,
        progress: false
      },
      notifyMessage: '',
      vertical: 'bottom',
      horizontal: 'center',
      duration: 4000,
      chartOptions: {
        lineSmooth: false
      },
      columns: [],
      item: '', // Iterative xml node
      delimiter: ',',
      search: '',
      searchArr: [],
      searchColumn: '',
      strictSearch: true,
      processed: 0,
      total: 0, // Total records loaded to memory
      structure: {
        showAll: true,
        newColumns: []
      },
      activeCollection: 0,
      collections: [],
      /*
      collections: {
        main: {
          length: 0,
          display: true,
          save: true,
          records: {},
          name: 'Main'
        }
      },
      */
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
      // statTypes: ['Group'],
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
    }
  },
  methods: {
    load,
    save,
    open,
    notify,
    generateLink,
    loadFiles,
    loadSources,
    loadSource,
    getStreamStructure,
    processStreamStructure,
    resetState,
    showCollection (i) {
      console.log('Switching to collection: ', i)
      this.activeCollection = i
    },
    addStat: function (type) {
      var newStat = new Stats[type]()
      newStat.name = type + '.' + (this.stats.length + 1)
      this.stats.push(newStat)
      this.collections[newStat.name] = newStat.output
      this.collections[newStat.name].display = true
      this.collections[newStat.name].save = true
      this.collections[newStat.name].name = newStat.name + '.Output'
    },
    removeStat: function (index) {
      delete this.collections[this.stats[index].name]
      this.stats.splice(index, 1)
    },
    addChart: function (type) {
      this.charts.push(new Chart(type, this.charts.length))
    },
    removeChart: function (index) {
      this.charts.splice(index, 1)
    },
    analyzeUrl,
    analyzeUrlFromInput: function () {
      this.analyzeUrl(this.url, this.httpError)
    },
    stopStream: function () {
      rs.pause()
      rs.unpipe()
      this.isStreamLoadingNow = false
    },
    reloadStream: function () {
      // Remove event listener that auto resumes stream when bottom of a page reached
      let app = this
      document.removeEventListener('scroll', resumeStreamIfBottom)
      this.resetState()
      if (this.fileSize) {
        rs = new ReadStream(this.file)
        rs.setEncoding('utf8')
        app.load()
      } else if (this.url && this.url.length) {
        http.get(app.url, function (res) {
          rs = res
          rs.setEncoding('utf8')
          app.load()
        })
      }
    }
  },
  computed: {
    statTypes () {
      return Object.keys(Stats)
    },
    streamName () {
      return (this.file !== undefined) ? this.file.name : this.url.slice(this.url.lastIndexOf('/') + 1, this.url.search(/tsv|csv/g) + 3)
    },
    streamInfo () {
      return (this.file !== undefined) ? 'Last modified: ' + this.file.lastModifiedDate.toLocaleDateString('en-US') : 'Source: ' + this.url
    },
    selectedColumns () {
      return (this.structure.showAll) ? this.columns : this.structure.newColumns
    },
    newQuery () {
      let app = this
      if (app.url.length > 0) {
        return window.location.origin + window.location.pathname + querify.getQueryString({
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
  },
  mounted () {
    // Init drag and drop or throw error
    let app = this
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      if (window.location.search) {
        var queryObj = querify.getQueryObject(window.location.search)
        setTimeout(function () {
          app = Object.assign(app, queryObj)
          app.analyzeUrl(app.url, app.httpError)
        }, 100)
      } else {
        showApp()
        dnd(document.body, (files) => {
          app.loadFiles({target: {files}})
        })
      }
    } else {
      window.alert(`Your browser doesn't support File API`)
    }
  }
}

// var appInitial = Object.apply({}, appOptions)

// 3.0.5 Object restructuring stream
function restructureObjectStream (columns, showAllColumns) {
  return through2.obj(function (obj, enc, callback) {
    if ((columns.length > 0) && (!showAllColumns)) {
      var structuredObj = {}
      columns.forEach((el) => {
        path.set(structuredObj, el, path.get(obj, el))
      })
      this.push(structuredObj)
    } else {
      this.push(obj)
    }
    callback()
  })
}

function collectionToObjects (collection) {
  var objects = []
  for (var i = 0; i < collection.length; i++) {
    var object = {}
    for (var column in collection.records) {
      if (collection.records[column][i] !== undefined) {
        object[column] = collection.records[column][i]
      }
    }
    objects.push(object)
  }
  return objects
}

function getCollectionHeader (collection) {
  var header = []
  for (var column in collection.records) {
    header.push(column)
  }
  return header
}

// 4. Save results to a file
function save (collectionName, type) {
  let app = this
  var objects = collectionToObjects(app.collections[collectionName])
  var blob
  switch (type) {
    case 'csv':
      var header = getCollectionHeader(app.collections[collectionName])
      blob = new window.Blob([json2csv({data: objects, fields: header})], {type: 'text/plain;charset=utf-8'})
      break
    case 'json':
      blob = new window.Blob([JSON.stringify(objects)], {type: 'text/plain;charset=utf-8'})
      break
  }
  FileSaver.saveAs(blob, app.streamName.split('.')[0] + '-' + collectionName.toLowerCase() + '.' + type)
}

module.exports = appOptions
