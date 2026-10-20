# Embedding Examples

This package contains examples on using the public GenomeSpy API to adjust
scales, dynamically update data, etc.

Each example lives in its own directory under `src/`. The directory contains
an `index.html`, its entry module (`index.js` or `index.jsx`), and any
example-specific styles. Open the package root in development to browse the
examples by topic.

The `cooperativeWheel/` example demonstrates page scrolling, scrollable Core
viewports, and App overview/closeup behavior with inline data. Its host page
provides the Ctrl-zoom instructions and enables `wheelBehavior: "cooperative"`
for each embed.

You can launch the examples from the project root using the command:

```sh
% npm -w @genome-spy/embed-examples run dev
```

Run the cooperative demo's native-wheel checks with installed Chrome:

```sh
npm -w @genome-spy/embed-examples run test:cooperative-wheel
```

The check starts its own local server. An optional server URL can be passed after
`--` to use an already running embed-examples server.

The examples use the public Core and App ESM embedding APIs, which can be adapted for the bundled NPM/CDN packages as shown on the [Getting Started](https://genomespy.app/docs/getting-started/) page.
