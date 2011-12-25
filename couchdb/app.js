var couchapp = require('couchapp')
  , path = require('path')

var ddoc =
{ _id: '_design/app'
, views: {}
, lists: {}
, shows: {}
}

module.exports = ddoc

ddoc.views.threadPosts =
{ map: function(doc) {
    if (doc._id.slice(0, 5) === 'post:') {
      emit([doc.topic, doc.creation], doc)
    }
  }
}

ddoc.views.userPosts =
{ map: function(doc) {
    if (doc._id.slice(0, 5) === 'post:') {
      emit([doc.owner, doc.creation], doc)
    }
  }
}

ddoc.views.forumTopics =
{ map: function(doc) {
    if (doc._id.slice(0, 6) === 'topic:') {
      emit([doc.path, doc.lastpost], doc)
    }
  }
}

ddoc.views.superforumIndex =
{ map: function(doc) {
    if (doc._id.slice(0, 6) === 'forum:' || doc._id.slice(0, 11) === 'superforum:') {
      var forumPath = doc._id.slice(doc._id.indexOf(':')+1)
      if (forumPath.indexOf('/') !== -1) {
        forumPath = forumPath.slice(0, forumPath.lastIndexOf('/'))
        emit(forumPath, doc)
      }
    }
  }
}
