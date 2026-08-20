# Phase 4: Separate Target and Presented Geometry

Status: Discarded as an implementation plan; replace after Phase 3 is replanned

Tentative PR title: `feat(core): animate persistent layout geometry`

## Purpose

Animate non-structural layout changes for instances that exist before and after
the change. Layout computes canonical targets once; animation changes only the
coordinates used for presentation.

## Findings to preserve

One mutable `coords` value is insufficient for transitions. Logical layout must
not read intermediate animation frames as input to the next layout, while
drawing and interaction must follow what the user currently sees.

At minimum, a transitioning instance needs:

- its current presented geometry when a transition begins or is interrupted;
- its newly computed target geometry;
- enough timing/easing state to derive the next presented geometry.

Clay's transition records and interruption behavior provide supporting evidence
for this small state model: when a target changes, Clay starts again from the
current presentation. Its implementation also compares parent-relative motion
to avoid animating movement inherited from a parent. GenomeSpy should preserve
the observable invariants without copying that algorithm, because its
transitions must not recompute layout on animation frames. See Clay's
[transition state](https://github.com/nicbarker/clay/blob/main/clay.h#L1154-L1169)
and [target-change handling](https://github.com/nicbarker/clay/blob/main/clay.h#L4367-L4431).

A permanently stored `from` rectangle may not be necessary if it can be captured
by the transition coordinator. The representation should be chosen only after
Phase 3 establishes how retained backend work accesses geometry.

If Phase 2/3 adopts flat numeric instance geometry, transitions can update
presented scalar fields directly and calculate dependent clips in an explicit
commit order. This may remove the need for closure-backed dynamic `Rectangle`
chains in rendering while retaining `Rectangle` as a temporary layout
calculation/value API where it remains convenient.

App `SampleView` already has an independent, working presentation transition:
`LocationManager` interpolates fitted and scrollable sample locations during
peek, mutates stable location records, updates facet texture and CPU positions,
drives sample-height-dependent state, and requests drawing. Layout 2.0 must
initially preserve and coexist with that mechanism. The first general transition
PR should not route peek through full view layout or apply a second
target/presented interpolation to sample facets.

## Intended coordinate semantics

- **Target geometry** drives subsequent layout, layout-driven width/height
  parameters, scale and axis lengths, lazy-data sizing, and target canvas size.
- **Presented geometry** drives WebGL and WebGPU viewports/scissors, Canvas
  drawing, clipping, picking, hit testing, rulers, loading indicators, and other
  visible interaction bounds.
- Persistent instances that remain in the target layout remain interactive
  using presented geometry while they move.
- Outside a transition the two are equal.
- Headless, export, reduced-motion, and transitions-disabled paths snap
  presented geometry to target deterministically.

All consumers of `view.coords`, `facetCoords`, and `GridChild.coords` must be
classified. Ambiguous access should be replaced by clearly named internal
target/presented accessors rather than relying on timing.

## Provisional approach

Use the existing animation scheduler to interpolate persistent layout instances
matched by Phase 2 identity:

1. Capture their current presented geometry.
2. Run one full layout and commit new targets.
3. On animation frames, interpolate presentation and request drawing only.
4. On interruption, begin again from the current presentation, not the previous
   target or original start.
5. At completion, snap exactly to target and release transient transition state.

Nested presentation must apply movement exactly once. A descendant whose target
changes only because its parent moved must remain visually attached to that
parent without acquiring a second effective interpolation. This is a semantic
requirement rather than a prescribed local- or absolute-coordinate algorithm;
the representation chosen after Phase 3 should determine the simplest method.

Clipping should be derived from presented parent/viewport geometry. Pixel
rounding should occur when a backend applies viewport/scissor state rather than
in canonical targets, avoiding accumulated snapping and jitter. Resize WebGL and
WebGPU backing stores for the target result, not on every interpolated frame;
DOM wrapper animation, if wanted, is a separate concern.

WebGL may draw transition frames through retained callbacks whose geometry
slots change. WebGPU may update or regenerate compact ordered draw descriptors
that reference the same retained handles. Neither path may repeat semantic
occurrence collection, rebuild compatible pipelines/resources, or re-enter view
arrangement merely because presented geometry changed.

## Possible later SampleView migration

Peek should be treated as a working specialized implementation and benchmark,
not discarded during the Core transition refactor. Once the general model is
stable, evaluate a separate App PR that maps sample keys to stable layout-instance
indices and represents fitted, scrollable/target, and presented location/size in
flat numeric storage.

Potential benefits include fewer accessor closures, less pointer chasing, tight
interpolation loops, shared target/presented storage for CPU consumers, and a
more direct facet-texture upload. For texture-faceted marks, storing old and new
locations and interpolating in the shader could avoid rewriting all presented
sample coordinates on the CPU each frame; CPU picking and interaction would
still need an efficient consistent presented view.

Migration must not simply move the same work behind a generic abstraction. It
needs profiles at representative sample counts, including roughly 2,000 samples,
and must account for summaries, group backgrounds, sticky behavior, scrolling,
repeated axes/chrome, filtering, SVG, and non-texture facet rendering. It is not
required for Phase 4 acceptance.

## Verification

- Deterministic clock tests cover start, midpoint, completion, cancellation, and
  reversal of a persistent resize/reposition.
- Transition frames perform no layout, measurement, semantic occurrence
  collection, WebGL batch construction, or compatible WebGPU handle/pipeline
  construction. Cheap WebGPU frame-descriptor materialization is allowed.
- Picking, clipping, and hit testing follow midpoint presentation geometry.
- Axis/scale sizing and a subsequent interrupted layout use target geometry.
- Nested expansion and contraction maintain valid clipping.
- A parent-only move keeps descendants attached and applies the inherited motion
  exactly once at start, midpoint, interruption, and completion.
- SampleView peek continues to interpolate each sample exactly once. Its sample
  facet texture and CPU/SVG position path, sticky summaries, group backgrounds,
  repeated axes, scrollbar, clipping, picking, and pointer-to-sample lookup agree
  at intermediate frames.
- Starting a general layout transition while SampleView peek is active has a
  defined composition or cancellation behavior and never feeds animated sample
  coordinates back into canonical view layout.
- Headless, SVG/export, reduced-motion, and disabled paths produce final target
  geometry immediately.
- For the WebGPU supported subset, midpoint frames preserve retained mark
  handles and paint order while viewport/scissor geometry follows presentation.

## Non-goals

- Entering or exiting layout instances.
- Visibility thresholds or semantic zoom.
- Animating data, mark encodings, scale domains, or arbitrary GPU attributes.
- Public transition syntax unless an internal control is required for testing.

## Risks and open questions

- Which public bounds APIs mean last presented bounds versus canonical targets?
- How should active pointer capture behave when a persistent target moves
  rapidly or becomes very small?
- How are nested clips combined when both parent and child interpolate?
- Should WebGPU occurrence descriptors read shared presented-geometry storage or
  be regenerated each frame? Choose the simpler measured path without exposing
  the choice through the shared layout API.
- What minimal state supports interruption without allocating on every frame?
- Should the first implementation be opt-in and use a fixed internal duration
  and easing?
- Which parts of SampleView peek should eventually use general layout-instance
  storage, and which group/scroll semantics should remain specialized?

## Phase acceptance and review gate

Proceed to semantic visibility only if target/presented semantics are explicit,
transition frames are layout-free, and the added per-instance state is justified
by working persistent-view transitions.

Tentative commit sequence:

1. `refactor(core): distinguish target and presented geometry`
2. `feat(core): animate persistent layout instances`
3. `test(core): verify layout transition interruption`
