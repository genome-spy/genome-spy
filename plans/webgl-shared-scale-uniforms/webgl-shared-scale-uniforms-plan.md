# Share WebGL positional scale uniforms

Use [#698](https://github.com/genome-spy/genome-spy/issues/698) to bring the
measured SampleView improvement into WebGL through the same resource path as
shared x scales in stacked tracks.

- SampleView and track layouts keep their existing resolution rules. During
  shader preparation, eligible x and y mappings owned by an ancestor borrow one
  renderer buffer per `ScaleResolution`. Ownership is stable if tracks are
  inserted or removed. Primary and secondary endpoints read the same block.
  Independent scales and mappings that require variable-length domain arrays use
  the existing mark-local fields.
- Reuse existing domain packing and gap geometry. A fixed std140 block has room
  for the positional domain, gap geometry, and integer cut count. The shared
  block is independent of placement and of the presence of gaps. Keep ranges and
  padding in the mark and avoid applying equal local values when navigation only
  changes the domain. Existing category and cut textures keep their lifetimes.
- Reserve one binding point per axis in a program. The renderer retains shared
  buffers with the existing scale resources and deletes them on the last
  release. As in
  [Three.js uniform groups](https://github.com/mrdoob/three.js/blob/r182/src/renderers/webgl/WebGLUniformsGroups.js),
  use the GPU resource identity independently of the per-program binding. Read
  completed mappings before the first use in each draw pass and upload only
  changed bytes. A pass starts after before-render hooks, including in picking
  and detached raster export.
- Verify a composed chart with shared x, shared y, and an independent track.
  Exercise paired endpoints, grouped SampleView, picking, and raster export. Run
  warmed baseline comparisons for the same 20-attribute SampleView and an
  in-memory many-track stack using native horizontal pan and zoom. Record
  runtime SLOC against the shared-row prototype. Display grammar and public APIs
  stay the same.

Tentative commit `perf(core): share WebGL positional scale uniforms`.

## Implementation results

Compared the branch with `master` at `5278fb70d` in headed Chrome 157.0.8103.80
on macOS with ANGLE Metal. The SampleView had 1,536 samples in 24 groups and 20
visible metadata attributes. The track stack had 24 tracks using one
high-precision index scale with coordinates above 2²⁴.

The diagnostic counts below are per visible frame. No layout or picking passes
ran during these traces. SampleView diagnostics use a fixed peek anchor for
comparing raster exports after regrouping.

| Interaction       | View, baseline → branch | Mark, baseline → branch | Shared, baseline → branch | Total, baseline → branch |
| ----------------- | ----------------------: | ----------------------: | ------------------------: | -----------------------: |
| SampleView scroll |                 60 → 60 |                  33 → 2 |                     0 → 1 |                  93 → 63 |
| Track pan         |                 24 → 24 |                  24 → 0 |                     0 → 1 |                  48 → 25 |
| Track zoom        |                 24 → 24 |                  24 → 0 |                     0 → 1 |                  48 → 25 |

SampleView scroll yielded 40 frames on each build. Pan yielded 26 frames on each
build. Wheel zoom uses inertia, so the frame total can vary with scheduling.

Chrome main-thread task CPU time came from five alternating pairs after a
warm-up pair, with the counters disabled. Negative changes favor the branch.

| Interaction       | Median paired change | Range across pairs |
| ----------------- | -------------------: | -----------------: |
| SampleView scroll |               −16.2% |   −27.9% to +29.9% |
| Track pan         |                −1.0% |    −9.2% to +50.3% |
| Track zoom        |                +1.2% |   −10.3% to +22.0% |

The SampleView median improved with substantial run-to-run variation. The track
traces showed a repeatable reduction in uploads and mixed CPU timings. The
browser regression also checked picking and raster output after changing the
shared domain in a chart with shared x, shared y, and an independent x.

The measured version added 150 net non-comment production lines. After review,
the five production files add 246 and delete 84 non-comment lines for a net
increase of 162. The PoC added 151 net non-comment lines in the same WebGL
directory, plus its renderer-independent SampleView helper.

The review regression exercises `x2` and `y2` declared before their primaries
and checks live redraws after immediate zoom and a reactive gap-width change.
This completes the WebGL work. The WebGPU renderer API and integration remain
tracked in [#698](https://github.com/genome-spy/genome-spy/issues/698).

### Reproduce

Run the App development server for `master` and the branch in separate
worktrees. From the branch, pass their URLs to the benchmark in that order.

```sh
mkdir -p output/shared-scale-uniforms
node plans/webgl-shared-scale-uniforms/benchmark.mjs \
    http://127.0.0.1:4200 http://127.0.0.1:4201 \
    output/shared-scale-uniforms/timing.json 5
SHARED_SCALE_DIAGNOSTICS=1 node plans/webgl-shared-scale-uniforms/benchmark.mjs \
    http://127.0.0.1:4200 http://127.0.0.1:4201 \
    output/shared-scale-uniforms/diagnostic.json 1
```
