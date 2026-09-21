# WebGPU outline-font atlas benchmark

This benchmark measures the renderer's automatically growing RGBA16F font
atlas under an intentionally pathological dynamic-text workload. By default,
each update lays out 10,000 six-glyph labels (60,000 glyph quads) while four
rounds introduce 256 distinct outlines. It then measures updates that reuse the
completed atlas and frames that only render existing buffers.

The benchmark uses a deterministic synthetic outline font. This keeps TTF
download and parsing outside the measurements and isolates the work of text
layout, MSDF generation, atlas growth and copying, texture rebinding, buffer
uploads, and rendering. The output includes every growth snapshot, final atlas
dimensions and RGBA16F byte size, JavaScript preparation time, and elapsed time
until submitted GPU work has completed.

Run headed Chrome for hardware-backed measurements:

```sh
npm -w @genome-spy/webgpu-renderer run benchmark:font-atlas
```

For a quick diagnostic run:

```sh
npm -w @genome-spy/webgpu-renderer run benchmark:font-atlas -- \
  --labels 2000 --unique-glyphs 64 --growth-rounds 2 \
  --steady-updates 2 --render-frames 2 --runs 1 --headless
```

Raw results are written to the ignored `output/` directory. The benchmark does
not enforce timing thresholds because browser and GPU timings are specific to
the machine, driver, and headed/headless mode.
