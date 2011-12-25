var http = require('http')
  , ramstatic = require('./')

var server = ramstatic(__dirname+'/public')

console.log('files loaded: '+Object.keys(server.files))

http.createServer(function(req, res) {
  server.handle(req.url, res)
}).listen(9876)
