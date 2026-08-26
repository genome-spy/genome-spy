# WebGPU renderer diagnostics and lifecycle hardening plan

Status: In progress

## Context

The low-level WebGPU renderer already follows the most important buffer-upload
and binding practices from the reviewed WebGPU guidance:

- retained CPU data is uploaded with `GPUQueue.writeBuffer()`;
- draw globals and mark uniforms are coalesced into one write per owning
  buffer update;
- series are packed by scalar type into a small number of storage buffers;
- render pipelines use explicit bind-group and pipeline layouts; and
- renderer creation requests a fresh adapter immediately before requesting a
  device.

Three actionable gaps remain:

1. GPU resources have few useful labels, so dynamically generated shaders,
   pipelines, buffers, and bindings are difficult to connect to the Core view
   that owns them.
2. The renderer owns the `GPUDevice` but does not observe `device.lost` or
   notify its host when the device becomes unusable.
3. Series replacement always recreates the mark bind group even when every
   bound resource identity was preserved. Text marks also bind separately
   managed glyph and string-metric buffers, so they must participate in the
   same identity decision.

Core already has the right diagnostic identity. `View.getPathString()` returns
the complete effective view path using explicit specification names when
available and generated names otherwise. The WebGL shader path already embeds
that string in a debug header. The WebGPU integration should reuse the same
identity and append the Core mark type rather than introduce another naming
system.

Device loss is expected to be rare. This plan therefore provides explicit
notification and a safe terminal renderer state, but does not attempt live
device or resource recovery.

## Goals

- Make renderer-created GPU objects identifiable by role and, for mark-owned
  resources, by the originating Core view path and mark type.
- Add a minimal `onDeviceLoss` renderer hook and surface device loss through
  Core's existing runtime error presentation.
- Preserve bind-group identity when retained updates only change buffer
  contents.
- Keep the renderer generic: it receives diagnostic strings but never imports
  Core types or interprets the Core view hierarchy.

## Non-goals

- Reacquiring an adapter/device or rebuilding marks automatically after device
  loss.
- Falling back from WebGPU to WebGL or Canvas2D after initialization.
- Adding a staging-buffer ring, mapped-at-creation upload path, shared upload
  arena, or geometric buffer-capacity growth without profiling evidence.
- Adding indirect draws, GPU-generated draw counts, or compute-driven culling.
- Reordering paint-order-sensitive Core draws or changing the current explicit
  bind-group layout hierarchy.
- Adding a production `uncapturederror` listener, telemetry transport, or broad
  error scopes that would replace normal browser console reporting.
- Converting synchronous mark/pipeline creation to
  `createRenderPipelineAsync()`.
- Adding per-draw debug groups. They can be reconsidered if native captures
  remain ambiguous after object and pass labels are in place.
- Keeping GPU labels synchronized with later view renames. A label is a stable
  snapshot of resource ownership at creation time.

## Key decisions

### Host-provided labels with renderer-owned role suffixes

Add a generic optional label boundary instead of placing Core concepts in mark
configuration. The concrete public and definition-factory signatures are:

```ts
createMark(definition, config, options?: { label?: string }): MarkHandle;
createProgram(renderer, config, context: { label: string }): MarkProgram;
```

- `MarkCreationOptions.label` identifies the host-owned mark. No renderer-level
  label option is needed: renderer-owned resources use the fixed
  `webgpu-renderer` prefix.
- The renderer assigns the mark ID before program construction and derives a
  stable `<definition.type> #<markId>` fallback when the host omits a label.
- `MarkDefinition.createProgram` receives a small creation context containing
  the resolved label, allowing built-in and custom programs to label resources
  at the moment they are created. This is preferable to mutating labels after
  construction because pipeline or binding validation can fail during
  construction.
- Built-in programs and resource managers append stable role suffixes such as
  `shader`, `render pipeline`, `picking pipeline`, `uniforms`, `series f32`,
  `selection <name>`, and `bind group`.
- Renderer-global, placement, picking, font, texture, command-encoder, and pass
  resources receive role-based labels even when they have no Core owner.

Every object label uses one exact format, `<owner>: <role>`. For example,
`root/concat/points [point]: render pipeline` identifies a Core-owned mark,
while `webgpu-renderer: main render pass` identifies a renderer-owned object.

Core constructs a mark label from the existing view identity, using a format
equivalent to:

```text
<unitView.getPathString()> [<mark.getType()>]
```

The Core mark type is intentional: for example, a Core `tick` mark may use the
renderer's rule definition but should still appear as `tick` in diagnostics.
String formatting is centralized in one Core WebGPU helper and one renderer
role-label helper. Stable labels are precomputed with their resources; the
frame hot path must not assemble view-path strings.

Placement sources can be shared by multiple marks, so their buffers use a
renderer-owned placement-set ID rather than claiming one Core mark as their
sole owner.

### Minimal device-loss behavior

Add `onDeviceLoss?: (info: GPUDeviceLostInfo) => void` to `RendererOptions`.
The renderer attaches a handler to `device.lost` immediately after obtaining
the device and follows these rules:

- Normal `renderer.destroy()` sets the renderer's destroyed state before
  destroying the device and does not invoke `onDeviceLoss`.
- A loss observed while the renderer is otherwise alive transitions it once to
  a terminal lost state, rejects all queued or active picks with the same
  device-loss `RendererError`, and invokes `onDeviceLoss` once with the
  original `GPUDeviceLostInfo`.
- The picking queue retains an explicit active-request record, including its
  reject function. Both the deferred start and the completion callbacks check
  request identity and renderer state, so loss before `_pickSingle()` starts or
  during `mapAsync()` settles the public promise exactly once.
- Intentional `destroy()` preserves the existing null-result semantics for
  pending picks, but extends them to the active request as well.
- Public rendering and retained-update entry points fail fast after loss with a
  device-loss-specific `RendererError` message rather than continuing to
  submit work to an invalid device.
- No adapter is cached and no recovery loop is started.

Core maps the low-level hook to a runtime error and presents it through the
same `EmbedOptions.onError` and message-box path used for launch failures. This
requires a small reusable runtime-error reporter in `GenomeSpyBase`, but adds
no WebGPU-specific public option to Core. A generic internal
`RenderingBackendOptions.onError` callback carries the error from
`WebGpuSurface`; the surface ignores notifications after finalization.

If loss occurs while `launch()` is pending, `GenomeSpyBase` records that
terminal error, reports it once, and makes `launch()` return `false`. A later
launch-path exception does not report the same loss again. `destroy()` marks
the instance terminal before finalizing the surface, so a late device promise
cannot recreate error UI in an emptied container.

### Bind groups follow resource identity

Every retained update that can replace a bound resource reports whether its
identity changed. `SeriesBufferManager.updateSeries()` covers packed scalar
buffers, while `TextProgram` also combines identity changes from `glyphs` and
`stringMetrics`. `BaseProgram` rebuilds its bind group only when the combined
result is true. A same-shape or smaller replacement continues to upload with
`writeBuffer()` while preserving the existing bind group. An update that grows
one or more bound buffers rebuilds the group exactly once after all uploads.

This plan does not change packed-buffer capacity policy. The existing exact
allocation strategy can be revisited only if the interaction benchmark shows
repeated growth allocation or rebinding as a material cost.

## Alternatives considered

### Put a label in `MarkConfig`

Rejected because diagnostics are resource-creation metadata, not shader or
mark semantics. Mixing the label into mark configuration would also complicate
configuration identity and custom definition validation.

### Infer Core ownership inside the renderer

Rejected because the standalone renderer must not import Core types or know
about view paths. A generic creation option keeps ownership explicit.

### Label resources after program creation

Rejected because shader, pipeline, or bind-group validation may fail before
post-construction mutation can improve the diagnostic message.

### Recover automatically from device loss

Rejected for this phase. All device-owned resources must be recreated, while
Core—not the renderer—owns the canonical view, dataflow, and application state.
The rarity of device loss does not justify that lifecycle complexity yet.

### Ignore device loss because it is rare

Rejected because attaching one promise handler is inexpensive and prevents a
silent frozen or blank canvas from being the only observable failure signal.

### Add render-state caching now

Deferred. Group 0 uses a per-draw dynamic offset and must be set for every
occurrence. Consecutive occurrences may redundantly set a mark pipeline and
group 1, but the current profiler should first demonstrate that those calls are
common and material before the public/custom-program draw contract is changed.

## Milestone 1: Label GPU resources from Core ownership

### Intended outcome

Browser errors and native WebGPU captures identify the Core view/mark that owns
each mark program and identify the role of renderer-owned resources.

### Work

- [x] Add and type `MarkCreationOptions` and the required mark-program creation
      context using the concrete signatures above.
- [x] Resolve the mark ID and label before calling the definition factory, and
      update built-in definitions, custom-definition fixtures, and mocks to
      accept the context.
- [x] Thread the resolved label through `BaseProgram`, pipeline construction,
      series, scale, selection, text/font, and extra-resource managers.
- [x] Label renderer-global layouts/buffers/bind groups, placement resources,
      picking resources, shader modules, pipelines, textures/views, samplers,
      command encoders, and render/picking passes with stable role names. Cover
      descriptor creation in `pipelineBuilder.js`, `bindGroupBuilder.js`,
      `webgpuTextureUtils.js`, and the renderer's main and picking encoders.
- [x] Add a Core WebGPU label helper based on `unitView.getPathString()` and
      `mark.getType()`, and pass its result when the retained mark is first
      created.
- [x] Keep labels fixed for the lifetime of a retained resource; recreated
      resources inherit the same ownership prefix.

### Affected areas and consumers

- `packages/webgpu-renderer/src/renderer.js` and public declarations
- built-in mark definitions and `src/marks/programs/**`
- text/font and placement resource creation
- renderer tests, GPU test helpers, examples, and tree-shaking fixtures
- `packages/core/src/rendering/webgpu/webGpuSurface.js`
- Core WebGPU surface tests

Custom `MarkDefinition` implementations are the only downstream API requiring
a signature update. The package is unpublished and explicitly permits this
breaking cleanup.

### Verification

- Unit tests assert the exact `<owner>: <role>` descriptor labels for
  representative global, pipeline, packed-series, scale, selection, text,
  placement, texture-view, command-encoder, and picking resources.
- Core surface tests assert that explicit and generated view paths plus the
  Core mark type reach `createMark()` unchanged.
- A same mark used in several occurrences retains one ownership label.
- Labels are assembled during resource creation, not in `_encodeDraws()`.
- Type checks and tree-shaking fixtures cover custom definitions.

### Documentation and migration

- Document renderer and mark labels in the renderer README and public API table.
- Note in the Core WebGPU integration README that diagnostic identity comes from
  the owning unit-view path.
- No specification or schema documentation changes are needed.

Tentative commit: `feat(webgpu-renderer): label GPU resources from Core views`

## Milestone 2: Surface device loss without automatic recovery

### Intended outcome

Unexpected WebGPU device loss is observable once, pending work settles, and the
renderer cannot silently continue using invalid resources.

### Work

- [ ] Add and document `RendererOptions.onDeviceLoss`.
- [ ] Attach the `device.lost` handler before configuring or allocating
      renderer-owned resources.
- [ ] Track distinct alive, lost, and intentionally destroyed states while
      preserving idempotent `destroy()`.
- [ ] Replace the promise-only pick bookkeeping with an explicit active request
      record; reject queued and active requests exactly once on loss, guard the
      deferred start, and settle both queued and active requests with `null` on
      intentional destruction.
- [ ] Route the Core surface's hook through a generic post-launch runtime-error
      reporter that reuses `EmbedOptions.onError` and the default message box.
      Thread it as internal `RenderingBackendOptions.onError`, guard finalized
      surfaces and destroyed GenomeSpy instances, and make loss during launch
      fail launch without duplicate reporting.
- [ ] Keep adapter/device reacquisition and mark reconstruction out of the
      implementation.

### Affected areas and consumers

- renderer initialization, lifecycle assertions, picking queue, and public
  declarations
- renderer unit/GPU tests and examples
- Core rendering-backend options, WebGPU surface initialization, and
  `GenomeSpyBase` error presentation

Other rendering backends are behaviorally unchanged. The generic runtime-error
reporting path must not add WebGPU imports to WebGL or Canvas2D modules.

### Verification

- A controllable mock `device.lost` promise verifies one hook invocation and
  preserves the original `GPUDeviceLostInfo`.
- `renderer.destroy()` does not invoke the hook even though it destroys the
  device.
- Loss before, during, and after picking settles every returned promise and
  leaves no queued or active request. Include the microtask race where loss
  occurs after queuing but before deferred `_pickSingle()` begins.
- Destroying during an active pick resolves that request and queued requests to
  `null`, and a later `mapAsync()` rejection cannot settle them again.
- Render, mark update, placement update, and new pick calls fail predictably
  after loss.
- Core tests verify delivery through a custom `onError` handler and through the
  default message path without attempting recovery. Separate tests cover loss
  during launch, loss after launch, finalization before the device promise
  settles, and exact-once reporting.

### Documentation and migration

- Document the hook, its non-recovery semantics, and intentional-destruction
  behavior in the renderer lifecycle section.
- Document Core's terminal behavior after a loss in the Core WebGPU integration
  README.

Tentative commit: `feat(webgpu-renderer): report WebGPU device loss`

## Milestone 3: Preserve bind groups across compatible series updates

### Intended outcome

Retained series updates change only buffer contents when existing packed
buffers remain large enough; GPU bindings change only when resource identity
changes.

### Work

- [ ] Make packed-buffer update helpers report allocation/identity changes
      across all active scalar buffer types.
- [ ] Make text extra-buffer updates report replacement of `glyphs` and
      `stringMetrics`, and combine those results with packed-series changes
      before deciding whether to rebuild.
- [ ] Rebuild the mark bind group only when at least one bound resource was
      replaced.
- [ ] Preserve current upload batching, buffer-size policy, count inference,
      alias validation, text-series preprocessing, picking invalidation, and
      public handle identity.
- [ ] Extend profiler/test assertions so compatible replacement proves zero
      bind-group creation and growth proves one creation.

### Affected areas and consumers

- `SeriesBufferManager`, `BaseProgram`, and `TextProgram`
- text layout and extra-buffer replacement
- retained-update tests and Core interaction counters

No public API or documentation migration is required.

### Verification

- Same-size, smaller, empty, and repeated replacements reuse the bind group
  when buffer identities are unchanged.
- Growth of one or several scalar buffers rebuilds once after all uploads.
- Text replacement that grows `glyphs` or `stringMetrics` rebuilds once even
  when all packed scalar buffers retain identity; compatible text replacement
  performs no rebuild.
- Normal and picking draws observe the new series contents.
- Core retained-resource synchronization still reports the same logical write
  count and does not recreate a mark handle.

Tentative commit: `perf(webgpu-renderer): preserve bind groups across series updates`

## Review gates

1. Review the label API and Core-to-renderer ownership boundary after milestone
   1. Inspect built-in and custom mark definitions, tree-shaking fixtures, and
      the Core adapter rather than only renderer internals.
2. Review the lifecycle contract after milestone 2. Pay particular attention
   to intentional destruction, callback reentrancy, pending picks, default Core
   error UI, and the absence of an accidental recovery loop.
3. Review milestones 1-3 together before final delivery, including retained
   interaction behavior and GPU resource diagnostics.

## Risks

- Core view paths can be long. Preserving the complete path is more useful than
  truncating it, but role suffixes should remain concise.
- Adding labels everywhere can accidentally introduce per-frame string
  allocation. Constant pass labels and resource-lifetime label construction
  avoid that cost.
- Custom mark factories must receive the creation context before allocating
  resources. Missing one forwarding path would leave a subset of resources
  generic or unlabeled.
- Device loss may race asynchronous font preparation or picking. Every callback
  must check terminal state before allocating resources or invalidating the
  host.
- The device-loss callback itself may trigger host teardown. State must be
  terminal before invoking host code so reentrant `destroy()` stays safe.
- Bind-group reuse is correct only when every bound resource identity is
  included in the change result. In particular, text glyph and string-metric
  buffers are outside `SeriesBufferManager`. Content changes alone must not be
  mistaken for identity changes.

## Acceptance criteria

- [ ] A GPU validation message or native capture for a Core mark includes its
      complete unit-view path, Core mark type, and resource role.
- [ ] Standalone renderer users get deterministic fallback labels without Core.
- [ ] No view-path or role-label strings are assembled per draw occurrence.
- [ ] Unexpected device loss calls `onDeviceLoss` once and reaches Core's
      existing error presentation; normal destruction does not call it.
- [ ] Device loss leaves no unresolved pick promise and all later public work
      fails clearly without recovery attempts.
- [ ] Device loss during launch is reported once and makes launch fail; a loss
      notification after Core teardown has no visible effect.
- [ ] Compatible series replacement performs uploads without creating a bind
      group; growth of packed or text-extra buffers creates exactly one
      replacement group.
- [ ] Explicit layouts, direct draws, and current `writeBuffer()` upload paths
      remain intact.
- [ ] Renderer unit, GPU, type, lint, bundle/tree-shaking, and relevant Core
      WebGPU suites pass.
- [ ] Renderer and Core WebGPU READMEs describe the intended diagnostics and
      lifecycle.

## Final integration verification

Run the package checks from the renderer notes, followed by the focused Core
WebGPU suite and workspace type checking. Exercise these representative paths
in a WebGPU-capable browser:

- `examples/core/first.json` for ordinary retained marks and picking;
- `examples/core/layout/grid/concat_points_text.json` for nested explicit and
  generated view paths;
- `examples/core/selection/interval_points.json` for retained selection
  resources and updates;
- `examples/core/marks/text/ranged_text.json` for text/font resources and
  asynchronous invalidation; and
- the renderer placement and text Storybook scenes for standalone fallback
  labels.

Inspect browser WebGPU diagnostics or a native capture to confirm that view
paths and role suffixes remain readable. Run the Core interaction benchmark and
confirm that label work adds no render-time allocations and compatible series
replacement does not increase retained resource or bind-group creation counts.

When implementation is complete, reconcile every checkbox, update
`packages/webgpu-renderer/MIGRATION_PLAN.md` with any durable follow-up, commit
the reconciled plan, and delete this temporary plan in a later commit before
opening or merging a pull request.

## Design references and provenance

- Brandon Jones, WebGPU best practices for
  [buffer uploads](https://toji.dev/webgpu-best-practices/buffer-uploads),
  [bind groups](https://toji.dev/webgpu-best-practices/bind-groups),
  [error handling](https://toji.dev/webgpu-best-practices/error-handling), and
  [device loss](https://toji.dev/webgpu-best-practices/device-loss).
- The current [WebGPU Errors and Debugging specification](https://www.w3.org/TR/webgpu/#errors-and-debugging)
  defines device loss, error scopes, object labels, and shader compilation
  information. The specification remains normative; performance guidance must
  still be verified on target browsers and hardware.
- Three.js's
  [WebGPU backend](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgpu/WebGPUBackend.js)
  is a comparable established design: it observes `device.lost`, forwards a
  renderer-level loss callback, transitions the renderer to a lost state, and
  labels shader modules, buffers, command encoders, and attachments using
  higher-level program/resource names. Three.js is MIT-licensed. This plan uses
  the architectural pattern only; no implementation code is copied or closely
  adapted.
