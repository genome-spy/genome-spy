# Shared stroke API: first GPU rule slice

Status: implemented on fresh-master branch `codex/gpu-rule-borders`, based on
`91ce56e3`. No new dependencies. Canvas rectangle work is set aside; its branch
and the earlier detailed plan remain reference history. This temporary plan must
be reconciled and removed in a later commit before merge.

Related work: [#604](https://github.com/genome-spy/genome-spy/issues/604).
This PR is an independently useful renderer capability, not completion of #604.
The old broad outline branch must not be transplanted into this PR.

## Scope and architecture

`ARCHITECTURE.md`, Core's rendering architecture and the renderer's `AGENTS.md`
place GPU geometry, shaders, resources and picking in the renderer. Core retains
semantic grammar, normalization, scales and dataflow. The experimental adapter
translates inputs through documented renderer entry points.

Extend the existing rule program and numeric channels. `size` remains body
thickness. Replace renderer `color` with `fill` and update both actual consumers:
the Rules example and Core's shared rule/tick adapter. No compatibility alias,
new pass, CPU geometry, scene graph, resource lifecycle or shared framework.
Core still reads its existing `color` encoder and declares no borders.

The renderer exposes `fill`, `stroke`, `fillOpacity`, `strokeOpacity`,
`strokeWidth` (default zero), common `opacity`, and numeric `strokeAlign`:
0 inside, 1 center, 2 outside (default). Existing cap codes remain unchanged.
Contraction / expansion for width w: inside w/0, center w/2–w/2, outside 0/w.
Nonpositive size hides both paints. Common opacity and thin-rule fade apply once.
For premultiplied paints F/S and nested interior/nominal/outer coverage:

```text
result = Ci*F + (Cf-Ci)*(S + (1-S.a)*F) + (Co-Cf)*S
```

Preserve the legacy nominal body triangles and hard butt boundaries. Eight
surrounding mesh cells extend border coverage in the same instanced draw.
Declaring `strokeWidth` selects 54 vertices, even at dynamic zero width; omitting
it retains six vertices and original shading. No extra buffers or occurrence
copies. An expanded single quad failed the bounded pixel proof; reconstructing
hard endpoints from interpolated distances changed exact-boundary samples.

All caps and alignments work for solid ribbons, including empty inset interiors.
The factory rejects a nonempty `dashPatterns` table with any explicitly declared
`stroke`, `strokeWidth`, `strokeOpacity` or `strokeAlign`, before constructing a
program. This includes transparent/zero, dynamic, series and conditional inputs;
no initial-value inspection or update interception. Empty/absent tables and
`strokeDash` alone remain allowed. The original dashed example is retained
alongside a separate solid handle; ranges and cleanup cover both.

## Milestones and verification

- [x] Renderer geometry, paint API, factory boundary and direct consumer rename.
  Commit: `feat(webgpu-renderer): compose aligned borders on solid rules`.
- [x] Actual GPU regression tests, Core adapter tests, two-handle Rules example,
  public type smoke, README and renderer migration backlog.
  Commit: `test(webgpu-renderer): qualify solid rule borders and examples`.
- [x] Independent Sol architecture/consumer and correctness/KISS reviews.
  Neither found an actionable implementation issue. The correctness reviewer
  requested explicit diagonal and bordered placement/clipping qualification;
  those checks were completed afterward. Reviewers did not run GPU profiling.
- [x] Package types/lint/build/tree shaking, renderer unit suite, GPU checks,
  adapter suite, Storybook build and real example resize/DPR/cleanup smoke.
- [x] Verify the committed exact diff and prepare the draft PR.
- [ ] Reconcile remaining tasks and remove this temporary plan before merge.

Permanent tests exercise the public renderer and actual GPU shading/readback:
DPR 1/2 thin/reversed/minimum-length rules, zero/negative sizes, all alignments,
all caps, collapsed inset, transparent/tiny/opaque stroke alpha, retained scalar
and series updates, common/per-paint opacity, crossed draw order, border picking,
placement and clipping. Dash declaration rejection uses the actual createMark
path. Existing neighboring clamp coverage remains unchanged. Tests assert pixels
and behavior rather than new WGSL text or private-method calls.

Validation: 314 renderer unit tests, 74 adapter tests, and four focused GPU tests
pass (zero GPU skips). Workspace type checks pass after fixing the adapter test's
numeric-only expectation helper usage. Package build includes types, lint, tree
shaking and package-content checks. Storybook builds using existing dependencies.
Release checks pass: this unpublished renderer/experimental adapter change adds
no fragment; existing master fragments already plan the fixed group's minor bump.

Outside-Git candidate evidence is in this chat's `gpu-rule-slice/` artifacts.
Actual master/candidate RGBA readbacks cover 150 occurrences per DPR, horizontal,
3:4 diagonal and reversed, fractional phases, all caps and thin/minimum sizes.
All alignments and 13 width/alpha combinations give 11,700 comparisons: zero
failed cases, maximum paint-oracle error 1.316/255. The outside-only comparison
also gives zero changed fill bytes, and default pixels match master exactly.
Chrome 156 / Apple Metal-3 is one hardware sample, not cross-driver qualification.

Performance: CPU submission through GPU completion, 800×400, five warmups and
30 alternating paired samples. Default medians match master: 0.4ms for 1k rules,
0.8/1.8ms for 100k at DPR 1/2. Outside-border medians are 0.9/0.6ms for 1k and
8.3/17.8ms for 100k. Dense borders exceed a 60fps frame budget at DPR 2. Declared
zero-width geometry also costs more at 100k (2.1/2.5ms). Document this; do not
silently wire every future Core rule into dynamic border geometry.

## Size and delivery gates

Ten delivery files: rule program/factory, renderer types/type smoke, existing GPU
rule test, existing Rules example, README/backlog, Core adapter/adjacent test.
The original 478-added-line allocation shifted toward real GPU tests and away
from runtime code. Limits remain ten delivery files, 250 added non-comment
production lines, and 500 raw added lines, excluding this temporary plan. Stop
and re-scope beyond them; do not compress code or drop coverage to fit.
Exact committed delivery diff against `origin/master`: ten files, +494/-22 raw
lines (net +472). Non-comment runtime JS, including the executable example:
+123/-17 (net +106); production source alone is +85/-14 (net +71). The temporary
plan is additional and reported separately before opening the PR.

## Deferred #604 work

No Core grammar/schema, public stroke alignment, normalization change, WebGL,
Canvas/SVG, other marks, or dashed-border geometry enters this slice. Re-plan
subsequent independently useful work after reviewing this implementation.

Before Core exposure, resolve common opacity ownership in existing fixFill /
fixStroke helpers, which currently fold it into per-paint opacity. Reuse existing
paint fallback, scale/legend identity, conditional encodings and config/property
precedence; no rule-only normalization workaround. Core strokeAlign is intended
as a property/ExprRef, not a new encoding. Preserve inwardStroke true→inside /
false→center with explicit alignment/config precedence.

Full #604 qualification still requires dashed ribbon boundaries, WebGL/native
parity, all filled families, bounds/picking, text order and original glyph
contours, shared scales/legends, matching docs/schema and minor release notes.
Retain strict Canvas coverage/performance requirements and the accepted native
vector-SVG one-output-pixel hairline exception. Do not resurrect the abandoned
Canvas rectangle compositor or imply this PR completes those requirements.
