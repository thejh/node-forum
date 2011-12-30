`vacuum` is another node.js module for templating.

Goals
=====
This is not necessarily what the code already does, e.g. I have no idea whether it's fast.

 - be fast
 - be secure
 - be streaming (e.g. send out a static head while the DB is still looking up some data)
 - be easy to understand (no big pile of special cases)

Basic usage
===========
Look into the "example" folder for a working example.

Setup code:

```js
var vacuum = require('vacuum')
// Load all .html files from that folder and register them by name.
var renderTemplate = vacuum.loadSync(__dirname+'/templates')
```

Rendering a template to a HTTP response (`article.html` is the file name of the template):

```js
renderTemplate('article', {articleID: articleID, title: articleTitle}, httpResponse)
```

The template files are normal HTML with some special-syntax tags inside. Example:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>
      {var name="title"}
    </title>
  </head>
  <body>
    {childblock of="document"}
  </body>
</html>
```

This could be a HTML document template. It only contains bodyless special tags, the syntax for them is
`{tagName key1="value1" key2="value2" ...}`. The tag name determines which template should be inserted.
There are two kinds of templates:

 - template files (like this one)
 - template functions (like `var` and `childblock`)

Template functions are JS functions that can be used inside of templates. Because of them, there's
something called "context". In the `renderTemplate` example above, the initial context is
`{articleID: articleID, title: articleTitle}`, but context can also be changed by template functions - however, these changes
only affect descendants of that template function. Attributes also change the context - in the
HTML template above, the `{var name="title"}` inclusion calls the `var` template with the context
`{articleID: articleID, title: articleTitle, name: 'title'}`. The `var` template then does (this is
somewhat simplified) `chunk(context[context.name]); done()`.

Here's an example that uses the HTML template defined above:

    {#document title="Test"}
      Hello You!
    {/document}

This example contains an inclusion with body - it has an opening tag with `#` and a closing tag with `/`.
The body of the inclusion becomes a template which is given to `document`'s context as `$block`.
`document` can then do things with it - it could e.g. call it multiple times with different contexts.
However, here it's only used with the `{childblock}` default template function.


Making your own template functions
==================================

You can make your own template functions by attaching them to `renderTemplate`:

```js
renderTemplate.connection = function CONNECTION(template, functions, context, chunk, done) {
  var connection = vacuum.getFromContext(context, 'name')
  var address = connection.remoteAddress
  chunk(address+':'+connection.remotePort)
  done()
}
```

As you can see, there are five parameters.

`template` is a code representation of the tag used to
reference this template. If the tag has a body, that body is stored in the `parts` property of
`template`.

`functions` is the same as your `renderTemplate`.

`context` is the context (a modified copy of the context of the template inclusions parent).

`chunk` is the function used to write rendered data as a string. It takes one argument.

`done` is a normal callback - call it without arguments for success (after you've finished all
calls to `chunk`), call it with an error if an error occurs.

Default functions
=================
You can make your own template functions, but there are also some defaults:

foreach
-------
This calls the body that was given to it for each element in the given array.

Important context variables:

 - `list` - name of the context variable which contains the array
 - `element` - name of the context variable inside of which the element from the array should be stored

var
---
This prints the value from the variable whose name is stored in `name`.

childblock
----------
This takes the template stored in `$block_<of>` on the context and renders it. It needs a `of` context variable that specifies
the template from whose inclusion the child block should come.
