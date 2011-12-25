var vacuum = require('../')
  , http = require('http')

var renderTemplate = vacuum.loadSync(__dirname+'/templates')

renderTemplate.connection = function CONNECTION(template, functions, context, chunk, done) {
  var connection = vacuum.getFromContext(context, 'name')
  var address = connection.remoteAddress
  chunk(address+':'+connection.remotePort)
  done()
}

var server = http.createServer(function(req, res) {
  var page = req.url.slice(1).split(/[?\/]/)[0]
  if (page === 'test') {
    renderTemplate('test', {request: req}, res)
  } else {
    res.writeHead(404, 'what the hell?')
    res.end("couldn't find that stuff")
  }
})
server.listen(9876)
console.log('listening on 9876')
