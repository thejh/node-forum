exports.renderTemplate = renderTemplate
exports.compileTemplate = compileTemplate
exports.copyProps = copyProps
exports.loadSync = require('./loader').loadSync
exports.getFromContext = getFromContext

var _reString = '("([^"\\\\]|\\\\.)*")'
var _reAttribute = '(?:([a-zA-Z0-9_]+)='  + _reString +  ')'
var _reTag = '{([#/]?)([a-zA-Z0-9_]+)((\\s+'  + _reAttribute +  ')*)\\s*}'
var tagRegex = new RegExp(_reTag, 'g')
var argRegex = new RegExp(_reAttribute, 'g')

function compileTemplate(text) {
  var reResult
    , lastResult
    , parents = []
    , currentNode = {parts: []}
    , i = 0
  // WARNING: DO NOT BREAK FROM THIS LOOP OR THE exec()==null WILL GET YOU THE NEXT TIME!
  while (reResult = tagRegex.exec(text)) {
    currentNode.parts.push(text.slice(i, reResult.index))
    i = reResult.index + reResult[0].length
    lastResult = reResult
    var flags = reResult[1]
      , tagtype = reResult[2]
      , argsstr = reResult[3]
    if (flags === '/') {
      var parent = parents.pop()
      parent.parts.push(currentNode)
      currentNode = parent
      continue
    }
    var argmap = [], argReResult
    while (argReResult = argRegex.exec(argsstr)) {
      argmap.push({name: argReResult[1], value: JSON.parse(argReResult[2])})
    }
    if (flags === '#') {
      parents.push(currentNode)
      currentNode = {type: tagtype, args: argmap, parts: []}
    } else {
      currentNode.parts.push({type: tagtype, args: argmap})
    }
  }
  var lastTextIndex = lastResult ? (lastResult.index + lastResult[0].length) : 0
  currentNode.parts.push(text.slice(lastTextIndex))
  return currentNode
}

function getFromContext(context, nameVar, permissive) {
  if (!has(context, nameVar)) throw new Error('no own property '+JSON.stringify(nameVar))
  var name = context[nameVar].split('.')
    , part
    , obj = context
  while ((part = name.shift()) != null) {
    if (!has(obj, part)) {
      if (permissive) return void 0
      throw new Error('no own property '+JSON.stringify(part)+
                      (typeof obj === 'object' ?
                        (', only '+Object.keys(obj).join())
                      :
                        (', its a '+typeof obj)
                      )
                     )
    }
    obj = obj[part]
  }
  return obj
}

function renderTemplate(template, functions, context, chunk, done) {
  var completelyDone = 0
  // shows which parts won't emit any more data
  var doneParts = template.parts.map(function(part) { return typeof part === 'string' })
  // one string per part, empty if this is active
  var partBuffers = template.parts.map(function(part) { return typeof part === 'string' ? part : '' })
  
  function gotChunk(partIndex, str) {
    if (partIndex === completelyDone) return chunk(str)
    if (partIndex < completelyDone) throw new Error("can't safely write that anymore, you're too late")
    if (doneParts[partIndex]) throw new Error("that part is already flagged as done, there can't be any more data chunks")
    partBuffers[partIndex] += str
  }
  
  function partComplete(partIndex, err) {
    if (err) return done(err)
    if (doneParts[partIndex]) throw new Error("you already flagged it as complete, doing it twice is an error")
    if (partIndex < completelyDone) throw new Error("WTF?")
    doneParts[partIndex] = true
    if (partIndex === completelyDone) flush()
  }
  
  function flush() {
    while (doneParts[completelyDone]) {
      if (partBuffers[completelyDone] !== '') {
        chunk(partBuffers[completelyDone])
        partBuffers[completelyDone] = null
      }
      completelyDone++
    }
    if (completelyDone === template.parts.length) return done()
    if (partBuffers[completelyDone] !== '') {
      chunk(partBuffers[completelyDone])
      partBuffers[completelyDone] = null
    }
  }
  
  flush()
  
  template.parts.forEach(function(part, i) {
    if (typeof part !== 'object') return
    var childContext = {}
    if (Array.isArray(context)) {
      copyProps(childContext, context[i])
    } else {
      copyProps(childContext, context)
    }
    contextOverwrite(childContext, part.args)
    if (part.type != null) {
      if (!has(functions, part.type)) throw new Error('unknown function "'+part.type+'"')
      if (part.parts) childContext['$block_'+part.type] = part
      var fn = functions[part.type]
      fn(part, functions, childContext, gotChunk.bind(null, i), partComplete.bind(null, i))
    } else {
      renderTemplate(part, functions, childContext, gotChunk.bind(null, i), partComplete.bind(null, i))
    }
  })
}

function copyProps(target, source) {
  Object.keys(source).forEach(function(key) {
    target[key] = source[key]
  })
}

function contextOverwrite(context, source) {
  source.forEach(function(e) {
    context[e.name] = e.value
  })
}

function has(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

// console.log(JSON.stringify(compileTemplate('abc{foo}def{bar qux="5"}ghi')))
