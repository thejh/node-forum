exports.addPost = addPost
exports.createTopic = createTopic

var forum = require('./')
  , hat = require('hat')

// data: topic, owner, text[, creation]
function addPost(data, cb, skipTopic) {
  data.creation = data.creation || Date.now()
  data.modifier = null
  data.modification = null
  var postid = hat()
  
  if (skipTopic) return _topicOk()
  forum.db.get('topic:'+data.topic, function(err, topicData) {
    if (err) return cb(err) // e.g. if the topic does not exist
    _topicOk()
  })
  
  function _topicOk() {
    forum.db.store('post:'+postid, data, function(err) {
      if (err) return cb(err) // uh, this really shouldn't happen...
      if (skipTopic) return cb(null, 1)
      var page
      forum.db.alter('topic:'+data.topic, function(topicDoc) {
        var olddate = +topicDoc.lastpost
        var newdate = +data.creation
        // because of concurrent modifications, "newdate" might be before "olddate"!
        if (newdate > olddate) {
          topicDoc.lastpost = data.creation
        }
        topicDoc.postCount++
        page = Math.ceil(topicDoc.postCount / forum.PAGE_SIZE)
        return topicDoc
      }, function(err) {
        if (err) return cb(err) // uh, this really shouldn't happen...
        cb(null, page)
      })
    })
  }
}

// data: topic, owner, text, path, title
function createTopic(data, cb) {
  var topicId = hat()
  var creation = data.creation = Date.now()
  forum.db.get('forum:'+data.path, function(err, forumData) {
    if (err) return cb(err)
    var topicDoc =
    { lastpost: creation
    , owner: data.owner
    , path: data.path
    , postCount: 1
    , title: data.title
    }
    var pending = 2
    forum.db.store('topic:'+topicId, topicDoc, function(err) {
      if (err) return cb(err) // shouldn't happen
      if (--pending === 0) cb(null, topicId)
    })
    var postDoc =
    { topic: topicId
    , owner: data.owner
    , text: data.text
    , creation: data.creation
    }
    addPost(postDoc, function(err) {
      if (err) return cb(err) // shouldn't happen
      if (--pending === 0) cb(null, topicId)
    }, true)
  })
}
