var views = require('./views')
  , vacuum = require('vacuum')
  , marked = require('marked')
  , forum = require('./')
  , parseURL = require('url').parse
  , formatURL = require('url').format

forum.escapeText = escapeText // hmmm... kind of ugly...

var PAGE_SIZE = forum.PAGE_SIZE = 20

function renderContent(template, functions, context, chunk, done) {
  var templateCopy = {}
  vacuum.copyProps(templateCopy, template)
  delete templateCopy.type
  if (!templateCopy.parts) throw new Error('template must have "parts", only has '+Object.keys(templateCopy).join(','))
  
  vacuum.renderTemplate(template, functions, context, chunk, done)
}

function sanitizeHTML(text) {
  text = text.replace(/</g, '&lt;')
  text = text.replace(/>/g, '&gt;')
  return text
}

function unsanitizeHTML(text) {
  var tags =
  { a: ['href', 'title']
  , p: []
  , em: []
  , ul: []
  , li: []
  , strong: []
  , code: []
  }
  var tagsWithBody = ['a', 'p', 'em', 'ul', 'li', 'strong', 'code']
  tagfinder: for (var i=0; i<text.length; i++) {
    if (text.slice(i, i+4) !== '&lt;') continue
    i+=4
    var attrsStart = text.slice(i).indexOf(' ')+i
    var attrsEnd = text.slice(i).indexOf('&gt;')+i
    if (attrsEnd < i) break // no more ">" - there can't be any more tags
    if (attrsStart > attrsEnd || attrsStart === i-1) attrsStart = attrsEnd // attributeless
    var nodeName = text.slice(i, attrsStart)
    if (!tags.hasOwnProperty(nodeName)) continue
    var allowedProperties = tags[nodeName]
    var attrsStr = text.slice(attrsStart, attrsEnd)
    var attrsOK = attrsStr.split(/ (?=[^"]*(?:(?:"[^"]*){2})*$)/).map(function(attrStr) {
      return attrStr.trim()
    }).filter(function(attrStr) {
      return attrStr !== ''
    }).every(function(attrStr) {
      attrStr = attrStr.split('=')
      var name = attrStr[0]
      if (allowedProperties.indexOf(name) === -1) return false
      var value = attrStr.slice(1).join('=')
      if (value.length < 2) return false
      if (value[0] !== '"') return false
      if (value[value.length-1] !== '"') return false
      value = value.slice(1, -1)
      
      // yes, this will give me some false positives, but it should at least be secure.
      if (/[\r\n\\"]/.test(value)) return false
      
      if (name === 'href') {
        // "javascript:" URLs, yay!
        if (value.slice(0, 7) !== 'http://' && value.slice(0, 8) !== 'https://') return false
      }
      return true
    })
    if (!attrsOK) continue
    
    if (tagsWithBody.indexOf(nodeName) !== -1) {
      // ugh.
      // basically, we have to find a closing tag. aaand avoid stuff like <a><b></a></b>.
      // so, if we meet no opening tag for this until we see the closing tag, all is well.
      // if we do meet one, GRAAH.
      // example: <p><p></p></p>
      var stack = [nodeName]
      var seekTagI = attrsEnd
      var lastClosePos
      while (stack.length > 0) {
        // find next &lt;
        seekTagI++
        reResult = /&lt;/.exec(text.slice(seekTagI))
        if (!reResult) continue tagfinder
        seekTagI += reResult.index
        if (text[seekTagI+4] === '/') {
          var tagCloseReResult = /^([a-z]+)&gt;/.exec(text.slice(seekTagI+5))
          if (!tagCloseReResult) continue
          if (stack[stack.length-1] !== tagCloseReResult[1]) continue
          stack.pop()
          lastClosePos = seekTagI
          continue
        }
        var openTagReResult = /^([a-z]+)(?:>| )/.exec(seekTagI+4)
        if (!openTagReResult) continue
        if (tagsWithBody.indexOf(openTagReResult[1]) !== -1) {
          stack.push(openTagReResult[1])
        }
      }
      // phew, we've found a closing tag. so, let's verify that there are no < or > chars in between.
      if (/<|>/.test(text.slice(attrsEnd, lastClosePos))) continue
      
      // as we already know the tag is ok, unescape the closing tag.
      text = text.slice(0, lastClosePos)
           + '</'
           + nodeName
           + '>'
           + text.slice(lastClosePos+('&lt;/'+nodeName+'&gt;').length)
    }
    
    // this tag is ok. unescape it.
    text = text.slice(0, i-4) // stuff in front of this
         + '<'
         + nodeName
         + (attrsStr ? ' ' : '')
         + attrsStr
         + '>'
         + text.slice(attrsEnd+4)
    i-=3
  }
  text = text.replace(/&amp;/g, '&')
  return text
}

function escapeAttribute(str) {
  return str
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
}

function escapeText(value, format) {
  if (format === 'plain') {
    value = sanitizeHTML(value)
  } else if (format === 'hex') {
    value = value.replace(/[^0-9a-f]/gi, '')
  } else if (format === 'markdown') {
    value = marked(value)
    value = value.replace(/&/g, '&amp;')
    value = sanitizeHTML(value)
    value = unsanitizeHTML(value)
  } else if (format === 'attribute') {
    value = escapeAttribute(value)
  } else {
    throw new Error('unknown sanitization class: '+format)
  }
  return value
}

// -------------------------------------------------------------------------------------------------

exports.text = function TEXT(template, functions, context, chunk, done) {
  var value = vacuum.getFromContext(context, 'name')
  var format = context.format
  value = escapeText(value, format)
  chunk(value)
  done()
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
  
  views.getThreadPosts(context.thread, PAGE_SIZE, PAGE_SIZE * ((context.page-1) || 0), function(err, data) {
    if (err) return done(err)
    thread.posts = data.rows
    thread.length = data.total_rows
    thread.pages = Math.ceil(data.total_rows / PAGE_SIZE)
    thread.id = context.thread
    childContext.maxpage = thread.pages
    
    thread.posts.forEach(function(post) {
      post.value.creation = new Date(post.value.creation).toGMTString()
      if (post.value.modification) post.value.modification = new Date(post.value.modification).toGMTString()
    })
    if (!--needed) goOn()
  })
  
  views.getThread(context.thread, function(err, data) {
    if (err) return done(err)
    thread.owner = data.owner
    thread.title = data.title
    if (!--needed) goOn()
  })
}

exports.withforum = function WITHTHREAD(template, functions, context, chunk, done) {
  var childContext = {}
  vacuum.copyProps(childContext, context)
  var forum = {}
  childContext.forum = forum
  
  views.getForum(context.forum, PAGE_SIZE, PAGE_SIZE * ((context.page-1) || 0), function(err, data) {
    if (err) return done(err)
    
    forum.threads = data.rows
    forum.length = data.total_rows
    forum.title = data.meta.title
    forum.pages = Math.ceil(data.total_rows / PAGE_SIZE)
    forum.id = context.forum
    childContext.maxpage = forum.pages
    
    forum.threads.forEach(function(thread) {
      thread.value.lastpost = new Date(thread.value.lastpost).toGMTString()
      thread.id = thread.id.split(':')[1]
    })
    
    renderContent(template, functions, childContext, chunk, done)
  })
}

exports.if = function IF(template, functions, context, chunk, done) {
  var name = vacuum.getFromContext(context, 'name', true)
  if (!name) return done()
  
  var templateCopy = {}
  vacuum.copyProps(templateCopy, template)
  delete templateCopy.type
  
  vacuum.renderTemplate(templateCopy, functions, context, chunk, done)
}

exports.static = function STATIC(template, functions, context, chunk, done) {
  var file = context.file
  if (!file) throw new Error('falsy "file"')
  chunk('/static/'+file+'/'+forum.ramstatic.unique)
  done()
}

exports.pagenav = function PAGENAV(template, functions, context, chunk, done) {
  var page = +context.page
  var maxpage = +context.maxpage
  var urlpos = context.pageURLPos
  if (!page) throw new Error('invalid page')
  if (!maxpage) throw new Error('invalid maxpage')
  if (!urlpos) throw new Error('invalid urlpos')
  var leftURL = addToURLPart(-1)
  var rightURL = addToURLPart(1)
  var data = ''
  if (page > 1) {
    data += '<a href="'+leftURL+'"><img src="/static/arrow-left.png/'+forum.ramstatic.unique+'"></a> '
  }
  data += 'page '+page+' of '+maxpage
  if (page < maxpage) {
    data += ' <a href="'+rightURL+'"><img src="/static/arrow-right.png/'+forum.ramstatic.unique+'"></a>'
  }
  chunk(data)
  return done()
  
  function addToURLPart(change) {
    url = parseURL(context.request.url)
    var path = url.pathname.split('/')
    path[urlpos] = +path[urlpos] + change
    url.pathname = path.join('/')
    return formatURL(url)
  }
}

exports.rePOST = function rePOST(template, functions, context, chunk, done) {
  var NOREPOST = ['formtoken', 'loginUser', 'loginPassword', 'registerUser', 'registerPassword', 'registerRecoverData']

  if (!context.postData) return done() // no POST, no data
  var pairs = []
  Object.keys(context.postData).forEach(function(key) {
    var values = context.postData[key]
    if (typeof values === 'string') values = [values]
    values.forEach(function(value) {
      if (NOREPOST.indexOf(key) !== -1) return
      pairs.push({key: key, value: value})
    })
  })
  chunk(pairs.map(function(pair) {
    return '<input type="hidden" name="'
         + escapeAttribute(pair.key)
         + '" value="'
         + escapeAttribute(pair.value)
         + '">'
  }).join('\n'))
  done()
}
