var views = require('./views')
  , vacuum = require('vacuum')
  , marked = require('marked')
  , forum = require('./')
  , parseURL = require('url').parse
  , formatURL = require('url').format

var PAGE_SIZE = 20

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
  }
  var tagsWithBody = ['a', 'p', 'em', 'ul', 'li']
  tagfinder: for (var i=0; i<text.length; i++) {
    if (text.slice(i, i+4) !== '&lt;') continue
    i+=4
    var attrsStart = text.slice(i).indexOf(' ')+i
    var attrsEnd = text.slice(i).indexOf('&gt;')+i
    if (attrsEnd < i) break // no more ">" - there can't be any more tags
    if (attrsStart > attrsEnd) attrsStart = attrsEnd // attributeless
    var nodeName = text.slice(i, attrsStart)
    if (!tags.hasOwnProperty(nodeName)) continue
    var allowedProperties = tags[nodeName]
    var attrsStr = text.slice(attrsStart, attrsEnd)
    var attrsOK = attrsStr.split(' ').map(function(attrStr) {
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

// -------------------------------------------------------------------------------------------------

exports.text = function TEXT(template, functions, context, chunk, done) {
  var value = vacuum.getFromContext(context, 'name')
  var format = context.format
  if (format === 'plain') {
    value = sanitizeHTML(value)
  } else if (format === 'markdown') {
    value = marked(value)
    value = value.replace(/&/g, '&amp;')
    value = sanitizeHTML(value)
    value = unsanitizeHTML(value)
  } else {
    throw new Error('unknown sanitization class: '+format)
  }
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
    childContext.maxpage = thread.pages
    if (!--needed) goOn()
  })
  
  views.getThread(context.thread, function(err, data) {
    if (err) return done(err)
    thread.owner = data.owner
    thread.title = data.title
    if (!--needed) goOn()
  })
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
