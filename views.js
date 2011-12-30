exports.getThreadPosts = getThreadPosts
exports.getThread = getThread
exports.getForum = getForum
exports.getSuperforum = getSuperforum

var forum = require('./')

function jsonParam(data) {
  return encodeURIComponent(JSON.stringify(data))
}

function getForum(path, limit, skip, cb) {
  var pending = 2
  var result = {}
  forum.db.get('forum:'+path, function(err, doc) {
    if (err) return cb(err), cb = noop
    result.meta = doc
    if (--pending === 0) cb(null, result)
  })
  
  var url = '_design/app/_view/forumTopics'
            +'?startkey='+jsonParam([path])
            +'&endkey='+jsonParam([path, []])
            +'&limit='+limit
            +'&skip='+skip
  
  forum.db.request('GET', {path: url}, function(err, data) {
    if (err) return cb(err), cb = noop
    result.total_rows = data.total_rows
    result.offset = data.offset
    result.rows = data.rows
    if (--pending === 0) cb(null, result)
  })
}

function getSuperforum(path, cb) {
  var pending = 2
  var result = {}
  forum.db.get('superforum:'+path, function(err, doc) {
    if (err) return cb(err), cb = noop
    result.meta = doc
    if (--pending === 0) cb(null, result)
  })
  
  var url = '_design/app/_view/superforumIndex'
            +'?key='+jsonParam(path)
  
  forum.db.request('GET', {path: url}, function(err, data) {
    if (err) return cb(err), cb = noop
    result.total_rows = data.total_rows
    result.offset = data.offset
    result.rows = data.rows
    if (--pending === 0) cb(null, result)
  })
}

function getThreadPosts(topic, limit, skip, cb) {
  var path = '_design/app/_view/threadPosts'
             +'?startkey='+jsonParam([topic])
             +'&endkey='+jsonParam([topic, []])
             +'&limit='+limit
             +'&skip='+skip
  
  forum.db.request('GET', {path: path}, function(err, data) {
    if (err) return cb(err)
    cb(null, data)
  })
}

function getThread(id, cb) {
  forum.db.get('topic:'+id, cb)
}

function noop(){}
