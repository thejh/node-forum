var hat = require('hat')
  , path = require('path')
  , fs = require('fs')
  , mime = require('mime')

module.exports = Server

function Server(folder) {
  if (!(this instanceof Server)) return new Server(folder)
  this.unique = hat()
  this.files = {}
  this._loadFolder(folder, '')
}

Server.prototype._loadFolder = function(folder, prefix) {
  var self = this
  
  fs.readdirSync(folder).forEach(function(entry) {
    // no hidden files or so
    if (entry[0] === '.') return
    if (entry.slice(-1) === '~') return
    
    var entryPath = path.join(folder, entry)
    var key = path.join(prefix, entry)
    var stats = fs.statSync(entryPath)
    
    if (stats.isDirectory()) {
      self._loadFolder(entryPath, key)
    } else if (stats.isFile()) {
      var type = mime.lookup(entry)
        , charset = mime.charsets.lookup(type)
      if (charset) type += '; charset='+charset
      self.files[key] =
      { data: fs.readFileSync(entryPath)
      , type: type
      }
    }
  })
}

Server.prototype.handle = function(url, response) {
  url = path.join(url, '..')
  if (url[0] === '/') url = url.slice(1)
  if (!has(this.files, url)) {
    response.writeHead(404, "node-ram-static can't find that file :(", {'Content-Type': 'text/plain'})
    response.end("Sorry, node-ram-static can't find that file (filename: '"+url+"')")
    return
  }
  var file = this.files[url]
  response.writeHead(200, ":)",
  { 'Content-Type': file.type
  , 'Content-Length': file.data.length
  , 'Expires': new Date(Date.now()+1000*60*60*24*365).toGMTString() // one year
  , 'Cache-Control': 'max-age='+60*60*24*365+', public' // one year
  , 'X-Powered-By': 'node-ram-static'
  , 'X-Where-Can-I-Download-This-Static-File-Server': 'https://github.com/thejh/node-ram-static'
  })
  response.end(file.data)
}

function has(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}
