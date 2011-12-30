var vacuum = require('./')

exports.foreach = function FOREACH(template, functions, context, chunk, done) {
  if (context.element == null) throw new Error('"element" value is necessary')
  
  var list = vacuum.getFromContext(context, 'list')
  if (!Array.isArray(list)) throw new Error('context[context.list] is not an array (context['+JSON.stringify(context.list)+'] is a '+(typeof list)+')')
  
  var templateCopy = {}
  vacuum.copyProps(templateCopy, template)
  delete templateCopy.type
  
  var contexts = list.map(function(element) {
    var copy = {}
    vacuum.copyProps(copy, context)
    copy[context.element] = element
    return copy
  })
  
  vacuum.renderTemplate({parts: repeat(templateCopy, list.length)}, functions, contexts, chunk, done)
  
  function repeat(value, count) {
    var arr = []
    while (count--) arr.push(value)
    return arr
  }
}

exports.var = function VAR(template, functions, context, chunk, done) {
  var value = vacuum.getFromContext(context, 'name')
  chunk(value)
  done()
}

exports.childblock = function CHILDBLOCK(_, functions, context, chunk, done) {
  var template = {}
  if (!context.of) throw new Error('context must have "of"')
  vacuum.copyProps(template, context['$block_'+context.of])
  delete template.type
  if (!template.parts) throw new Error('template must have "parts", only has '+Object.keys(template).join(','))
  
  vacuum.renderTemplate(template, functions, context, chunk, done)
}
