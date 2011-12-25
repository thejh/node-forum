This module (on npm as `relax`) has the goal to make working with couchdb
simpler. E.g. one property of couch is that you can't lock tables or so,
when stuff fails, you just have to retry. That's not bad, it's good for
performance and stability. However, it might have made your life a bit
harder, especially if you were using a module that just overwrites changes.
Well, this module wants to make it simpler. Usage:

    var db = new (require('relax'))({host: '127.0.0.1', port: 5984, ssl: false, db_name: 'test'})

Except for `db_name`, all options are optional and default to these values.

Low-Level API
=============
You can use these two methods to get and store documents:

    # get a document from the database
    # `id` gets escaped via encodeURIComponent
    db.get(id, function done(errOrNull, doc){})
    
    # store a document
    # `id` gets escaped via encodeURIComponent
    # This method does NOT handle conflicts, it will call back with an error!
    db.store(id, doc, function done(errOrNull){})

High-Level API
==============

    db.alter(id, function modify(doc){}, function done(err){})

This method fetches the specified document, calls the `modify` callback on it
and stores the result of that callback. If an error occurs, it waits, repeats this
process, which means that it re-fetches the document, calls the `modify`
callback on it again and tries to store it again. It fails after ten errors
(conflicts don't count).
