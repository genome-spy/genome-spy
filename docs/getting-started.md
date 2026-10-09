---
title: Getting Started with GenomeSpy
---

# Getting Started

GenomeSpy Core visualizations are defined by [JSON
specifications](grammar/index.md) that describe the data and how it should be
displayed. You can try a specification in the Playground or embed one in a web
page. [GenomeSpy for Python](https://genomespy.app/genome-spy-python/) can build
the same specifications from Python chart definitions. If you are analyzing an
existing GenomeSpy App, see [Analyzing Sample
Collections](sample-collections/analyzing.md).

## Try a JSON specification in the Playground

The [Playground](https://genomespy.app/playground/) lets you edit a JSON
specification and preview the visualization in your browser. You can load data
from a publicly accessible web server or from your computer. The Playground
does not support saving or sharing visualizations, so keep a copy of your
specification if you want to reuse it.

## Embed a JSON specification in a web page

To use a JSON specification outside the Playground, embed GenomeSpy Core in an
HTML page:

1. Create an HTML document using one of the templates below.
2. Place the specification and any local data files alongside the HTML document.
3. Serve the files from a local or remote web server and open the page in a
   browser.

When writing JSON, turn on [editor suggestions and error
checking](grammar/index.md#schema-assisted-editing). They catch common mistakes
as you type and show the available properties and their documentation.

### HTML templates

The templates below load GenomeSpy Core from a content delivery network. They
use a specific package version so later releases do not change the library
loaded by your page.

The `embed` function initializes a visualization into the HTML element given as
the first parameter using the specification given as the second parameter. The
function returns a promise that resolves into an object that provides the
current public API. For details, see the [JavaScript API](api/index.md).

#### Load the spec from a file

This template loads the spec from a separate `spec.json` file placed in the same directory.

SNIPPET getting-started/core-module-spec-file.html title="Recommended: Module Script"

SNIPPET getting-started/core-plain-spec-file.html title="Legacy Alternative: Plain Script Tag"

#### Embed the spec in the HTML document

You can alternatively provide the specification as a JavaScript object.

SNIPPET getting-started/core-module-inline-spec.html title="Module Script"

### Local web server

You can use any HTTP server for local development. For example, Python's
standard library provides one:

```
python3 -m http.server --bind 127.0.0.1
```

Run the command from the directory containing your files. It does not require
the GenomeSpy for Python package. See Python's
[documentation](https://docs.python.org/3/library/http.server.html) for details.

### genomespy.app website examples

The examples on the [genomespy.app](https://genomespy.app/) home page are stored
in the [website-examples](https://github.com/genome-spy/website-examples) GitHub
repository. You can clone the repository and launch the examples locally for
further experimentation.

## Python

[GenomeSpy for Python](https://genomespy.app/genome-spy-python/) is an alternative
way to author Core visualizations. It builds validated JSON specifications from
Python chart definitions and displays the resulting visualizations in notebooks
or web pages. See its
[getting-started guide](https://genomespy.app/genome-spy-python/getting-started.html)
to install the package and create your first chart.

## Analyze a configured GenomeSpy App

If you have access to a configured GenomeSpy App, you can analyze its sample
collection without writing a specification. Start with
[Analyzing Sample Collections](sample-collections/analyzing.md).

## Observable notebooks

You can embed GenomeSpy into an [Observable](https://observablehq.com) notebook.
See the [GenomeSpy
collection](https://observablehq.com/collection/@tuner/genomespy) for usage
examples.

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
- [MutGlyph](https://github.com/genome-spy/MutGlyph) is an R package that embeds
  GenomeSpy in an htmlwidget and provides interactive
  counterparts to established `maftools` plots. See the [MutGlyph
  documentation](https://genomespy.app/MutGlyph/) for examples.
