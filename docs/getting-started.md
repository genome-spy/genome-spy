# Getting Started

There are three ways to get quickly started with GenomeSpy visualizations: the
Playground app, Observable notebooks, and embedding GenomeSpy on HTML pages.
More advanced users can use GenomeSpy as a visualization library in web
applications.

## Playground

The easiest way to try out GenomeSpy is the [Playground
](https://genomespy.app/playground/) app, which allows you to experiment with
different visualization specifications directly in your web browser. You can
load data from publicly accessible web servers or from your computer. The app is
still rudimentary and does not support saving or sharing visualizations.

## Observable notebooks

You can embed GenomeSpy into an [Observable](https://observablehq.com) notebook.
Please check the [GenomeSpy
collection](https://observablehq.com/collection/@tuner/genomespy) for usage
examples.

## Local or remote web server

For more serious work, you should use the GenomeSpy JavaScript library to
create a web page for the visualization:

1. Create an HTML document (web page) by using the example below
2. Place the visualization spec and your data files into the same directory
   as the HTML document
3. Copy them onto a web server or start a local web server in the directory

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
current public API. For deails, see the [API Documentation](./api.md).

!!! warning "Check the latest version!"

    The versions in the examples below may be slightly out of date. The current
    version is:

    ![npm version](https://img.shields.io/npm/v/@genome-spy/core)

#### Load the spec from a file

This template loads the spec from a separate `spec.json` file.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>GenomeSpy</title>
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.jsdelivr.net/npm/@genome-spy/core@0.28.x/dist/style.css"
    />
  </head>
  <body>
    <script
      type="text/javascript"
      src="https://cdn.jsdelivr.net/npm/@genome-spy/core@0.28.x/dist/index.js"
    ></script>

    <script>
      genomeSpyEmbed.embed(document.body, "spec.json", {});
    </script>
  </body>
</html>
```

#### Embed the spec in the HTML document

You can alternatively provide the specification as a JavaScript object.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>GenomeSpy</title>
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.jsdelivr.net/npm/@genome-spy/core@0.28.x/dist/style.css"
    />
  </head>
  <body>
    <script
      type="text/javascript"
      src="https://cdn.jsdelivr.net/npm/@genome-spy/core@0.28.x/dist/index.js"
    ></script>

    <script>
      const spec = {
        data: {
          sequence: { start: 0, stop: 6.284, step: 0.39269908169, as: "x" },
        },
        transform: [{ type: "formula", expr: "sin(datum.x)", as: "sin" }],
        mark: "point",
        encoding: {
          x: { field: "x", type: "quantitative" },
          y: { field: "sin", type: "quantitative" },
        },
      };

      genomeSpyEmbed.embed(document.body, spec, {});
    </script>
  </body>
</html>
```

### Genomespy.app website examples

The examples on the [genomespy.app](https://genomespy.app/) main page are stored
in the [website-examples](https://github.com/genome-spy/website-examples) GitHub
repository. You can clone the repository and launch the examples locally for
further experimentation.

## Using GenomeSpy as a visualization library in web applications

TODO

Meanwhile, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.
