# Renderer scripts

These scripts verify the package as a distributable WebGPU renderer. Run them
from `packages/webgpu-renderer`, or use the equivalent workspace commands from
the repository root.

## Commands

```sh
npm run test:tsc
npm run test:bundle
npm run build:default-font
npm run fetch:msdf-oracle
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

## Canonical-oracle comparisons

The comparison commands are development tools. `fetch:msdf-oracle` downloads
the checksum-pinned
[`genome-spy/msdfgen-oracle` v0.1.0 release](https://github.com/genome-spy/msdfgen-oracle/releases/tag/v0.1.0)
into a Git-ignored directory under `tests/oracles/msdfgen/`. Production marks,
ordinary unit tests, package builds, and published files use only the WGSL
generator and do not need network access. Oracle tests, comparison commands,
and Storybook fetch the release automatically through npm pre-scripts.

The Path Points Storybook story exposes a `backend` control for switching
between the production WGSL generator and canonical msdfgen. Both backends use
the same paths and atlas geometry; the oracle texture is RGBA8 while the
production texture is RGBA16F.

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
index. It also writes raw `path-points-atlas-{wgsl,wasm,diff}.png` textures and
reports per-path atlas RGB and reconstructed-sign differences. These isolate
generation defects from filtering, distance decoding, stroke thresholds, quad
bounds, and blending. Median statistics for the eight-pixel band around the
canonical contour focus the report on distances ordinary fills and outlines
actually sample. Per-symbol counts make the compound overlapping path
distinguishable from regressions in stars, rectangles, and other ordinary
contours. The WGSL renderer uses its production RGBA16F atlas by default. The
atlas diff quantizes its readback to the canonical oracle's RGBA8 encoding so
texture differences remain directly inspectable. Pass
`--wgsl-format rgba8unorm` to insert a development-only GPU quantization pass
and isolate generator geometry from texture precision and filtering. The
default point size of 60 pixels matches the largest symbols in the Path Points
story.
`--angles 0,15,30,45` expands the rotation matrix. `--tile-size`, `--spread`,
and `--shape-padding` override the shared atlas geometry for controlled
resolution and distance-range experiments. Use `--stroke-width 0` to isolate
fill reconstruction and `--path-indices 2,12,14` to compare selected paths
without the provisional overlapping-contour case.

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
- `textCustomFont.js` measures text rendering with a caller-created TrueType
  font.

When adding or changing a fixture, keep its imports representative of the
public package specifiers. Update the verification assertions when the
expected module graph or measurement contract changes.
