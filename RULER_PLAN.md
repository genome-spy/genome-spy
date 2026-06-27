# Ruler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ruler parameters that track an interaction-derived domain coordinate and render synchronized guide rules across compatible views.

**Architecture:** A ruler is a parameter-owned cursor coordinate, not a selection. The declaring view owns the parameter value, while a ruler binding layer maps that value to compatible non-chrome descendant views and creates the overlay views needed to render it. Synchronization and rendering extent are separate: one value can be projected into many independent scales, and the guide can be drawn per view or as a container-spanning rule when projections align.

**Tech Stack:** GenomeSpy Core view hierarchy, JSDoc-typed JavaScript, TypeScript spec declarations, param runtime, GridView/GridChild chrome overlays, Vitest layout/interaction tests.

---

## Proposed User-Facing Grammar

Rulers are declared on normal parameters using a new `ruler` property:

```json
{
  "params": [
    {
      "name": "cursor",
      "persist": false,
      "ruler": {
        "encodings": ["x"],
        "on": "mousemove",
        "extent": "auto"
      }
    }
  ]
}
```

Two-channel crosshair:

```json
{
  "params": [
    {
      "name": "crosshair",
      "persist": false,
      "ruler": {
        "encodings": ["x", "y"],
        "on": "mousemove",
        "extent": "view",
        "mark": {
          "stroke": "black",
          "strokeWidth": 1,
          "strokeDash": [4, 2]
        }
      }
    }
  ]
}
```

Press-and-drag ruler:

```json
{
  "params": [
    {
      "name": "position",
      "persist": false,
      "ruler": {
        "encodings": ["x"],
        "on": {
          "type": "mousedown",
          "filter": "event.shiftKey"
        },
        "clear": "mouseleave",
        "extent": "auto"
      }
    }
  ]
}
```

Viewport-centered ruler:

```json
{
  "params": [
    {
      "name": "center",
      "persist": false,
      "ruler": {
        "encodings": ["x"],
        "source": "viewport",
        "extent": "auto",
        "snap": "auto",
        "display": "band"
      }
    }
  ]
}
```

Child interaction that pushes coordinates to an outer parameter:

```json
{
  "hconcat": [
    {
      "params": [
        {
          "name": "cursor",
          "push": "outer",
          "ruler": {
            "encodings": ["x"],
            "on": "mousemove",
            "extent": "view"
          }
        }
      ],
      "mark": "point"
    },
    {
      "transform": [
        {
          "filter": "cursor.type === 'ruler' && cursor.values.x != null && datum.start <= cursor.values.x && cursor.values.x <= datum.end"
        }
      ],
      "mark": "rect"
    }
  ],
  "params": [
    {
      "name": "cursor",
      "persist": false
    }
  ]
}
```

## Behavior

### Parameter Ownership

- The ruler value is owned by the view where the parameter is declared.
- The value contains one domain coordinate per encoded channel.
- The value is usually transient, so examples should use `persist: false`.
- Ruler params are not selection params. They do not imply selected data membership, although expressions or future filters may use the value to test overlaps.
- Ruler params support `push: "outer"` using the same scoping semantics as other writable params.

Inactive value shape:

```js
{
    type: "ruler",
    values: {
        x: null
    }
}
```

Active value shape:

```js
{
    type: "ruler",
    values: {
        x: 1234567
    }
}
```

For locus scales, the public value may be complex:

```js
{
    type: "ruler",
    values: {
        x: { "chrom": "chr3", "pos": 42100000 }
    }
}
```

The tagged shape makes ruler parameters self-describing, like selection
parameters. Do not store derived interval bounds in the parameter value. Display
bounds such as `x2`/`y2` should be generated with expressions from the channel
value. For numeric values this can be `cursor.values.x + 1`; for complex locus
values, use a scale-aware helper such as `linearize("x", cursor.values.x) + 1`.

Ruler parameter initialization must be explicit:

- A ruler parameter without `value` initializes to an inactive tagged value for
  its configured channels.
- A ruler parameter with `value` accepts a channel-to-coordinate mapping and
  normalizes it into the tagged ruler value shape.
- The runtime should never expose `null` as the value of a registered ruler
  parameter. Inactivity is represented by `null` channel values inside the
  tagged object.
- A pushed ruler parameter seeds the outer variable parameter with its inactive
  tagged value during registration, mirroring pushed selection parameters.

### Push to Outer Parameters

`push: "outer"` enables an interaction declared in one child view to update an
outer parameter that is visible to sibling views and dataflow expressions.

The intended pattern is:

- Declare a plain outer parameter with the target name.
- Declare a same-name child ruler parameter with `push: "outer"`.
- Create the ruler binding from the child declaration, because the child owns
  the interaction surface.
- Immediately push the child's inactive tagged ruler value to the outer
  parameter during registration, before any pointer or viewport update.
- Write coordinate updates through the setter returned by the child runtime,
  which updates the outer parameter value.
- Let sibling views read the outer value through normal param scoping.

This keeps interaction ownership local while making the coordinate value shared.
The outer target may be a plain variable parameter; after ruler registration,
siblings should observe a tagged inactive ruler value rather than `null`.

Example scenario:

- An `hconcat` has two children.
- The left child declares a ruler with `push: "outer"` and lets the user move
  the pointer, drag, or track its viewport center.
- The right child uses the outer `cursor` param in a filter or expression-driven
  transform.

The outer target must be a writable variable parameter. As with existing
`push: "outer"` semantics, pushing to an outer derived parameter, selection
parameter, or ruler parameter should fail with a clear error.

Pushed ruler bindings do not render in sibling views automatically. The pushed
outer value is available to siblings for expressions and dataflow, but visual
ruler overlays remain scoped to the view that declares the ruler binding. A
sibling that should also show a ruler must declare its own ruler binding.

### Participant Discovery

Ruler participants are resolved by a compile/attachment step, not by descendants searching for params at runtime.

- Scan the view tree for parameters with a `ruler` property.
- For each ruler parameter, create a `RulerBinding` owned by the declaring view.
- The binding scans the owner's non-chrome descendants.
- A descendant channel participates when:
  - the view has the requested positional channel,
  - the channel has a scale resolution,
  - the scale type is compatible with the source scale type,
  - for locus scales, the assembly is compatible.
- Chrome views are excluded before compatibility checks. This excludes axes, grids, legends, backgrounds, scrollbars, selection overlays, and other generated chrome.

Initial compatibility heuristic:

- Quantitative with quantitative.
- Index with index.
- Locus with locus and same assembly.
- Shared scale resolution naturally qualifies because it has the same scale.

Do not require shared scale resolutions. Independently zoomed views can still participate when their scale types are compatible.

Because the initial heuristic is intentionally broad, declare a ruler on the
smallest shared ancestor that represents the intended coordinate space.

### Multiple Ruler Parameters

For v1, a rendered non-chrome view may have only one ruler binding after
shadowing has been resolved. This matches the existing conservative interval
selection model and avoids stacking multiple generated overlays on the same
view before there is a clear use case.

- Different parameter names may exist in the same spec when their participant
  sets do not overlap.
- Same-name parameters in nested scopes follow lexical ownership. The nearest
  declaration owns the local binding for its subtree.
- Same-name ruler params with `push: "outer"` are interaction bindings for the
  child scope but write to the nearest outer writable variable parameter.
- A single ruler may still track both `x` and `y`, producing a crosshair or
  cell band.
- If multiple differently named rulers would apply to one rendered view, throw a
  clear configuration error naming the ruler params and view.
- If an ancestor and descendant ruler with the same name would both apply, the
  descendant declaration wins for the descendant subtree.

### Interaction Source and Events

Pointer-driven rulers use `on` for activation events and modifier-key filters,
matching the string/object/filter shape used by selection parameters. Do not add
separate properties such as `mode: "hover"`, `mode: "drag"`, `shift`,
`modifier`, or `requiresShift`; `on` should be the only way to customize pointer
activation.

```json
{
  "ruler": {
    "encodings": ["x"],
    "on": {
      "type": "mousedown",
      "filter": "event.shiftKey"
    }
  }
}
```

`on` uses the same event config shape as selections, but validates against a
ruler-specific event set in v1:

- a DOM event type string such as `"mousemove"` or `"mousedown"`
- an event config object with `type` and optional `filter`
- a compact event string such as `"mousedown[event.shiftKey]"` if the existing
  selection event parser is reused

Use `"mousemove"` in v1 because the current interaction pipeline routes mouse
events. Do not switch to `"pointermove"` as part of ruler implementation.
`"mousemove"` may also be added to the shared `DomEventType` if the selection
event schema should expose it, but interval selections should continue to
validate `on` separately and accept only `"mousedown"` for brushing. A
`shift+mousemove` interval brush is not a v1 behavior because it has no anchor
point.

Pointer event semantics:

- `"mousemove"` updates continuously from pointer movement inside participating
  views, follows the cursor, and clears on leave by default.
- `"mousedown"` updates immediately on primary-button press, continues tracking
  while dragging through document-level mousemove capture, and ends on mouseup.

Initial pointer defaults:

- default `on`: `"mousemove"`
- explicit `"mousedown"` should do exactly what the user requested; do not
  silently change it based on zoomability
- when mousedown would conflict with zoom/pan interaction, examples and docs
  should recommend `"mousedown[event.shiftKey]"`

For v1, only `"mousemove"` and `"mousedown"` should be accepted for pointer
rulers. Other event types should fail with a clear configuration error.

Viewport-centered rulers use `source: "viewport"` instead of `on`:

```json
{
  "ruler": {
    "encodings": ["x"],
    "source": "viewport"
  }
}
```

`source: "viewport"`:

- Updates from the current viewport center instead of pointer coordinates.
- The parameter always has a value when at least one participating view has a visible viewport.
- Updates when participating view layout, scale range, or scale domain changes.
- Behaves like the centered coordinate readout used by genome browsers such as IGV.
- Does not clear on pointer leave.
- Rejects `on` with a clear configuration error.
- Samples the declaring unit view when it is a compatible participant.
  Otherwise, samples the first compatible visible participant in layout order.
  Only the source participant writes the value; all compatible participants can
  render it.

Initial `clear` behavior:

- `clear: "mouseleave"` clears when the pointer leaves participating views.
- `clear: "mouseup"` clears at the end of a mousedown drag.
- `clear: false` keeps the last ruler value until the next interaction.
- Default:
  - `on: "mousemove"`: `"mouseleave"`
  - `on: "mousedown"`: `false`
  - `source: "viewport"`: `false`

During an active `"mousedown"` drag, document-level drag tracking owns updates
until mouseup. `clear: "mouseleave"` does not interrupt an active drag; it only
clears an idle pointer-driven ruler when the pointer leaves participating views.

This keeps the API simple: `on` defines pointer behavior, while `source:
"viewport"` defines view-state-driven behavior.

### Snapping and Discrete-Like Coordinates

`snap` controls whether the stored ruler coordinate is quantized before it is
written to the parameter.

```json
{
  "ruler": {
    "encodings": ["x"],
    "snap": "auto"
  }
}
```

Initial values:

- `"auto"`: snap index and locus scales to integer coordinates; do not snap quantitative scales.
- `"integer"`: snap numeric coordinates to integers.
- `false`: keep the inverted coordinate as-is.

For index and locus scales, `snap: "auto"` should be the default. This keeps the
ruler value stable around a single index/locus coordinate and avoids noisy
fractional values while panning or hovering.

Snapping applies to the parameter value before projection. All synchronized
views then render the same snapped coordinate through their own scales.

### Ruler Display

`display` controls how a snapped index/locus ruler is shown.

```json
{
  "ruler": {
    "encodings": ["x"],
    "snap": "auto",
    "display": "center"
  }
}
```

Initial values:

- `"line"`: draw a rule at the exact coordinate value.
- `"center"`: draw a rule at the center of the snapped index/locus band.
- `"band"`: draw a rectangle that encloses the snapped index/locus coordinate.

Default:

- quantitative scales: `"line"`
- index and locus scales with snapping enabled: `"center"`

`"band"` is useful when the selected integer coordinate represents a whole base,
bin, or index item rather than an infinitesimal point. For crosshair rulers,
`"band"` can produce one band per snapped channel; when both x and y are banded,
the overlay becomes a rectangle around the selected cell.

For locus values exposed as `{ chrom, pos }`, the generated band expressions
must convert the complex value to the channel's continuous coordinate before
adding the band width.

### Rendering Extent

Synchronization is separate from visual extent.

`extent: "view"`:

- Draw a rule inside each participating unit view.
- Each view projects the same ruler value through its own scale.
- Works with independent zoom/domain states.

`extent: "container"`:

- Draw one spanning rule at the owner/container level.
- Only valid when participating child projections align for the requested channel.
- For x rulers, this mainly applies to vertical stacks.
- For y rulers, this mainly applies to horizontal stacks.
- Throw a clear configuration error if projections do not align.

`extent: "auto"`:

- Use container spanning when the projections align and the layout is a safe concat case.
- Fall back to per-view rendering otherwise.
- Recommended default.

For the first implementation, support container spanning narrowly:

- x ruler in a `vconcat` when participating children project the ruler value to the same x pixel.
- y ruler in an `hconcat` when participating children project the ruler value to the same y pixel.
- Do not support wrapped `concat` container spanning in v1.

### Rendering Style

Use a `mark` object that mirrors a subset of rule mark styling:

```json
{
  "ruler": {
    "encodings": ["x"],
    "mark": {
      "stroke": "black",
      "strokeWidth": 1,
      "strokeDash": [4, 2],
      "opacity": 0.8,
      "zindex": 1
    }
  }
}
```

Defaults should be visible but unobtrusive. Use existing rule mark semantics where possible.

## Implementation Areas

### Specs and Schema

Likely files:

- `packages/core/src/spec/parameter.d.ts`
- `packages/core/src/spec/schema.test.js`
- generated schema/docs artifacts if the build requires them

Plan:

- Add `RulerParameter` as its own parameter variant, parallel to `SelectionParameter`.
- Add `RulerConfig`, `RulerSource`, `RulerExtent`, `RulerClear`, and `RulerEventConfig` types.
- Add `RulerEventType = "mousemove" | "mousedown"` instead of reusing the
  full selection event union for ruler validation.
- Add `"mousemove"` to the shared `DomEventType` only if the shared event schema
  should describe existing mousemove interaction listeners. Interval selection
  code must still reject non-`"mousedown"` brushing events.
- Ensure the spec type allows `push: "outer"` on ruler parameters.
- Define ruler mark styling as a small public subset, but reuse existing
  rule/rect mark property types internally where practical.
- Keep docs concise and user-facing.
- Document that ruler params are transient by default in examples, but do not force `persist: false`.

Proposed TypeScript typings:

```ts
import { PrimaryPositionalChannel, Scalar } from "./channel.js";
import { ChromosomalLocus } from "./genome.js";

export interface RulerParameter extends ParameterBase, PersistedParameter {
    /**
     * Tracks a domain coordinate and displays it as a ruler in compatible views.
     */
    ruler: RulerConfig;

    /**
     * Initial ruler value.
     */
    value?: RulerInitMapping;
}

export interface RulerConfig {
    /**
     * Positional channels whose domain coordinates are tracked by the ruler.
     *
     * __Default value:__ `["x"]`
     */
    encodings?: PrimaryPositionalChannel[];

    /**
     * Source of the ruler coordinate. `"pointer"` uses pointer events configured
     * by `on`. `"viewport"` tracks the center of the current viewport.
     *
     * __Default value:__ `"pointer"`
     */
    source?: RulerSource;

    /**
     * Event that updates a pointer-driven ruler.
     *
     * `"mousemove"` follows the pointer. `"mousedown"` updates on press and
     * continues while dragging. Event filters can require modifier keys.
     *
     * __Default value:__ `"mousemove"`
     */
    on?: RulerEventType | RulerEventConfig | string;

    /**
     * Event that clears the ruler, or `false` to keep the current value.
     *
     * __Default value:__ `"mouseleave"` for `on: "mousemove"`, otherwise `false`.
     */
    clear?: RulerClear;

    /**
     * Visual extent of the ruler.
     *
     * `"view"` draws one guide per participating view. `"container"` draws one
     * spanning guide when participating projections align. `"auto"` chooses a
     * spanning guide only when it is safe.
     *
     * __Default value:__ `"auto"`
     */
    extent?: RulerExtent;

    /**
     * Quantization applied before writing the ruler value.
     *
     * `"auto"` snaps index and locus scales to integer coordinates. `"integer"`
     * snaps all numeric coordinates. `false` keeps the original coordinate.
     *
     * __Default value:__ `"auto"` for index and locus scales, otherwise `false`.
     */
    snap?: RulerSnap;

    /**
     * How the ruler is drawn for snapped index or locus coordinates.
     *
     * `"line"` draws at the coordinate. `"center"` draws at the center of the
     * coordinate band. `"band"` draws a rectangle covering the coordinate band.
     *
     * __Default value:__ `"center"` for snapped index and locus scales, otherwise `"line"`.
     */
    display?: RulerDisplay;

    /**
     * Rule or band appearance.
     */
    mark?: RulerMarkConfig;
}

export type RulerSource = "pointer" | "viewport";

export type RulerEventType = "mousemove" | "mousedown";

export interface RulerEventConfig {
    /**
     * Event that updates a pointer-driven ruler.
     */
    type: RulerEventType;

    /**
     * Optional filter expression that must evaluate to true before the event
     * updates the ruler.
     */
    filter?: string;
}

export type RulerClear = "mouseleave" | "mouseup" | false;

export type RulerExtent = "auto" | "view" | "container";

export type RulerSnap = "auto" | "integer" | false;

export type RulerDisplay = "line" | "center" | "band";

export interface RulerMarkConfig extends ShadowProps, ZIndexProps {
    /**
     * Stroke color of ruler lines and band outlines.
     */
    stroke?: string;

    /**
     * Stroke width of ruler lines and band outlines, in pixels.
     */
    strokeWidth?: number;

    /**
     * Alternating stroke and gap lengths for dashed ruler lines and band outlines.
     */
    strokeDash?: number[];

    /**
     * Opacity of ruler lines and bands.
     */
    opacity?: number;

    /**
     * Fill color for `display: "band"`.
     */
    fill?: string;

    /**
     * Fill opacity for `display: "band"`.
     */
    fillOpacity?: number;
}

export type RulerChannelValue = Scalar | ChromosomalLocus | null;

export interface RulerValue {
    type: "ruler";
    values: Partial<Record<PrimaryPositionalChannel, RulerChannelValue>>;
}

export type RulerInitMapping = Partial<
    Record<PrimaryPositionalChannel, RulerChannelValue>
>;

export type Parameter =
    | VariableParameter
    | SelectionParameter
    | RulerParameter;
```

### Param Runtime and Ruler Values

Likely files:

- `packages/core/src/paramRuntime/paramUtils.js`
- `packages/core/src/paramRuntime/viewParamRuntime.js`
- `packages/core/src/ruler/rulerValue.js`
- `packages/core/src/utils/expression.js`

Plan:

- Add value helpers similar to selection helpers: `createRulerValue(channels,
  init)`, `isRulerValue(value)`, and `isActiveRulerValue(value, channel)`.
- Add an `isRulerParameter(param)` helper that checks for the `ruler` property.
- Update `getDefaultParamValue` so ruler params normalize `value` mappings into
  the tagged `RulerValue` shape before generic variable `value` handling.
- Update `ViewParamRuntime.registerParam` so non-pushed ruler params register as
  writable base params with the normalized tagged value.
- Update pushed ruler handling to mirror pushed selections: compute the child
  inactive/default `RulerValue` and call the pushed setter during registration
  so the outer variable receives a typed value before interaction.
- Reject pushing a ruler to an outer parameter with `expr`, `select`, or `ruler`.
  The target should remain a plain writable variable parameter.
- Extend debug state kind reporting with `"ruler"` for locally registered ruler
  parameters and keep `"push"` for pushed ruler bindings.
- Add a scale-aware expression helper named `linearize(channel, value)`.
  The channel must be a literal positional channel, matching existing helpers
  such as `scale("x", value)`. Quantitative and index values pass through as
  numbers; locus values are converted with the channel's scale resolution and
  assembly. `null` returns `null`.

### Ruler Binding Model

Likely new files:

- `packages/core/src/ruler/rulerBinding.js`
- `packages/core/src/ruler/rulerRegistry.js`
- `packages/core/src/ruler/rulerCompatibility.js`
- `packages/core/src/ruler/rulerValue.js`

Plan:

- Create a small binding object per ruler parameter.
- Store owner view, param name, ruler config, channels, participant list, expression reader, and setter.
- For pushed ruler params, keep the binding owner as the declaring child view but use the runtime-provided setter so updates go to the outer parameter.
- Resolve participants after scale resolutions and child views are available.
- Resolve the effective activation event from `on`, defaulting pointer-driven rulers to `"mousemove"`.
- Exclude chrome views using existing view selector helpers.
- Keep compatibility logic separate from overlay rendering.

### View Integration

Likely files:

- `packages/core/src/view/view.js`
- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/viewSelectors.js`

Plan:

- Add a view-level hook for creating ruler bindings after child initialization and guide/chrome setup.
- Attach applicable bindings to `GridChild` instances.
- Keep interaction listeners near `GridChild`, as interval selection interaction is handled there today.
- Ensure view mutation APIs re-run ruler binding attachment when views are inserted, moved, or removed.

### Ruler Overlay Rendering

Likely new file:

- `packages/core/src/view/gridView/rulerOverlay.js`

Plan:

- Follow the broad chrome-overlay pattern of `SelectionRect`, but do not model
  ruler placement as user dataflow.
- Prefer generated positional channel definitions that read the ruler parameter
  through `datum` or `expr` references.
- Use a static generated data source with one empty row, `data: { values: [{}] }`.
- Gate visibility with a generated param-driven filter transform, for example
  `cursor.type === 'ruler' && cursor.values.x != null`.
- One overlay instance can represent one ruler binding for one view or one container-spanning extent.
- Generate rule or rect mark specs from the ruler `mark` config, reusing
  existing rule/rect mark styling semantics where possible.
- For x rulers, encode `x` from the ruler value and let the rule span the view height.
- For y rulers, encode `y` from the ruler value and let the rule span the view width.
- For optional extent channels (`x2`/`y2`), generate the second positional
  channel from the ruler value using an ExprRef. For numeric/index values this
  can use `x2: { datum: { expr: "cursor.values.x + 1" } }`. For complex locus
  values, use the scale-aware helper, for example `x2: { datum: { expr:
  "linearize('x', cursor.values.x) + 1" } }`.
- For locus overlays, generate positional expressions with `linearize(channel,
  value)` so complex public values are converted before projection.
- For crosshairs, render both generated rules.
- For `display: "band"`, render a rect instead of a rule for snapped index/locus channels.
- Clip to the participating plot rectangle for per-view overlays.
- If current `datum`/`expr` positional channel invalidation does not rebuild geometry when params change, add an overlay-specific subscription that requests the necessary graphics update. Use SelectionRect-style `updateDynamicData` only as a fallback, not as the primary design.
- If param-driven filter transforms do not react before positional expressions
  are evaluated, fall back to row/no-row dynamic source updates while keeping
  coordinates parameter-backed.

### Coordinate Updates

Likely files:

- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/ruler/rulerBinding.js`

Plan:

- For pointer-driven rulers, convert canvas point to the source view's normalized coordinates.
- Evaluate the resolved `on` filter before starting or applying pointer-driven updates.
- Invert through the source scale for each encoded channel.
- For `source: "viewport"`, choose the source participant using the rule in
  the behavior section, derive the coordinate from that participant's viewport
  center, and update when scale domain/range or layout changes.
- Apply `snap` to the continuous coordinate before writing the parameter value.
- Convert locus values to complex public values after snapping when needed.
- Set the owner parameter to a fresh object so parameter reactivity fires.
- For `push: "outer"`, call the pushed setter so the outer parameter receives the fresh value.
- Overlay geometry is driven by positional `datum`/`expr` channel definitions that read the ruler parameter.
- Overlay visibility is driven by a generated filter over the static `[{}]` source.
- If needed, overlays subscribe to the parameter only to trigger geometry refresh.
- Clear by setting the encoded channel values to `null` while preserving the tagged ruler value shape.

### Container Extent

Likely files:

- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/gridView/rulerOverlay.js`

Plan:

- Resolve `extent: "auto"` after participants are known.
- For container spanning, check whether the relevant projected pixel coordinate is equivalent across participating children.
- Use a small tolerance for floating point comparisons.
- If forced `extent: "container"` cannot be satisfied, throw a configuration error naming the ruler param and channel.
- Keep v1 support limited to straightforward `vconcat` x rulers and `hconcat` y rulers.

## Tests

Focused Vitest coverage should live close to the changed code.

Suggested tests:

- Spec schema accepts ruler params with `source`, `on`, `extent`, `clear`, and `mark`.
- Ruler bindings attach only to non-chrome descendants.
- A ruler declared on a unit view attaches locally.
- A ruler declared on `vconcat` attaches to compatible descendant x scales.
- Independent quantitative x scales under the same owner share one ruler value but render per view.
- Locus rulers attach only to locus scales with the same assembly.
- Multiple differently named ruler params can exist when their participant sets do not overlap.
- Multiple differently named ruler params that would apply to one rendered view fail with a clear error.
- Nested same-name ruler params shadow ancestor bindings.
- A child ruler with `push: "outer"` updates the outer variable parameter.
- Registering a child ruler with `push: "outer"` seeds the outer variable with
  an inactive tagged ruler value before any interaction.
- A sibling view can use the pushed outer ruler value in an expression or transform.
- Pushing a ruler to an outer derived or selection parameter fails with a clear error.
- Pushing a ruler to an outer ruler parameter fails with a clear error; the
  outer target must be a plain variable parameter.
- Ruler params without `value` initialize to inactive tagged values, not `null`.
- Ruler params with initial `value` mappings normalize to tagged values.
- `on: "mousemove"` updates the param on mousemove and clears on leave.
- `on: "mousedown"` updates on mousedown, tracks dragging, and respects `clear`.
- `clear: "mouseleave"` does not clear while an active mousedown drag is being
  tracked through document-level mousemove.
- Custom `on` filters gate pointer-driven ruler updates.
- Invalid `on` event types fail with clear configuration errors.
- `source: "viewport"` updates the param from the viewport center after domain and layout changes.
- `source: "viewport"` uses the declaring compatible unit view as the source
  participant, otherwise the first compatible visible participant in layout order.
- Index and locus rulers snap to integer coordinates when `snap: "auto"`.
- `display: "center"` renders snapped index/locus rulers at the coordinate center.
- `display: "band"` renders a rectangle enclosing the snapped index/locus coordinate.
- `linearize("x", value)` passes through numeric/index values, converts complex
  locus values using the channel's scale resolution, and returns `null` for
  `null`.
- Ruler overlay positions are driven by parameter-backed positional channel definitions rather than user dataflow.
- Ruler overlays use a static `[{}]` source and generated param-driven filter to hide inactive rulers.
- Updating only the ruler parameter changes overlay geometry from ExprRefs
  without replacing the static `[{}]` source.
- Clearing a ruler sets the encoded channel values to `null` while preserving the tagged ruler value shape.
- `extent: "auto"` uses per-view rendering when projections differ.
- `extent: "container"` throws when projections do not align.

Useful commands:

```bash
npx vitest run packages/core/src/spec/schema.test.js
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/ruler
```

Run broader checks before considering the feature complete:

```bash
npm --workspaces run test:tsc --if-present
npm run lint
npm test
```

## Manual Examples

Create a new folder for ruler examples and manual smoke tests:

- `examples/core/ruler/`

The files in this folder should be normal Core example specs that also double as
manual interaction tests. Keep them readable, self-contained where practical,
and formatted according to `examples/README.md`.

Planned files:

- `examples/core/ruler/push-outer-hconcat.json`
- `examples/core/ruler/vconcat-independent.json`
- `examples/core/ruler/vconcat-spanning.json`

`push-outer-hconcat.json` should exercise the dataflow use case:

- The top-level `hconcat` declares a plain outer `cursor` parameter.
- The left child declares a same-name ruler with `push: "outer"` and
  `on: "mousemove"` or `"mousedown[event.shiftKey]"`.
- The left child renders ordinary marks and owns the visible ruler interaction.
- The right child does a param-driven transform or expression using the pushed
  `cursor` value, such as highlighting or filtering intervals that overlap the
  ruler coordinate.
- The right child should not render a ruler unless it declares its own ruler
  binding.

Manual checks:

- Moving or dragging in the left view updates the right view computation.
- Before the first interaction, the right view sees an inactive tagged ruler
  value rather than `null`.
- No ruler appears in the right view unless explicitly declared there.

`vconcat-independent.json` should exercise synchronized values with per-view
rendering:

- A `vconcat` declares one x ruler with `extent: "view"`.
- Children use compatible x scales but independent domains or zoom levels.
- Moving in one child updates one shared ruler value.
- Each child renders its own ruler projected through its own scale.

Manual checks:

- The ruler appears in each participating child as separate clipped guides.
- Independent zoom/domain changes keep the same domain coordinate synchronized
  while changing each child projection appropriately.
- Chrome views such as axes and grids do not become ruler participants.

`vconcat-spanning.json` should exercise container-spanning rendering:

- A `vconcat` declares one x ruler with `extent: "container"` or
  `extent: "auto"` in a layout where the child x projections align.
- Children share aligned x projections so one visual guide can span the stack.

Manual checks:

- The ruler is drawn as one spanning guide across the participating plot
  rectangles.
- The guide does not incorrectly include axes, legends, scrollbars, or other
  chrome.
- Changing the spec so child x projections differ should either fall back to
  per-view rendering for `extent: "auto"` or throw a clear configuration error
  for `extent: "container"`.

Useful manual URLs after starting the dev server with `npm start`:

```text
http://127.0.0.1:8080/?spec=examples/core/ruler/push-outer-hconcat.json
http://127.0.0.1:8080/?spec=examples/core/ruler/vconcat-independent.json
http://127.0.0.1:8080/?spec=examples/core/ruler/vconcat-spanning.json
```

## Documentation

Likely docs areas:

- `packages/core/src/spec/parameter.d.ts` JSDoc
- `docs/grammar/` if there is an existing parameter or interaction docs page
- A compact example under `examples/docs/` if the public docs should show the feature

Docs should explain:

- Rulers are cursor coordinate parameters, not selections.
- The declaring view owns the value.
- Registered ruler parameter values use the tagged `{ type: "ruler", values }`
  shape; inactive channels have `null` values.
- `push: "outer"` lets a child ruler interaction update an outer parameter for sibling views and dataflow.
- Compatible descendant views render the ruler.
- Independent zoom levels are supported.
- Rulers should be declared on the smallest shared ancestor that represents the
  intended coordinate space.
- V1 allows only one ruler binding per rendered view.
- `extent` controls visual drawing, not synchronization.
- `on` controls pointer-driven ruler interaction.
- `source: "viewport"` keeps the ruler value synchronized with the viewport center.
- `snap` and `display` control integer coordinate behavior for index/locus rulers.

Example docs snippet:

```json
{
  "vconcat": [
    { "mark": "rect" },
    { "mark": "point" }
  ],
  "params": [
    {
      "name": "cursor",
      "persist": false,
      "ruler": {
        "encodings": ["x"],
        "on": "mousemove",
        "extent": "auto"
      }
    }
  ]
}
```

## Open Decisions

- Whether `clear` should accept event config objects in v1 or only the small string/boolean set.
- Whether ruler overlays should participate in picking. Initial plan: no.
- Whether an explicit coordinate-space identifier is needed later if same-scale-type matching is too broad.
- Whether `extent: "container"` should draw through gaps/axes or only across the union of plot rectangles. Initial plan: only plot rectangles.
- Whether `display: "band"` should be supported for quantitative scales with explicit bin widths. Initial plan: only snapped index/locus channels.
- Whether the scale-aware helper should be public as `linearize(channel, value)`
  or remain internal to generated ruler overlay expressions. Initial plan:
  expose it because it is useful in user-authored expressions that consume
  complex locus ruler values.

## Implementation Sequence

- [ ] Add spec types and schema tests for ruler params.
  Tentative commit: `feat(core): add ruler parameter schema`
- [ ] Add ruler value helpers, default normalization, and runtime kind reporting.
  Tentative commit: `feat(core): normalize ruler parameter values`
- [ ] Add `push: "outer"` seeding/support and tests for ruler params.
  Tentative commit: `feat(core): support pushed ruler parameters`
- [ ] Add the scale-aware `linearize(channel, value)` expression helper and tests.
  Tentative commit: `feat(core): add linearize expression helper`
- [ ] Add compatibility helpers and unit tests.
  Tentative commit: `feat(core): add ruler compatibility helpers`
- [ ] Add binding registry and tests for participant resolution.
  Tentative commit: `feat(core): resolve ruler bindings`
- [ ] Add per-view overlay rendering with a static source and param-driven reactivity tests.
  Tentative commit: `feat(core): render ruler overlays`
- [ ] Add coordinate normalization and snapping helpers used by all ruler update sources.
  Tentative commit: `feat(core): normalize ruler coordinates`
- [ ] Add `on: "mousemove"` event/filter handling for pointer-driven ruler interactions.
  Tentative commit: `feat(core): handle ruler mousemove events`
- [ ] Add mousedown drag tracking and clear behavior.
  Tentative commit: `feat(core): add ruler drag interaction`
- [ ] Add viewport-following source driven by viewport center and domain/layout changes.
  Tentative commit: `feat(core): add viewport-sourced rulers`
- [ ] Add index/locus display modes.
  Tentative commit: `feat(core): add ruler snapping and band display`
- [ ] Add `extent: "auto"` and narrow container spanning.
  Tentative commit: `feat(core): support spanning ruler extents`
- [ ] Add mutation/update integration so inserted and removed views keep bindings current.
  Tentative commit: `feat(core): refresh ruler bindings after view mutations`
- [ ] Add manual ruler examples under `examples/core/ruler`.
  Tentative commit: `docs(core): add ruler manual examples`
- [ ] Add docs and a small example spec.
  Tentative commit: `docs(core): document ruler parameters`
- [ ] Run focused tests, then workspace checks.
  No commit expected unless verification requires fixes.
