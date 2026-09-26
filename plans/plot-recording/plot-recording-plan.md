# Plot recording

Status: Completed and reconciled for draft PR delivery. All required tasks are complete.

## Goal and scope

Add an optional Record control beside PNG, SVG, and Inspector. Clicking Record
starts capturing the visible plot; clicking Stop finishes and downloads a video.
Zoom, pan, selections, animated transitions, and data changes appear as they did
on the plot, with real elapsed time between interactions. Everything stays local
to the browser.

Confirmed PoC scope: plot-only recording across all live renderers: WebGL,
Canvas2D, and WebGPU. SVG is currently an export backend, not a live interactive
surface; existing SVG export must remain compatible with recording.

PoC defaults: silent video, targeting 30 fps. This records
the rendered result of interactions, not an event log. HTML tooltips, menus,
Inspector, loading overlays, external controls, and the system pointer are outside
the canvas and therefore outside the PoC recording. HTML objects are deferred
until the PoC is ready. Their capture approach will be designed as a follow-up;
system-pointer capture remains a separate product decision.

Non-goals: audio, full-screen/tab capture, GIF export, guaranteed MP4 everywhere,
video editing, deterministic replay, offline high-resolution rendering, and
server-side conversion. No new encoding dependency is proposed.

## Branch boundary: minimum usable PoC

Deliver one working vertical slice: Record → interact → Stop → download and play
back a video. This branch ends when that flow works on all three live renderers
with the acceptance checks below. HTML capture begins in a separate follow-up.

The following limits bound this branch. All-renderer support is required; HTML
objects are deferred.

| Dimension   | Included in this branch                                                               | Deferred                                                                 |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Renderers   | WebGL, Canvas2D, WebGPU, without switching the active backend                         | No live renderer may be dropped                                          |
| Browser     | Current desktop Chrome on a WebGPU-capable machine; record exact version and platform | Firefox, Safari, mobile, and a broad compatibility matrix                |
| Content     | Whole visible plot canvas; pan, zoom, selections, animation, and data changes         | HTML, pointer, audio, cropping, individual subviews, interaction replay  |
| Output      | One tested WebM/VP8 encoding, local download, existing canvas pixel dimensions        | MP4, format/quality selectors, custom resolution, transcoding            |
| Controls    | Opt-in Record/Stop, pause/resume, countdown, finishing/error status                   | Preview, editing, recording history                                      |
| Session     | One session per embed; short foreground clips, at most 60 seconds                     | Long sessions, background recording, resize continuity                   |
| Integration | Existing controls example and concise embedding documentation                         | App toolbar, playground, docs-wide rollout, standalone recording package |

Chrome is the validation target, not a claim that other browsers cannot
work. Runtime capability checks should report unsupported recording clearly, but
this branch does not acquire codec fallbacks or browser-specific workarounds to
make unvalidated combinations supported. WebGPU must be tested on real capable
hardware; unavailable hardware leaves required validation outstanding.

## Existing integration points

- `packages/core/src/controls.js` exposes opt-in controls with no default list.
  `ControlContext` provides the public embed API, abort signal, status, and error
  reporting. A control must not reach into private renderer state or query the
  first canvas in the container.
- `packages/core/src/controls/imageButtons.js` implements PNG/SVG downloads.
  PNG/SVG and video share the extracted `controls/downloadBlob.js` helper.
- `packages/core/src/controls/button.js` disables a button while its asynchronous
  click action runs. Starting recording must finish promptly so Stop is usable;
  only startup and finalization should disable the action.
- `packages/core/src/controls/styles.js` hides inside controls when idle. Recording
  needs a visible Stop action and indicator even after pointer/focus leaves.
  A recording attribute and scoped CSS keep Stop visible until completion.
- `packages/core/src/embedApi.js`, `types/embedApi.d.ts`, and `genomeSpyBase.js`
  are the API and ownership boundaries. `RenderingSurface.canvas` is already
  shared by rendering backends in `rendering/renderingBackend.js`.
- Rendering is demand-driven through `utils/animator.js`. Resize can call the
  coordinator directly; a capture hook only in `GenomeSpy.renderAll()` would miss
  that path. The coordinator's visible-paint entry point is wrapped once so
  recordings copy the canvas immediately after each backend submits its paint.
- `packages/embed-examples/src/controls/index.js` is the initial integration
  example; `docs/api/embedding.md` documents controls. Do not assume all existing
  frontends automatically mount these controls.

## Implemented design

The shared recording controller copies the selected live canvas synchronously
following visible paints into an opaque Canvas2D recording surface. White fill
before each copy preserves readable output for transparent plots. The recording
surface uses `captureStream(30)` and MediaRecorder with WebM/VP8. A 30-Hz timer
repaints the retained recording image during idle periods without rerendering the
plot. There is no new renderer, encoder dependency, HTML compositor, or change to
GPU buffer-preservation settings. Normal rendering has only an optional capture
callback; active recording incurs one canvas copy per visible paint, an additional
canvas buffer, idle output repaints, and browser encoding work.

Direct canvas-stream recording and a video-element intermediary both produced
corrupt/black transparent frames in Chrome. Copying immediately after painting
fixed the first-frame issue as well as subsequent frames on all three backends.
This observed failure justifies the small output surface. The capture hook wraps
only visible rendering, including coordinator resize calls; picking is excluded.

The experimental optional API is `startRecording(api)` from
`@genome-spy/core/recording` returning a session with
`finished: Promise<Blob>`, `stop(): Promise<Blob>`, and `cancel(): void`.
`finished` is necessary to observe automatic limits, resize/visibility errors,
and cancellation without polling. `stop()` returns the same promise. The Blob
identifies its MIME type. There are no configurable recording options, event
subscription API, raw-canvas accessor, or generic recorder plugin system.
`recordButton({ filename })` owns download behavior.

One active session per embed; reject concurrent starts. The session owns recorder,
stream tracks, listeners, and chunks. Stopping waits for final `dataavailable` and
`stop` before producing the Blob. Disable repeated stop clicks while finishing.
Cancel, control disposal, and embed finalization release resources without a late
download. Handle expected recorder errors and ended tracks through the existing
error path; do not build retry or recovery machinery. Keep recording out of
rendering hot paths and keep minimal bundles independent of unused backends.

Use runtime checks for canvas capture, MediaRecorder, and the one selected MIME
type. WebM/VP8 passed the renderer matrix. There is no codec-selection subsystem. A failed start
must leave the plot usable and allow another attempt.

UI states: idle → starting → recording → finishing → idle. Use Record and Stop
labels, a visible recording indicator, keyboard activation, and existing status
and error presentation. The Stop control remains visible when the pointer leaves.
The Stop button shows remaining seconds (60, 59, …), as requested after the
initial PoC. Normal recording/finishing/download messages do not cover the plot;
errors remain visible. Starting returns promptly so Stop is usable.
Stopping downloads one file; revoke download URLs using the existing helper's
pattern. The PoC does not retain a preview or a library of completed recordings.

Keep canvas pixel dimensions fixed during a session. If they change, cancel with
an explanatory message; do not attempt to preserve a resized clip. Likewise,
cancel when the document becomes hidden. Finalization/disposal cancels silently.
These are explicit unsupported-session boundaries, not seamless recovery paths.
At 60 seconds of active recording, stop normally and download. Collect chunks periodically and impose
a simple accumulated-byte ceiling of 64 MiB, stopping normally at the ceiling.
This is a best-effort resource bound, not an exact peak-memory guarantee: chunks
and encoder buffers can exceed it. Document these limits; do not build streaming
to disk or a storage abstraction. No settings UI is needed.

## Alternatives and prior art

- The [WebRTC canvas recording sample](https://webrtc.github.io/samples/src/content/capture/canvas-record/)
  records an interactive WebGL teapot using canvas capture and MediaRecorder.
  It demonstrates the proposed pipeline; its older codec handling is not a modern
  compatibility matrix. Study the pattern, do not copy its implementation.
- [p5.js saveGif](https://p5js.org/reference/p5/saveGif/) offers duration-based
  sketch capture. It is useful prior art for a simple local export flow, but GIF
  and preset-duration recording do not match this start/stop video requirement.
- Tab capture through
  [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
  includes page UI and potentially the pointer, but requires a user source picker
  and permission each time. The application cannot silently select its own tab.
  Revisit this tradeoff when designing HTML-object capture after the PoC.
- Interaction replay requires event/state coverage, initial data, timing, and
  reproducibility across asynchronous loading; it is a separate, larger project.
- WebCodecs plus a muxer offers more encoding control but adds browser and
  packaging complexity without an established requirement here.

References: [canvas capture](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream),
[MIME probing](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static),
and [recorder stop ordering](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop).
No external code is copied or closely adapted by this proposal. If implementation
does so, verify license compatibility and preserve attribution before reuse.

## Milestones

- [x] **1. Prove the shared capture path.** Use a temporary harness on desktop
      Chrome and real WebGL, Canvas2D, and WebGPU surfaces. Record the same supported
      interactive spec on each, including a five-second idle interval and a final
      changed frame. Play back all three files and verify elapsed duration, visible
      updates, background, first/final content, and successful decoding. Check a
      high-DPI canvas and note visible interaction slowdown. Outcome: evidence for
      all three renderers and the smallest required surface integration, with exact
      browser/platform and format recorded here. If direct capture fails, revise the
      design rather than dropping a renderer. No permanent harness, public API, or
      user docs are required at this stage. Include the findings with milestone 2's
      commit; no separate spike commit is required.
- [x] **2. Deliver the usable PoC.** Add the small recording controller, minimal
      embed API/types, Record/Stop control, cleanup, and local download. Integrate only
      `packages/embed-examples/src/controls/index.js`. Update `docs/api/embedding.md`
      with opt-in usage, experimental status, scope, tested environment, and limits,
      using the documentation skill. Consumers are the example and opt-in embedding
      applications; existing controls remain unchanged by default. Verify lifecycle
      behavior with focused unit tests and the real-browser checks below. Tentative
      commit: `feat(core): add experimental plot recording across live renderers`.

Review gates: confirm capture evidence and the small public contract after the
spike; review the integrated PoC before delivery. No independent agent review is
requested. Do not expand the branch to prepare for hypothetical future capture
sources or production settings.

## Definition of done

- [x] In the controls example, select each live renderer and record a 10–20 second
      session containing pan/zoom, a supported selection or visual update, a
      five-second pause, and another interaction. Each downloaded file plays in the
      target browser, preserves the pause, and shows initial and final plot content.
      Use a shared supported spec so missing mark support is not confused with a
      recording defect. Record actual results for all three backends.
- [x] Smoke-test `examples/docs/index/interactive-overview.json` and lazy loading in
      `examples/docs/examples/genomic-data/genome-browser.json` on a renderer that
      supports those examples. No additional data-source coverage is required.
- [x] Stop creates exactly one nonempty WebM file with the correct MIME type.
      Immediate stop produces a playable clip or a clear no-frames error, never a
      silently broken download. Recording status and Stop remain visible and usable
      with pointer and keyboard.
- [x] Repeated sessions work. Concurrent starts are rejected. Test final chunk
      inclusion, start failure, recorder error, cancellation, and disposal while
      recording/finishing. Tracks, listeners, timers, and URLs are released; disposal
      causes no late download. Use unit tests for these contracts, browser tests for
      actual capture/encoding.
- [x] Resizing/full-window changes that alter canvas dimensions and hiding the
      tab cancel with the documented message. Time/byte limits stop and export.
- [x] PNG/SVG export and Inspector remain usable. Videos contain visible plot
      output, not picking buffers or HTML controls. Confirm readable text and a usable
      background on a transparent/high-DPI example; video alpha preservation is not
      promised. No renderer switch or permanent WebGL context-setting change occurs.
- [x] Run focused Vitest tests with the agent reporter, Core TypeScript checks,
      lint, relevant minimal-bundle checks, and documentation verification. Use the
      browser-debug skill for browser work. Avoid a new benchmark suite or an FPS SLA.

## Deferred work and unresolved risks

HTML capture is the next separately scoped feature after this PoC; do not implement
its compositing architecture in this branch. Broad browser support, MP4, configurable
quality/resolution, pointer/audio capture, longer clips, resize
continuity, background capture, and wider frontend adoption are explicitly deferred.
They are not unfinished tasks required to deliver this branch.

## Verification record (2026-09-26)

Environment: macOS 26.6.2 arm64, installed Chrome 153.0.8010.53 driven by
Playwright in headless mode, ANGLE Metal. WebGPU reported vendor `apple`,
architecture `metal-3`, and `isFallbackAdapter: false`. No software renderer was
substituted. Firefox, Safari, mobile, and other hardware were not validated.

The controls example recorded approximately ten-second sessions at DPR 2
(1800 × 720 pixels), including zoom, a 5.5-second idle interval, and a brush
selection. Playback ran to completion; extracted initial/middle/final frames were
inspected for readable backgrounds and changed plot/selection state.

| Renderer | Decoded duration | Encoded bytes | Result |
| -------- | ---------------- | ------------- | ------ |
| WebGL    | 9.935 s          | 759,493       | Passed |
| Canvas2D | 9.904 s          | 685,393       | Passed |
| WebGPU   | 9.870 s          | 787,134       | Passed |

Stop remained visible at full opacity after pointer exit. A separate keyboard
start/immediate-stop test produced a decodable 900 × 360 clip (6,753 bytes).
Repeated sessions and resize cancellation passed for each renderer. Full-window
resize cancellation, Inspector opening during recording, and resetting the embed
without a late download passed in browser tests. Tab-hidden cancellation,
encoder errors, final chunk ordering, timer/byte limits, and resource cleanup
are covered by focused unit tests rather than a full-duration browser stress test.

The interactive overview and genome-browser examples passed recording and
PNG/SVG export during recording after visible lazy data loaded. Zoom was exercised
while recording. Concurrent starts were rejected; finalization rejected the
active session with AbortError and subsequent starts with a finalized-embed error.
The overview produced a 931,209-byte clip and genome-browser a 602,586-byte clip.
Interactions completed during capture, but no quantitative performance claim or
long-session stress test was made. Extra canvas-copy/encoding cost remains a PoC
limitation on large plots.

Checks passed: 50 focused tests across recording, recording controls, existing
controls, and embed lifecycle; all workspace TypeScript checks; repository lint;
minimal-bundle isolation checks; embedding examples production build; generated
API documentation. The final startup-boundary/download-error corrections were
rechecked with 17 recording-specific tests and Core TypeScript/lint checks.
Temporary browser harnesses and recordings live under `/tmp`, outside the branch.

This branch was created from the current local `feat/displace2d` checkout, which
was six commits behind its tracked remote and contained unrelated uncommitted
view-data API/docs work. Those changes were preserved. Resolve the intended base
and separate unrelated work before feature delivery; no reset, pull, or commit of
that work is part of this planning task.

Plan retirement: reconcile completed/discarded tasks and commit that record, then
delete this temporary plan in a later commit before opening a PR.

## Pause/resume follow-up

The user expanded the PoC scope to include pause/resume and a red Record icon.
The session exposes pause()/resume(), paused, and remainingMs. The same active
clock drives the time limit and button countdown. While paused, capture copies
and idle repaints stop; resizing, tab hiding, and disposal still cancel. Stopping
while paused finalizes without copying paused view edits. Native MediaRecorder
pause/resume excludes the paused interval from the encoded timeline.
The controls show a red circle with a Record tooltip, Stop/countdown during a
session, and a Pause/Resume action alongside it. No recording card is displayed.

Validation: 46 focused tests passed (recording lifecycle, recording controls,
existing controls), along with Core TypeScript and focused lint. Chrome playback
on WebGL, Canvas2D, and hardware WebGPU excluded a three-second pause from two
two-second active segments: durations were 4.063, 4.032, and 4.030 seconds.
The countdown remained at 58 during the pause, and stopping while paused produced
a playable download on every renderer. API documentation was regenerated.

## Optional module boundary

Recording is now imported explicitly from `@genome-spy/core/recording`, which
exports recordButton() and startRecording(api). It is not exported by the general
controls module and is not attached to EmbedResult. This replaces the earlier
experimental api.recording.start() entry point; the demo and docs use the new import.

The optional module owns sessions, concurrency checks, encoding, timer limits,
pause/resume, controls, and recording-specific CSS. Core retains a small internal
live-surface/disposal bridge with no import of recording, static or dynamic.
Session cancellation unregisters its paint callback and disposal callback.

Bundle verification inspects every emitted chunk and its source map for default
Core, minimal Core, general controls, PNG/SVG controls, and minimal Canvas embeds.
All exclude recording source and MediaRecorder code. A positive recording fixture
must include the encoder. This guards against replacing the static dependency
with an unconditional dynamic import. Omitting an import excludes functionality;
hiding an already imported control conditionally at runtime is not code exclusion.

Optional-module validation passed: 57 focused tests, all workspace TypeScript
checks, repository lint, minimal-bundle verification (including the positive and
negative recording fixtures), examples production build, and API-doc generation.
Chrome verified pause/resume and playable downloads on all three live renderers;
a non-recording scale API example requested zero recording modules. A direct
optional API test verified concurrent-start rejection, cancel/restart, cancellation
on embed finalization, and rejection of starts after finalization. EmbedResult
no longer contains a recording namespace. No renderer or recording implementation
is imported by the small shared internal bridge.

## Direct webpage distribution

The standard Core build now emits controls.es.js / controls.js and
recording.es.js / recording.js beside the existing index.es.js / index.js files.
The add-ons are independently built ESM and UMD entries. Core does not reference
or fetch them; ESM pages can dynamically import them when enabled, and UMD pages
include explicit scripts exposing genomeSpyControls and genomeSpyRecording.
Package browser/controls and browser/recording exports mirror browser's format
selection. The existing Core UMD and ESM entry paths remain unchanged.

The module-local WeakMap bridge has been replaced by a non-enumerable, versioned
Symbol.for capability on each EmbedResult. The capability only returns that
embed's live capture target and disposal subscription. This lets separately built
add-ons reach the original embed without copying Core or maintaining a global
registry of instances. The v1 key describes the internal capture contract; pages
should use files from one release. An incompatible embed receives a clear error.
Recording sessions still live entirely in the optional module.

Review/verification: isolated-module unit tests prove that separately evaluated
copies share the capability and reject incompatible embeds. The production build
and typings pass. The permanent verify:bundle:recording script serves only built
files, verifies Core does not request add-ons before opt-in, and then loads the
add-ons after embed creation. ESM and UMD each pass on WebGL and Canvas2D, including
pause/resume, playable downloads with paused time omitted, and cancellation on
finalization. Durations for roughly 1.2 seconds of active capture were 1.358,
1.362, 1.324, and 1.363 seconds. WebGPU is not added to published bundles.
The source-bundling exclusion fixtures remain required and passing.

Reproduce with `npm -w @genome-spy/core run build`, then
`CHROME_CHANNEL=chrome npm -w @genome-spy/core run verify:bundle:recording`.
Omit CHROME_CHANNEL to use Playwright's bundled Chromium. Documentation includes
ESM dynamic-import and UMD script-tag examples and matching-version deployment.


## Final review and delivery

- [x] Freeze the last captured frame when Stop is requested; later paints are excluded.
- [x] Remove the redundant session registry so cancel permits immediate restart.
- [x] Simplify button presentation and private recorder event wiring.
- [x] Re-export recordButton from the source controls entrypoint. Keep prebuilt
      browser controls independent through a dedicated build entrypoint.
- [x] Verify source tree shaking and separate browser addon loading.
- [x] Verify active color changes and exclusion of paused changes in decoded video
      frames on WebGL and Canvas2D, for both ESM and UMD addons.
- [x] Update the controls example and embedding documentation for unified imports.

Latest checks: 50 focused tests, Core TypeScript, targeted lint and formatting,
source bundle exclusion, addon builds, and four browser artifact checks passed.
Earlier WebGPU hardware checks remain recorded above. Shared rendering refactoring
was explicitly excluded by the user; the existing feature capture hook is retained.
No required tasks remain. HTML capture and broader browser support remain deferred.
