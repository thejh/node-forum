exports.addPost = addPost

var forum = require('./')
  , hat = require('hat')

// data: topic, owner, text[, creation]
function addPost(data, cb) {
  data.creation = data.creation || Date.now()
  data.modifier = null
  data.modification = null
  var postid = hat()
  forum.db.get('topic:'+data.topic, function(err, topicData) {
    if (err) return cb(err) // e.g. if the topic does not exist
    forum.db.store('post:'+postid, data, function(err) {
      if (err) return cb(err) // uh, this really shouldn't happen...
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
        if (err) return cb(err)
        cb(null, page)
      })
    })
  })
}
