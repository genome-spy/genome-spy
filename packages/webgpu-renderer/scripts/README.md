# Renderer scripts

These scripts verify the package as a distributable WebGPU renderer. Run them
from `packages/webgpu-renderer`, or use the equivalent workspace commands from
the repository root.

## Commands

```sh
npm run test:tsc
npm run test:bundle
npm run benchmark:resources -- --headless
npm run lint
npm run build
```

`build` is the delivery check. It runs the declaration check, bundle
verification, and lint, then performs `npm pack --dry-run` and rejects
development-only files from the package. The package's `prepublishOnly` hook
uses the same command.

To run the checks from the repository root:

```sh
npm -w @genome-spy/webgpu-renderer run build
```

## Resource-sharing benchmark

`runResourceSharingBenchmark.mjs` creates 500 rect marks and 500 text marks by
default. It compares the normal renderer against a benchmark-only control that
bypasses program-template and immutable-font-resource sharing. No product
feature flag is involved.

For each mode, the benchmark records mark initialization as both synchronous
JavaScript time and time until submitted GPU work settles. It then renders the
same marks in two orders: all rects followed by all texts, and alternating rect
and text marks. Rendering reports JavaScript frame cost, serial GPU-completed
frame time, and `requestAnimationFrame` cadence. The three metrics are kept
separate because command encoding cost and observable frame rate are not the
same measurement.

Run headed Chrome for authoritative hardware-backed results:

```sh
npm -w @genome-spy/webgpu-renderer run benchmark:resources
```

Use `--headless` only for diagnostics. Increase the stress level with
`--count 1000` when 500 marks of each type do not separate the compared modes.
Raw results are written under the ignored repository `output/` directory.
The checked-in reference result and interpretation are in
[`resource-sharing-benchmark-baseline.md`](./resource-sharing-benchmark-baseline.md).

## Bundle verification

[`verifyTreeShaking.mjs`](./verifyTreeShaking.mjs) bundles each fixture with
Rollup, minifies the emitted ESM with esbuild, and reports minified and
gzip-9 sizes together with the Rollup module count. It also verifies that an
unexported internal package path cannot be imported.

The fixtures under [`fixtures/`](./fixtures/) are intentionally small public
API entry points used for stable composition measurements:

- `rendererOnly.js` measures the root renderer entry point.
- `pointLinear.js` measures a point mark with a linear scale and checks that
  unrelated mark and scale programs are tree-shaken.
- `pointOrdinal.js` measures a point mark with an ordinal scale.
- `customIdentityMark.js` measures a custom mark alongside the renderer.
- `textCustomFont.js` exercises text-program configuration with a
  caller-provided font resource.
- `textLato.js` measures the optional bundled Lato font preset.

When adding or changing a fixture, keep its imports representative of the
public package specifiers. Update the verification assertions when the
expected module graph or measurement contract changes.
