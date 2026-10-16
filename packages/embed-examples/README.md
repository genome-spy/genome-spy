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

Three small generic examples show the two additions: `ViewHandle.readData({limit})`
and `PointSelectionApi.setValue(keys)`. Core loads the JSON fixtures; page code
does not keep a second input array or reimplement Core's transforms.

- [Read records in a range](src/regionSummary/): read loaded records, use existing
  named scales and brush parameters to filter them in page code, then compute
  statistics and preview five rows.
- [Select records by key](src/recordSelection/): apply thresholds in the page,
  write every qualifying key into the native selection, and highlight through
  conditional encodings. Mouse picking updates the same subscribed table.
- [Read transformed records](src/transformedData/): change a filter through the
  existing parameter API and read Core's filtered records and derived lengths.

Previously, scales and parameters could control the plot but could not enumerate
its transformed records. Point selections could be read and cleared but could
not be assigned membership. Custom parameter-driven highlighting was already
possible; the setter adds writes to native selection state.

Reads are bounded, detached, synchronous, and report truncation. They inspect
loaded transformed records; they do not fetch data or filter by viewport/brush.
The examples reject truncated reads before calculating whole-range statistics.
They use eager fixtures, so they do not demonstrate lazy-source coverage.
See the [readback guide](https://genomespy.app/docs/api/views/#reading-loaded-records).

Run `npm -w @genome-spy/embed-examples run test:e2e` for focused WebGL and Canvas
interaction tests. Append `?renderer=canvas` to try Canvas manually.
