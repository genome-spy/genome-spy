# Embedding Examples

This package contains examples on using the public GenomeSpy API to adjust
scales, dynamically update data, etc.

Each example lives in its own directory under `src/`. The directory contains
an `index.html`, its entry module (`index.js` or `index.jsx`), and any
example-specific styles. Open the package root in development to browse the
examples by topic.

You can launch the examples from the project root using the command:

```sh
% npm -w @genome-spy/embed-examples run dev
```

The examples rely directly on the `@genome-spy/core` ESM package, but can be adapted for the bundled NPM/CDN package as shown in the examples on the [Getting Started](https://genomespy.app/docs/getting-started/) page.

## Inspect visualization data

These browser-only examples use fixed synthetic omics data and the optional
`@genome-spy/core/view-query` entry from the same Core module instance as `embed`.

- [Copy number region summary](src/regionSummary/): zoom or brush to compute
  regional statistics over all matches while showing a five-row preview.
- [Expression findings](src/expressionFindings/): filter and summarize pathways,
  rank representative genes, and apply temporary labels and outlines. Replacing
  the toy contrast invalidates previous findings.
- [Retained gene data](src/retainedGeneData/): compare loaded source rows with
  rows kept by a display filter, using opt-in source retention.

Each page explains the hooks it uses and shows readable track/source information
with expandable API responses. GenomeSpy executes declarative filters and query
analysis in the browser; the application formats the returned rows and summaries.
Queries inspect currently loaded data rather than fetching off-screen records.
The examples use eager fixtures; lazy-source coverage is outside their scope.
See the [view query guide](https://genomespy.app/docs/api/views/#choosing-a-hook).

Run the focused interaction tests with
`npm -w @genome-spy/embed-examples run test:e2e`. They exercise WebGL and Canvas;
append `?renderer=canvas` to an example URL to try Canvas manually.
