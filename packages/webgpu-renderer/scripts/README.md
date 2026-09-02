# Renderer scripts

These scripts verify the package as a distributable WebGPU renderer. Run them
from `packages/webgpu-renderer`, or use the equivalent workspace commands from
the repository root.

## Commands

```sh
npm run test:tsc
npm run test:bundle
npm run build:default-font
npm run test:msdf-oracle
npm run benchmark:resources -- --headless
npm run compare:path-points
npm run compare:path-text
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

## Default font

`build:default-font` downloads a checksum-pinned Google Fonts copy of Lato
Regular and uses FontTools to build `src/fonts/DefaultFont.ttf`. The derivative
is internally renamed to **Default Font** because Lato is a Reserved Font Name
under the SIL Open Font License.

The default repertoire contains printable ASCII, a focused set of Western-
European letters, the Greek alphabet, superscripts, subscripts, and common
mathematical and plot symbols. The generated font retains only TrueType
outlines, horizontal metrics, Unicode mapping, minimal naming metadata, and
GPOS kerning. Hinting, GSUB, legacy `kern`, and unrelated tables are removed.

Use a previously downloaded pinned source when working offline:

```sh
npm run build:default-font -- --source /path/to/Lato-Regular.ttf
```

Use the core repertoire to measure the marginal cost of the Western-European
letter additions:

```sh
npm run build:default-font -- --repertoire core --output /tmp/DefaultFont-core.ttf
```

The [resource-sharing benchmark](./resourceSharingBenchmark/README.md) has its
own runner, methodology, and checked-in baseline.

## Canonical-oracle comparisons

The comparison commands are development tools. They import the package-excluded
canonical msdfgen oracle directly from `tests/oracles/msdfgen/`; production
marks and ordinary browser bundles use only the WGSL generator.
`test:msdf-oracle` runs the worker smoke test and the bounded visual-difference
regressions without rebuilding the checked-in oracle.

### Path-text backend comparison

`compare:path-text` renders the same printable-ASCII TrueType scene using the
sparse WGSL generator and canonical msdfgen WASM. It writes `path-text-wgsl.png`,
`path-text-wasm.png`, and a high-contrast `path-text-diff.png` to a temporary
directory and prints pixel-difference statistics as JSON.

In the diff image, magenta pixels contain excess WGSL coverage, cyan pixels
contain excess WASM coverage, and yellow-to-red pixels differ while both
backends still cover the pixel.

Use `--output <directory>` to retain the images in a chosen location and
`--threshold <0-255>` to set the maximum per-channel difference that is treated
as matching. The default threshold is 8. Use `--dpr 2` to reproduce Retina-style
sampling; the default device pixel ratio is 1.

```sh
npm run compare:path-text -- --output /tmp/path-text --threshold 8 --dpr 2
```

### Path-point backend comparison

`compare:path-points` uses the same comparison harness for all Path Points
symbols. It renders each path at 37 and 45 degrees with a four-pixel outline,
writes `path-points-wgsl.png`, `path-points-wasm.png`, and
`path-points-diff.png`, and reports mismatch counts separately for every path
index. Per-symbol counts make the compound overlapping path distinguishable
from regressions in stars, rectangles, and other ordinary contours. Both
generators use RGBA8 by default so the diff isolates generation rather than
texture quantization. Pass `--wgsl-format rgba16float` to compare the preferred
WGSL rendering against the quantized WASM reference. Pass `--point-size 30` to
match the largest symbols in the Path Points story; the default is 60 pixels.
`--angles 0,15,30,45` expands the rotation matrix. `--tile-size`, `--spread`,
and `--shape-padding` override the shared atlas geometry for controlled
resolution and distance-range experiments.

```sh
npm run compare:path-points -- --output /tmp/path-points --threshold 8 --dpr 2
```

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
