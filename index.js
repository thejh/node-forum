var config = exports.config = JSON.parse(require('fs').readFileSync(__dirname+'/config.json', 'utf8'))
  , Relax = require('relax')
  , vacuum = require('vacuum')
  , ramstatic = require('ram-static')
  , http = require('http')
  , hat = require('hat')
  , querystring = require('querystring')
  , user = require('./user')
  , parseURL = require('url').parse
  , post = require('./post')

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
  var urlparts = parseURL(req.url).pathname.split('/').filter(function(str) {
    return str.length > 0
  })
  
  if (urlparts.length === 0) urlparts = ['superforum']
  
  // static files
  if (urlparts[0] === 'static' && (req.method === 'GET' || req.method === 'HEAD')) {
    return ramstaticServer.handle(urlparts.slice(1).join('/'), res)
  }
  if (urlparts[0] === 'favicon.ico' && (req.method === 'GET' || req.method === 'HEAD')) {
    return ramstaticServer.handle('favicon.ico/a', res)
  }
  
  // collect POST data and verify formtoken
  if (req.method === 'POST' && !req.postData) return bufferPost(req, res)
  
  if (!req.username) {
    var authedAs = getCookie(req, 'Authed-As')
    if (authedAs) {
      req.username = user.checkSignedLogin(authedAs)
    }
  }
  
  if (config.debug) console.log((req.username ? req.username : '<anonymous>')+': '+req.method+' '+req.url)
  
  // intercept POST with loginUser or registerUser
  if (maybeInterceptLoginOrRegister(req, res)) return
  
  if (urlparts[0] === 'login') {
    if (req.username) {
      res.writeHead(303, "You're already logged in, what are you doing here?", {'Location': 'http://'+req.headers.host+'/'})
      res.end("You're already logged in, what are you doing here?")
      return
    }
    return showLoginForm(req, res)
  }
  
  if (urlparts[0] === 'newthread') {
    var token = ensureToken(req, res)
    return renderTemplate('newtopic', {formtoken: token, path: decodeURI(urlparts.slice(1).join('/'))}, res)
  }
  
  if (urlparts[0] === 'thread') {
    var threadPage = +urlparts[2]
    if (!threadPage) {
      res.writeHead(400, 'no or non-numeric page', { 'Content-Type': 'text/plain' })
      return res.end('missing or non-numeric page')
    }
    var token = ensureToken(req, res)
    return renderTemplate('thread',
    { thread: urlparts[1]
    , page: threadPage
    , request: req
    , pageURLPos: 3
    , formtoken: token
    }, res)
  }
  
  if (urlparts[0] === 'forum' && urlparts.length >= 2) {
    var forumPage = +urlparts[urlparts.length-1]
    var forumPath = decodeURI(urlparts.slice(1, -1).join('/'))
    if (!forumPage) {
      res.writeHead(400, 'no or non-numeric page', { 'Content-Type': 'text/plain' })
      return res.end('missing or non-numeric page')
    }
    var token = ensureToken(req, res)
    return renderTemplate('forum',
    { forum: forumPath
    , page: forumPage
    , request: req
    , pageURLPos: 3
    , formtoken: token
    }, res)
  }
  
  if (urlparts[0] === 'superforum') {
    var forumPath = decodeURI(urlparts.slice(1).join('/'))
    // var token = ensureToken(req, res)
    return renderTemplate('superforum',
    { superforum: forumPath
    , request: req
    //, formtoken: token
    }, res)
  }
  
  if (urlparts[0] === 'post' && req.method === 'POST' && req.postData.text && req.postData.topic) {
    if (!req.username) return showLoginForm(req, res)
    if (req.postData.text === '') return renderTemplate('errorpage', {errorText: formatError(new Error('empty text'))}, res)
    
    post.addPost(
    { topic: req.postData.topic
    , owner: req.username
    , text: req.postData.text
    }, function(err, page) {
      if (err) return renderTemplate('errorpage', {errorText: formatError(err)}, res)
      res.writeHead(303, 'post created, now have a look at it',
      { Location: 'http://'+req.headers.host+'/thread/'+req.postData.topic+'/'+page
      })
      res.end('post created, now have a look at it')
    })
    return
  }
  
  if (urlparts[0] === 'post' && req.method === 'POST' && req.postData.text && req.postData.path && req.postData.title) {
    if (!req.username) return showLoginForm(req, res)
    if (req.postData.text === '') return renderTemplate('errorpage', {errorText: formatError(new Error('empty text'))}, res)
    if (req.postData.title === '') return renderTemplate('errorpage', {errorText: formatError(new Error('empty title'))}, res)
    
    post.createTopic(
    { topic: req.postData.topic
    , owner: req.username
    , text: req.postData.text
    , path: req.postData.path
    , title: req.postData.title
    }, function(err, threadid) {
      if (err) return renderTemplate('errorpage', {errorText: formatError(err)}, res)
      res.writeHead(303, 'thread created, now have a look at it',
      { Location: 'http://'+req.headers.host+'/thread/'+threadid+'/1'
      })
      res.end('thread created, now have a look at it')
    })
    return
  }
  
  if (urlparts[0] === 'debug') {
    res.writeHead(200, {'Content-Type': 'text/plain'})
    res.end('network interfaces: '+JSON.stringify(require('os').networkInterfaces())+'\n'+
            'local address: '+JSON.stringify(req.connection.address())+'\n'+
            'remote IP: '+req.connection.remoteAddress)
    return
  }
  
  res.writeHead(404, 'invalid first path segment or method ☹',
  { 'X-Too-Stupid-To-Type': 'You!'
  , 'Content-Type': 'text/plain; charset=utf-8'
  })
  res.end('invalid first path segment or method ☹')
}
httpServer.listen(config.server.port)

function showLoginForm(req, res, err) {
  var token = ensureToken(req, res)
  renderTemplate('login', {formtoken: token, postData: req.postData, url: req.url, errorText: formatError(err)}, res)
}

function formatError(err) {
  if (!err) return
  var errorText = err.stack || err.message || err
  if (typeof errorText === 'object') {
    try {
      errorText = JSON.stringify(errorText)
    } catch (jsonerr) {
      errorText = String(errorText)
    }
  }
  return errorText || "<can't format error correctly>"
}

function maybeInterceptLoginOrRegister(req, res) {
  if (!req.postData) return false
  
  var method = null
  if (req.postData.loginUser && req.postData.loginPassword) method = 'authUser'
  if (req.postData.registerUser && req.postData.registerPassword && req.postData.registerRecoverData) method = 'createUser'
  if (!method) return false
  console.log('  intercepting with '+method)
  var username = req.postData.loginUser || req.postData.registerUser
  var password = req.postData.loginPassword || req.postData.registerPassword
  
  var doc = {}
  if (method === 'createUser') doc.recoverData = req.postData.registerRecoverData
  user[method](username, password, doc, function(err, result) {
    if (err) {
      showLoginForm(req, res, err)
      return
    }
    // remember login...
    setCookie(res, 'Authed-As', result.proof)
    
    // ...and go on handling this request
    req.username = username
    delete req.postData.loginUser
    delete req.postData.loginPassword
    delete req.postData.registerUser
    delete req.postData.registerPassword
    delete req.postData.registerRecoverData
    requestHandler(req, res)
  })
  return true // block until the user has authed
}

function bufferPost(req, res, checkToken, handler) {
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
    
    // I don't want to handle this kind of crazyness in my code.
    Object.keys(req.postData).forEach(function(key) {
      if (typeof req.postData[key] !== 'string') delete req.postData[key]
    })
    
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
    (handler || requestHandler)(req, res)
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
  cookieHeaders.push(name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly')
  res.setHeader('Set-Cookie', cookieHeaders)
}

function ensureToken(req, res) {
  var currentToken = getToken(req)
  if (currentToken) return currentToken
  var token = hat()
  setCookie(res, 'FormToken', token)
  return token
}

function clone(obj) {
  var copy = {}
  for (var key in obj) {
    if (Object.prototype.hasOwnPrototype.call(obj, key)) {
      copy[key] = obj[key]
    }
  }
  return copy
}
