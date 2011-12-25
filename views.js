exports.getThreadPosts = getThreadPosts
exports.getThread = getThread

var forum = require('./')

function jsonParam(data) {
  return encodeURIComponent(JSON.stringify(data))
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
