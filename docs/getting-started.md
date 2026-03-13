# Getting Started

GenomeSpy is a visualization toolkit for genomic data. More specifically, it is
a JavaScript library that can be used to create interactive visualizations of
genomic data in web browsers. To visualize data with GenomeSpy, you need to:

1. Have some data to be visualized
2. Write or find a [visualization specification](grammar/index.md) that
   describes how the data should be visualized
3. Embed GenomeSpy into a web page and initialize it with the specification and
   the data
4. Open the web page with your web browser

You can get started with GenomeSpy in three ways: the Playground app, Observable
notebooks, and embedding GenomeSpy on HTML pages. More advanced users can use
GenomeSpy as a visualization library in web applications.

## Playground

The easiest way to try out GenomeSpy is the [Playground
](https://genomespy.app/playground/) app, which allows you to experiment with
different visualization specifications directly in your web browser. You can
load data from publicly accessible web servers or from your computer. The app is
still rudimentary and does not support saving or sharing visualizations.

## Observable notebooks

You can embed GenomeSpy into an [Observable](https://observablehq.com) notebook.
See the [GenomeSpy
collection](https://observablehq.com/collection/@tuner/genomespy) for usage
examples.

## Local or remote web server

For more serious work, use the GenomeSpy JavaScript library to create a web
page for your visualization:

1. Create an HTML document by using one of the examples below
2. Place the visualization specification (spec) and your data files into the same
   directory as the HTML document
3. Copy them to a remote web server or start a local web server in that directory

### Local web server

Python comes with an HTTP server module that can be started from command
line:

```
python3 -m http.server --bind 127.0.0.1
```

By default, it serves files from the current working directory. See Python's
[documentation](https://docs.python.org/3/library/http.server.html) for details.

### HTML template

The templates below load the GenomeSpy JavaScript library from a content
delivery network. Because the specification schema and the JavaScript API are
not yet 100% stable, it is recommended to use a specific version.

The `embed` function initializes a visualization into the HTML element given as
the first parameter using the specification given as the second parameter. The
function returns a promise that resolves into an object that provides the
current public API. For details, see the [API Documentation](./api.md).

#### Load the spec from a file

This template loads the spec from a separate `spec.json` file placed in the same directory.

##### Recommended: Module Script

This is the modern browser approach. It avoids global variables and is the
recommended option for new pages.

SNIPPET getting-started/core-module-spec-file.html

##### Alternative: Plain Script Tag

This version keeps the older global-style API for compatibility.

SNIPPET getting-started/core-plain-spec-file.html

#### Embed the spec in the HTML document

You can alternatively provide the specification as a JavaScript object.

SNIPPET getting-started/core-module-inline-spec.html

### genomespy.app website examples

The examples on the [genomespy.app](https://genomespy.app/) home page are stored
in the [website-examples](https://github.com/genome-spy/website-examples) GitHub
repository. You can clone the repository and launch the examples locally for
further experimentation.

## Using GenomeSpy as a visualization library in web applications

The [@genome-spy/core](https://www.npmjs.com/package/@genome-spy/core) npm
package provides browser-ready bundles for use on web pages, as shown in the
examples above. It also provides
[ESM](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
sources for use with bundlers such as [Vite](https://vitejs.dev) and
[Webpack](https://webpack.js.org/). For examples of this kind of integration, see:

- The [embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
  package contains examples of embedding GenomeSpy in web applications and using the API.
- [SegmentModel Spy](https://github.com/genome-spy/segment-model-spy) is an example
  of a complete web application that uses GenomeSpy for visualization.
