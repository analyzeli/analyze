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
const json2csv = require('json2csv') // Convert array of objects to CSV
// const path = require('object-path') // Acess nested object properties with a variable -- everything is flat now
// const saveToCollection = require('./save-to-collection.js')
// const escape = require('html-escape') // Sanitize url

// Stats
const dnd = require('drag-and-drop-files') // Handle Drag and Drop events
// const group = require('./group.js') //Group by a properties

// Other
const Querify = require('./utils/querify.js')
// const queryString = require('query-string')

const CHUNKSIZE = 100 * 1024 // Set chunk size fixed for all file sizes

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

class Source {
  constructor (params) {
    // this.stream = params.stream
    // this.stream.setEncoding('utf8')
    this.name = params.name
    this.type = params.type
    this.preview = params.preview
    this.counter = 0 // how many lines loaded in preview mode
    this.storable = true
    this.loading = false // flag to show that stream is in progress
    this.processed = 0 // how many bytes processed, bytes
    this.progress = 0 // process progress, %

    if (params.url) {
    // Source from URL
      this.url = params.url
    } else {
    // Source from local files
      this.file = params.file
      this.size = params.size
    }

    // Filter
    this.filters = []

    // Columns
    this.columns = []
    this.newColumns = []
    this.showAllColumns = true

    // Formulas
    this.formulas = []

    // Split
    this.split = {}

    // Stats
    this.stats = []

    // Merge
    this.merge = {}

    // Add first filter
    this.addFilter()
  }
  // *constructor

  addFilter () {
    this.filters.push({
      column: '',
      value: '',
      strict: false,
      range: false,
      from: 0,
      to: 0
    })
  }

  removeFilter (i) {
    this.filters.splice(i, 1)
  }
}

class Collection {
  constructor (source) {
    this.length = 0 // length
    this.display = true // display table
    this.save = true // can save
    this.records = {} // actual table records
    this.source = source // collection info source
    this.name = source.name.split('.')[0] // name, same as source name
  }
}

const TopK = require('./stat/topk')
// var Group = require('./stat/group')
const Stats = {TopK}
const querify = new Querify(['run', 'url', 'search', 'searchColumn', 'strictSearch', 'structure', 'charts'])

// Prepare source (from URL)
function loadUrl () {
  const app = this
  if (app.url && app.url.length) {
    console.log('Loading URL: ', app.url)
    const source = new Source({
      url: app.url,
      name: app.url.slice(app.url.lastIndexOf('/') + 1, app.url.search(/tsv|csv|xml/g) + 3),
      type: ((app.url.indexOf('csv') > 0) || (app.url.indexOf('tsv' > 0)))
        ? 'csv'
        : 'xml',
      preview: true
    })

    // app.loadSources() accepts arrays, so wrap one URL-based source in an array
    app.loadSources([source])
  }
}

// Prepare source (from FILE)
// Creates a source object for each file, adds them to array of new sources, calls universal function loadSources
function loadFiles (files) {
  console.log('Loading files: ', files)
  const app = this
  const newSources = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const source = new Source({
      file: file, // file object
      name: file.name, // name of the source
      type: file.type.slice(file.type.indexOf('/') + 1), // file type (csv or xml)
      size: file.size, // size
      // stream: new ReadStream(file), // node readable stream
      preview: true // source just opened, preload it when scroll
    })
    newSources.push(source)
  }

  app.loadSources(newSources)
}

// Creates a stream based on file object or url
function createStream (f) {
  return new Promise((resolve, reject) => {
    let stream
    if (f.size) {
      stream = new ReadStream(f, {chunkSize: CHUNKSIZE})
      stream.setEncoding('utf8')
      resolve(stream)
    } else if (f.length) {
      const request = http.get(f, function (res) {
        console.log('Response: ', res)
        if (res.statusCode === 200) {
          stream = res
          stream.setEncoding('utf8')
          resolve(stream)
        } else {
          console.log('Error: ', res.statusCode, res.statusMessage)
          reject(new Error(res.statusMessage))
        }
      })
      request.on('error', function (e) {
        console.log('Error: ', e)
        reject(e)
      })
    }
  })
}

// Calculates data header/structure
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

// --> Transform -->
// Filter text string (array of values to find)
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

// --> Transform -->
// Filter object stream (range)
function flatObjectStream () {
  return through2.obj(function (obj, enc, callback) {
    this.push(flat(obj))
    callback()
  })
}

// --> Transform -->
// Filter object stream (array of values to find)
function filterObjectStream (searchArr, searchColumn, strictSearch) {
  return filter.obj((obj) => {
    const l = searchArr.length
    // const value = path.get(obj, searchColumn)
    const value = obj[searchColumn] // path.get produced errors when working with folumns that contained '.'
    let found = (l === 0)
    let i = 0
    while ((!found) && (i < l)) {
      found = found || ((strictSearch === true) && (value === searchArr[i])) || ((strictSearch === false) && (value.indexOf(searchArr[i]) >= 0))
      i += 1
    }
    return found
  })
}

// --> Transform -->
// Filter object stream (range)
function filterObjectStreamByRange (from, to, searchColumn) {
  return filter.obj((obj) => {
    // const value = parseFloat(path.get(obj, searchColumn))
    const value = parseFloat(obj[searchColumn])
    const f = parseFloat(from)
    const t = parseFloat(to)
    return (t <= f) || ((value >= f) && (value <= t))
  })
}

// --> Transform -->
// Restructure flat object stream
function restructureObjectStream (newColumns, showAllColumns) {
  return through2.obj(function (obj, enc, callback) {
    if ((newColumns.length > 0) && (!showAllColumns)) {
      const newObj = {}
      newColumns.forEach((column) => {
        // path.set(structuredObj, column, path.get(obj, el))
        newObj[column] = obj[column]
      })
      this.push(newObj)
    } else {
      this.push(obj)
    }
    callback()
  })
}

// Here we have sources, create streams, get approximate structure (columns).
async function loadSources (sources) {
  const app = this
  for (let source of sources) {
    // Create readable streams
    try {
      source.stream = await createStream((source.file) ? source.file : source.url)
    } catch (e) {
      app.showError(e.message)
    }
    //  app.showError(e.message)
    // Detect structure (columns)
    const structure = await getStreamStructure(source.stream, source.type)
    source = Object.assign(source, structure)
    // By default, restructured collection has the same structure
    source.newColumns = source.columns.slice(0)
    // Add a new source to app.sources
    app.sources.push(source)
    // Preview source
    app.previewSource(source)
    // app.showCollection(app.collections.length - 1) // show latest added collection
  }
  // Hide file dialog
  app.states.loader = false
}

// Store data structure, trigger loader if needed
function previewSource (source) {
  // source.isStreamAnalyzed = true
  // if (app.searchColumn.length === 0) app.searchColumn = app.columns[0]
  /*
  if (app.url && app.url.length && app.run) {
    setTimeout(function () {
      load()
    }, 200)
  }
  */
  const app = this

  // Create new collection for the source
  const collection = new Collection(source)
  collection.name += '(preview)'

  // Indicate that it's a preview collection
  collection.preview = true
  app.collections.push(collection)
  app.showCollection(app.collections.length - 1)

  // We need extra stream (previewStream) to be able pause/resume it.
  // If we just pause readable stream that is piped to transform streams,
  // it will miss huge buffer chunks
  source.previewStream = source.stream
    .pipe(splitStream(source.type, source.item), { end: false }) // Split text stream into text blocks (one for each record)
    .pipe(parseStream(source.type, source.delimiter), { end: false }) // 'end' <boolean> End the writer when the reader ends. Defaults to true
    .pipe(flatObjectStream(), { end: false })

  source.previewStream.on('data', function (obj) {
    // If stream sends data read it anyway. Not to miss between line
    for (let prop in obj) {
      if (collection.records[prop] === undefined) {
        collection.records[prop] = []
      }
      collection.records[prop].push(obj[prop])
    }
    collection.length += 1

    // Check counter
    if (source.counter < 49) {
      source.counter += 1
    } else {
      source.previewStream.pause()
    }
  })

  app.notify('Preview opened. Scroll to load more...')
}

// Process source
async function process (source) {
  let app = this

  console.log('Processing source:', source.name)

  source.loading = true // Currently stream is loading
  source.progress = 0 // Nullify the progress
  source.processed = 0 // Nullify the processed byte counter

  // Create a new collection
  const collection = new Collection(source)
  if (source.filters.length) collection.name += '(f' + source.filters.length + ')'
  if (source.columns.length !== source.newColumns.length) collection.name += '(s' + source.newColumns.length + ')'
  app.collections.push(collection)
  app.showCollection(app.collections.length - 1)

  // Create a new readable stream to preserve preview stream
  source.stream2 = await createStream((source.file) ? source.file : source.url)

  // Initialize all stream algorithms
  /*
  app.stats.forEach((stat) => {
    // if (typeof stat.init === 'function')
    stat.init()
  })
  */

  /*
  if (app.plotStream.display) {
    var canvas = document.getElementById('canvas')
    var ctx = canvas.getContext('2d')
    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, app.plotStream.xSize, app.plotStream.ySize)
  }
  */

  const byteStep = source.size / 500

  // Create main stream, calculate progress, split on pieces
  source.mainStream = source.stream2
    // .pipe(block({ size: 1024 * 100, zeroPadding: true })) // -- no need (readfile accepts param chunkSize)
    .pipe(through2(function (chunk, enc, callback) {
      source.processed += chunk.length
      if (source.size) {
        let prevBytes = 0
        if ((source.processed - prevBytes) > byteStep) {
          source.progress = ((source.processed / source.size) * 100).toFixed(1)
          prevBytes = app.processed
        }
      }
      this.push(chunk)
      callback()
    }), { end: false })
    .pipe(splitStream(source.type, source.item), { end: false }) // Split text stream into text blocks (one for each record)

  // Hard filters
  source.filters.forEach(filter => {
    if (!filter.range) {
      filter.valueArr = (filter.value.length > 0)
        ? filter.value.split(',').map((el) => el.trim())
        : []
      source.mainStream = source.mainStream
        .pipe(filterTextStream(filter.valueArr, source.type), { end: false }) // Filter text blocks if needed
    }
  })

  // Parsing
  source.mainStream = source.mainStream
    .pipe(parseStream(source.type, source.delimiter), { end: false }) // 'end' <boolean> End the writer when the reader ends. Defaults to true

  // Flat XML tree-like objects
  if (source.type === 'xml') {
    source.mainStream = source.mainStream
      .pipe(flatObjectStream(), { end: false })
  }

  // Soft filters
  source.filters.forEach(filter => {
    if (!filter.range) {
      source.mainStream = source.mainStream
        .pipe(filterObjectStream(filter.valueArr, filter.column, filter.strict), { end: false })
    } else if (filter.range) {
      source.mainStream = source.mainStream
        .pipe(filterObjectStreamByRange(filter.from, filter.to, filter.column), { end: false })
    }
  })

  // Restructure, manual processing
  source.mainStream = source.mainStream
    .pipe(restructureObjectStream(source.newColumns, source.showAllColumns), { end: false })

  source.mainStream.on('data', function (obj) {
    // Here the pipeline throws parsed, filtered, not flat objects
    // Plot stream
    /*
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
    */

    // Store object in the main collection
    if (source.storable) {
      const flatObj = flat(obj)
      for (let prop in flatObj) {
        if (collection.records[prop] === undefined) {
          collection.records[prop] = []
        }
        collection.records[prop][collection.length] = flatObj[prop]
      }
      collection.length += 1
    }
  })

  source.stream2.on('end', () => {
    // app.showError('All data loaded')
    app.notify('Processing finished')
    source.loading = false
  })
}

function stop (source) {
  const app = this
  console.log('Stopping source: ', source.name)
  source.stream2.pause()
  source.mainStream.pause()
  if (source.stream2.close) {
    console.log('closing stream')
    source.stream2.close()
    source.mainStream.close()
  } else if (source.stream2.destroy) {
    console.log('destroying stream')
    source.stream2.destroy()
    source.mainStream.destroy()
  }
  source.loading = false
  app.notify('Stream stopped')
}

function collectionToObjects (collection) {
  const objects = []
  for (let i = 0; i < collection.length; i++) {
    const object = {}
    for (let column in collection.records) {
      if (collection.records[column][i] !== undefined) {
        object[column] = collection.records[column][i]
      }
    }
    objects.push(object)
  }
  return objects
}

function getCollectionHeader (collection) {
  const header = []
  for (let column in collection.records) {
    header.push(column)
  }
  return header
}

// Save results to a file
function save (collectionNumber, type) {
  console.log('Saving collection: ', collectionNumber, type)
  const app = this
  const objects = collectionToObjects(app.collections[collectionNumber])
  let blob
  switch (type) {
    case 'csv':
      const header = getCollectionHeader(app.collections[collectionNumber])
      blob = new window.Blob([json2csv({data: objects, fields: header})], {type: 'text/plain;charset=utf-8'})
      break
    case 'json':
      blob = new window.Blob([JSON.stringify(objects)], {type: 'text/plain;charset=utf-8'})
      break
  }
  FileSaver.saveAs(blob, app.collections[collectionNumber].name + '.' + type)
}

// 3. Process stream
/*
function load () {
  let app = this
  app.isStreamLoadingNow = true // Currently loading stream
  app.wasStreamLoaded = true // Stream already opened (for Reload)
  app.searchArr = (app.search.length > 0)
    ? app.search.split(',').map((el) => el.trim())
    : []

  // TODO: REMOVE PREVIEW FLAG
  // document.removeEventListener('scroll', resumeStreamIfBottom)

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
*/

// 3.0.1
// Open new file or url
function open () {
  const app = this
  // window.history.pushState(null, null, '/analyze/')
  app.states.loader = true
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
      activeSource: 0,
      states: {
        loader: true, // open source dialog
        progress: false // stream in progress
      },
      notifyMessage: '',
      error: {
        content: 'Error message',
        button: 'Ok'
      },
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
    open,
    notify,
    generateLink,

    loadUrl, // create source from url
    loadFiles, // create source from local file
    loadSources, // create streams for sources
    previewSource, // create a preview collection from source
    process, // process source
    stop, // stop source
    save, // save collection

    resetState,
    removeCollection (i) {
      if ((i <= this.activeCollection) && (this.activeCollection > 0)) this.showCollection(this.activeCollection - 1)
      this.collections.splice(i, 1)
    },
    showCollection (i) {
      console.log('Switching to collection: ', i)
      this.activeCollection = i
      const sourceNumber = this.sources.findIndex(s => s.name === this.collections[i].source.name)
      this.showSource(sourceNumber)
    },
    showSource (i) {
      console.log('Switching to source: ', i, this.sources[i].name)
      this.activeSource = i
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
    /*
    stopStream: function () {
      // rs.pause()
      // rs.unpipe()
      this.isStreamLoadingNow = false
    },
    reloadStream: function () {
      // Remove event listener that auto resumes stream when bottom of a page reached
      let app = this
      // document.removeEventListener('scroll', resumeStreamIfBottom)
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
    },
    */
    showError (error) {
      console.log('Show error: ', error)
      this.error.content = error
      this.$refs['error'].open()
    },
    closeError () {
      this.$refs['error'].close()
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
    // When app loaded:
    let app = this
    // Check if a browser supports needed API
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      // Add scroll event that preloads some data
      document.addEventListener('scroll', function () {
        if (((document.body.scrollHeight - window.innerHeight - window.scrollY) < 100) && app.collections.length) {
          console.log('[Event] Bottom of screen')
          if (app.collections[app.activeCollection].preview) {
            const source = app.collections[app.activeCollection].source
            console.log('Resuming a preview stream of ', source.name)
            source.counter = 0
            source.previewStream.resume()
          }
          // rs.resume()
        }
      }, false)

      // Check if there're any params of the GET request
      if (window.location.search) {
        var queryObj = querify.getQueryObject(window.location.search)
        setTimeout(function () {
          app = Object.assign(app, queryObj)
          app.loadUrl()
        }, 100)
      } else {
        showApp()
        // Attach drag-and-drop event
        dnd(document.body, (files) => {
          app.loadFiles(files)
        })
      }
    } else {
      window.alert(`Your browser doesn't support File API`)
    }
  }
}

module.exports = appOptions
