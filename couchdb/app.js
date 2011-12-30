var couchapp = require('couchapp')
  , path = require('path')

var ddoc =
{ _id: '_design/app'
, views: {}
, lists: {}
, shows: {}
}

module.exports = ddoc

ddoc.validate_doc_update = function(newdoc, olddoc, userCtx, secobj) {
  if (userCtx.name !== 'forum' && userCtx.roles.indexOf('_admin') === -1) throw {forbidden: 'you must be logged in as "forum" or an admin'}
}

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
      var fullForumPath = doc._id.slice(doc._id.indexOf(':')+1)
      if (fullForumPath === '') return
      var parentpath, subkey
      if (fullForumPath.indexOf('/') !== -1) {
        parentpath = fullForumPath.slice(0, fullForumPath.lastIndexOf('/'))
        subkey = fullForumPath.slice(fullForumPath.lastIndexOf('/')+1)
      } else {
        parentpath = ''
        subkey = fullForumPath
      }
      emit(parentpath, {title: doc.title, path: fullForumPath, subkey: subkey, type: doc._id.split(':')[0]})
    }
  }
}
