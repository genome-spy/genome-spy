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

The [resource-sharing benchmark](./resourceSharingBenchmark/README.md) has its
own runner, methodology, and checked-in baseline.

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
