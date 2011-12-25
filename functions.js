var views = require('./views')
  , vacuum = require('vacuum')

var PAGE_SIZE = 20

function renderContent(template, functions, context, chunk, done) {
  var templateCopy = {}
  vacuum.copyProps(templateCopy, template)
  delete templateCopy.type
  if (!templateCopy.parts) throw new Error('template must have "parts", only has '+Object.keys(templateCopy).join(','))
  
  vacuum.renderTemplate(template, functions, context, chunk, done)
}

// adds "thread.posts", "thread.owner", "thread.title", "thread.length", "thread.title"
// needs "thread" key
exports.withthread = function WITHTHREAD(template, functions, context, chunk, done) {

  var childContext = {}
  vacuum.copyProps(childContext, context)
  var thread = {}
  childContext.thread = thread
  
  var needed = 2
  var goOn = renderContent.bind(null, template, functions, childContext, chunk, done)
  
  views.getThreadPosts(context.thread, PAGE_SIZE, context.threadSkip || 0, function(err, data) {
    if (err) return done(err)
    thread.posts = data.rows
    thread.length = data.total_rows
    thread.pages = Math.ceil(data.total_rows / PAGE_SIZE)
    if (!--needed) goOn()
  })
  
  views.getThread(context.thread, function(err, data) {
    if (err) return done(err)
    thread.owner = data.owner
    thread.title = data.title
    if (!--needed) goOn()
  })
}
