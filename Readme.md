This is a forum written in nodejs. It doesn't have all features you'd expect from a good forum yet - for example, there
currently is no concept of a moderator, you have to directly go into the database. Also, although there are fields for it
in the DB, you can't edit posts yet.

But in case you want to try it out anyway, here are some instructions on how to get it running.

What you need:

 - a couchdb
 - a server for the forum

So, first thing, setting up the database. Login as couchdb admin and create a new database for the forum. Then push the design document:

    sudo npm install -g couchapp
    couchapp push couchdb/app.js http://admin:password@databasehost:5984/dbname

There's a hardcoded username that is allowed to alter the database, `forum` - create it.

Now go into the database again and create two documents for the forums:

    {"id":"superforum:", "title": "masterforum"}
    {"id":"superforum:test", "title": "testing stuff"}
    {"id":"forum:test/node", "title": "testing, topic: node"}

Superforums contain forums and superforums, forums contain posts.

Now adjust the settings in `config.json`. Important: The `host` field looks like `forum:password@host`.

Finally, start `index.js`. It should work now.
