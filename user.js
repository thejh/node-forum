exports.createUser = createUser
exports.authUser = authUser
exports.checkSignedLogin = checkSignedLogin

var forum = require('./')
  , pwhash = require('password-hash')
  , crypto = require('crypto')
  , config = require('./config')

var USERNAME = /^\w+$/

function createUser(name, password, doc, cb) {
  if (!USERNAME.test(name)) return cb(new Error('invalid username (allowed: '+USERNAME+')'))
  if (password.length < 5) return cb(new Error("I don't want to force you to use a super-long password, but "+password.length+" chars is way too short"))
  var docname = 'user:'+name
  doc.name = name
  doc.password = pwhash.generate(password, {algorithm: 'sha512'})
  forum.db.store(docname, doc, function(err) {
    if (err) return cb(err)
    var loginProof = sign('validloginas:'+name)
    cb(null, loginProof)
  })
}

function authUser(name, password, cb) {
  if (!USERNAME.test(name)) return cb(new Error('invalid username (allowed: '+USERNAME+')'))
  var docname = 'user:'+name
  forum.db.get(docname, function(err, doc) {
    if (err) return cb(err)
    if (!pwhash.verify(password, doc.password)) return cb(new Error('wrong password'))
    var loginProof = sign('validloginas:'+name)
    cb(null, {doc: doc, proof: loginProof})
  })
}

function sign(str) {
  if (!config.hmacSecret) throw new Error('hmac secret undefined')
  var algo = crypto.createHmac('sha512', config.hmacSecret)
  algo.update(str)
  return algo.digest('hex')+':'+str
}

function unsign(str) {
  if (!config.hmacSecret) throw new Error('hmac secret undefined')
  str = str.split(':')
  var signature = str[0]
  str = str.slice(1).join(':')
  var algo = crypto.createHmac('sha512', config.hmacSecret)
  algo.update(str)
  return (algo.digest('hex') === signature) ? str : null
}

function checkSignedLogin(str) {
  str = unsign(str)
  if (str == null) return null
  str = str.split(':')
  if (str[0] !== 'validloginas') return null
  str = str.slice(1).join(':')
  return str
}
