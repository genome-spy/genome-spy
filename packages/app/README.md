# GenomeSpy Cohort App

![Teaser](https://raw.githubusercontent.com/genome-spy/genome-spy/master/docs/img/app-teaser.png)

![npm version](https://img.shields.io/npm/v/@genome-spy/app)

This package provides a user interface for interactive analysis of multiple
samples, which can be filtered, sorted, and grouped flexibly. A session handling
with provenance, URL hashes, and bookmarks is included.

## WebGPU example parity

Run the recursive App example inventory under WebGPU and WebGL from the
repository root:

```sh
npm -w @genome-spy/app run smoke:examples:webgpu
```

The command discovers every JSON specification under `examples/app`, waits for
App and visible lazy-data readiness, fails on browser, request, validation, or
empty-canvas errors, and writes screenshots plus a comparison report under
`output/webgpu-app`. App comparisons fail when mean RGB error exceeds 6% or
more than 15% of pixels differ by over 32/255 in any color channel.

Use the focused picking check for interactive sample plots and repeat it at the
required device pixel ratios:

```sh
node packages/core/scripts/runWebGpuExamples.mjs --scope app \
  --compare-webgl --check-picking --dpr 2 \
  examples/app/expression-zscores.json
```

The picking check requires the same datum-backed hover path that feeds
tooltips and point selections under both renderers. Small backend-specific font
offsets remain within the pixel comparison tolerance.
