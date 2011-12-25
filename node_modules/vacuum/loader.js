exports.loadSync = load

var vacuum = require('./index')
  , defaults = require('./functions')
  , EventEmitter = require('events').EventEmitter
  , fs = require('fs')
  , path = require('path')

var HTML = '.html'

function loadFolder(folderName, functions) {
  var files = fs.readdirSync(folderName)
  files.forEach(function(file) {
    var filePath = path.join(folderName, file)
    var stats = fs.statSync(filePath)
    if (stats.isFile() && file.slice(-HTML.length) === HTML) {
      var content = fs.readFileSync(filePath, 'utf8')
      var templateData = vacuum.compileTemplate(content)
      var template = function wrapTextTemplate(template, functions, context, chunk, done) {
        return vacuum.renderTemplate(templateData, functions, context, chunk, done)
      }
      functions[file.slice(0, file.indexOf('.'))] = template
    } else if (stats.isDirectory()) {
      loadFolder(filePath, functions)
    }
  })
}

function load(path) {
  var functions = function renderByName(name, context, chunk, done) {
    if (!{}.hasOwnProperty.call(functions, name)) throw new Error('template '+JSON.stringify(name)+' not found')
    var fn = functions[name]
    if (chunk.write && chunk.end && chunk.writeHead) {
      var response = chunk
      chunk = function writeTemplateChunkToHTTP(chunk) {
        response.write(chunk)
      }
      done = function(err) {
        if (err) {
          response.end('<<<<[[[[(((( AN ERROR OCCURED, RENDERING TERMINATED ))))]]]]>>>>')
          console.error('Error during template rendering:'+(err.stack || err))
          chunk = done = function(){}
        } else {
          response.end()
        }
      }
      response.writeHead(200, 'let me render that template for you...',
      { 'Content-Type': 'text/html; charset=utf-8'
      , 'X-Powered-By': 'node-vacuum'
      , 'X-Where-Can-I-Download-This-Cool-Template-Renderer': 'https://github.com/thejh/node-vacuum'
      })
    }
    fn(null, functions, context, chunk, done)
  }
  vacuum.copyProps(functions, defaults)
  loadFolder(path, functions)
  return functions
}
