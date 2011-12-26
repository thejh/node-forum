var config = require('./config')
  , Relax = require('relax')
  , vacuum = require('vacuum')
  , ramstatic = require('ram-static')
  , http = require('http')
  , hat = require('hat')
  , querystring = require('querystring')
  , user = require('./user')
  , parseURL = require('url').parse

var HAT_TOKEN = /^[a-f0-9]{32}$/
if (!HAT_TOKEN.test(hat())) throw new Error('weird')

if (!config.hmacSecret) config.hmacSecret = hat(512)

var ramstaticServer = ramstatic(__dirname+'/static')
exports.ramstatic = ramstaticServer
var renderTemplate = vacuum.loadSync(__dirname+'/templates')
vacuum.copyProps(renderTemplate, require('./functions'))
var db = exports.db = new Relax(config.database)

var httpServer = http.createServer(requestHandler)
function requestHandler(req, res) {
  if (config.debug) console.log((req.username ? req.username : '<anonymous>')+': '+req.method+' '+req.url)
  var urlparts = parseURL(req.url).pathname.split('/').filter(function(str) {
    return str.length > 0
  })
  if (urlparts[0] === 'static' && (req.method === 'GET' || req.method === 'HEAD')) {
    return ramstaticServer.handle(urlparts.slice(1).join('/'), res)
  }
  if (urlparts[0] === 'favicon.ico' && (req.method === 'GET' || req.method === 'HEAD')) {
    return ramstaticServer.handle('favicon.ico/a', res)
  }
  var authedAs = getCookie(req, 'Authed-As')
  if (authedAs) {
    req.username = user.checkSignedLogin(authedAs)
  }
  if (urlparts[0] === 'login' && req.method === 'GET') {
    var token = ensureToken(req, res)
    return renderTemplate('login', {formtoken: token}, res)
  }
  if (urlparts[0] === 'login' && req.method === 'POST') {
    if (!req.postData) return bufferPost(req, res)
    user.authUser(req.postData.user, req.postData.password, function(err, result) {
      if (err) {
        res.writeHead(400, JSON.stringify(err.message || err || "error"),
        { 'Content-Type': 'text/plain'
        })
        res.end(err.stack || err.message || JSON.stringify(err || "error"))
        return
      }
      setCookie(res, 'Authed-As', result.proof)
      res.writeHead(200, 'login ok')
      res.end('yay, you were logged in!')
    })
    return
  }
  if (urlparts[0] === 'register' && req.method === 'GET') {
    var token = ensureToken(req, res)
    return renderTemplate('register', {formtoken: token}, res)
  }
  if (urlparts[0] === 'register' && req.method === 'POST') {
    if (!req.postData) return bufferPost(req, res)
    user.createUser(req.postData.user, req.postData.password,
    { recoverData: req.postData.recoverData
    }, function(err, proof) {
      if (err) {
        res.writeHead(400, JSON.stringify(err.message || err || "error"),
        { 'Content-Type': 'text/plain'
        })
        res.end(err.stack || err.message || JSON.stringify(err || "error"))
        return
      }
      setCookie(res, 'Authed-As', proof)
      res.writeHead(200, 'register ok')
      res.end('yay, you have an account!')
    })
    return
  }
  if (urlparts[0] === 'thread') {
    var threadPage = +urlparts[2]
    if (!threadPage) {
      res.writeHead(400, 'no or non-numeric page', { 'Content-Type': 'text/plain' })
      return res.end('missing or non-numeric page')
    }
    return renderTemplate('thread', {thread: urlparts[1], page: threadPage, request: req, pageURLPos: 3}, res)
  }
  res.writeHead(404, 'invalid first path segment or method ☹',
  { 'X-Too-Stupid-To-Type': 'You!'
  , 'Content-Type': 'text/plain; charset=utf-8'
  })
  res.end('invalid first path segment or method ☹')
}
httpServer.listen(config.server.port)

function bufferPost(req, res, checkToken) {
  req.setEncoding('utf8')
  req.resume()
  var data = ''
  req.on('data', function(chunk) {
    data += chunk
    // nuke uploads bigger than 1M chars or so
    if (data.length > (config.uploadSizeLimit || 1000000)) {
      req.connection.destroy()
      return
    }
  })
  req.on('end', function() {
    req.postData = querystring.parse(data)
    if (checkToken !== 'NOVERIFY') {
      var postToken = req.postData.formtoken
        , cookieToken = getToken(req)
        , tokenOk = postToken != null && postToken === cookieToken
      if (!tokenOk) {
        res.writeHead(400, 'expected token was not sent or incorrect',
        { 'Content-Type': 'text/plain'
        })
        res.end('This request needs a valid token to work, but none or an incorrect one was sent. Make sure that cookies work and try again.')
        return
      }
    }
    requestHandler(req, res)
  })
}

function getToken(req) {
  var value = getCookie(req, 'FormToken')
  if (!value) return
  if (!HAT_TOKEN.test(value)) return
  return value
}

function getCookie(req, name) {
  if (typeof req.headers.cookie !== 'string') return false
  var retval
  req.headers.cookie.split(';').forEach(function(cookieStr) {
    cookieStr = cookieStr.trim().split('=')
    if (cookieStr[0] === name) {
      retval = decodeURIComponent(cookieStr[1])
    }
  })
  return retval
}

function setCookie(res, name, value) {
  var cookieHeaders = res.getHeader('Set-Cookie') || []
  cookieHeaders.push(name+'='+encodeURIComponent(value))
  res.setHeader('Set-Cookie', cookieHeaders)
}

function ensureToken(req, res) {
  var currentToken = getToken(req)
  if (currentToken) return currentToken
  var token = hat()
  setCookie(res, 'FormToken', token)
  return token
}
