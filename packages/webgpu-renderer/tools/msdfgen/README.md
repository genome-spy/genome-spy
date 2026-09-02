# msdfgen WASM build sources

This directory vendors the dependency-free core of
[`msdfgen` v1.13](https://github.com/Chlumsky/msdfgen/tree/v1.13) at commit
`1874bcf7d9624ccc85b4bc9a85d78116f690f35b` (retrieved 2026-09-01).

- `upstream/` is an unmodified copy of the upstream `core/` directory,
  `msdfgen.h`, and `LICENSE.txt`.
- `wrapper.cpp` is GenomeSpy's narrow path-oriented C ABI.
- `build.mjs` compiles the wrapper and upstream core with Emscripten and writes
  the embedded oracle module to
  `tests/oracles/msdfgen/runtime/wasmBinary.js`.

The generated module is used only by explicit comparison tests and scripts.
Neither these sources nor the generated runtime is included in the published
package. Regenerate with Emscripten 6.0.9 from the package root:

```sh
npm run build:msdf-oracle
```

The build intentionally excludes msdfgen extensions, FreeType, Skia, TinyXML,
libpng, and the standalone command-line application. The upstream MIT license
is included in `upstream/LICENSE.txt` and copied beside the generated oracle.
