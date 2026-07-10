# Parameters

Parameters enable various dynamic behaviors in GenomeSpy visualizations, such as
interactive selections, [conditional encoding](./conditional-encoding.md), and
data filtering with [expressions](./expressions.md). They also enable
parameterization when
[importing](./import.md) specification fragments from external files or named
templates. Parameters in GenomeSpy are heavily inspired by the
[parameters](https://vega.github.io/vega-lite/docs/parameter.html) concept of
Vega-Lite.

## Using Input Bindings

Parameters can be bound to input elements, such as sliders, dropdowns, and
checkboxes. The GenomeSpy Core library shows the input elements below the
visualization. In the GenomeSpy App, the input elements are shown in the [_View
visibility_ menu](../sample-collections/analyzing.md), allowing the
visualization author to provide configuration options to the end
user.

Parameters with input bindings should have a unique `name` within the [import
scope](./import.md#repeating-with-named-templates). While not enforced in core,
this is necessary for bookmarkable state in the GenomeSpy App.

By default, selection parameters and parameters with input bindings are
persisted in the GenomeSpy App's bookmarks and provenance history. Use
`persist: false` to opt out of persistence for ephemeral params (such as hover
selections) or when `encoding.key` is not defined for point selections.

For point selections, `encoding.key` should uniquely identify data objects.
You can use either a single field or a composite key (an array of field
definitions). When using a composite key, keep the field order stable across
bookmark creation and restore.

The following example shows how to bind parameters to input elements and use
them to control the size, angle, and text of a text mark.

EXAMPLE examples/docs/grammar/parameters/input-bindings.json height=250

## Expressions

Parameters can be based on [expressions](./expressions.md), which can depend on
other parameters. They are automatically re-evaluated when the dependent
parameters change.

EXAMPLE examples/docs/grammar/parameters/expressions.json height=150

## Numeric Transitions

Numeric value and expression parameters can use `transition` to smooth how the
exposed runtime value follows a target value. Use `"lerp"` to continuously
interpolate toward the latest target.

Transitions apply to finite numeric scalar values only. A transitioned value
parameter requires a numeric `value`, and a transitioned expression parameter
must evaluate to a finite number. They can be used with input-bound parameters:

```json
{
  "name": "laneHeight",
  "value": 12,
  "bind": { "input": "range", "min": 2, "max": 30, "step": 1 },
  "transition": { "type": "lerp", "halfLife": 60, "epsilon": 0.02 }
}
```

The input binding writes discrete target values. Expressions and visual
encodings read the current transitioned value, which can be fractional while
the value settles.

Transitions can also be used with expression parameters:

```json
{
  "name": "zoomMessageOpacity",
  "expr": "abs(span(domain('x'))) > windowSize ? 1 : 0",
  "transition": { "type": "lerp", "halfLife": 80, "epsilon": 0.01 }
}
```

This keeps the state decision crisp while smoothing only the visual value.
For bound value parameters, bookmarks, provenance, and input controls use the
target value.

Use transitions for visual presentation such as layout, opacity, and visual
thresholds. They can also drive data loading, filtering, and other data-flow
operations, but these receive intermediate values while the transition settles.
Use transitions carefully when those operations are expensive or stateful.

Transitions cannot be used with selection parameters, ruler parameters, or
`push: "outer"` parameters.

### Transition Properties

SCHEMA ParamTransition

## Selection Parameters

Parameters allow for defining interactive selections, which can be used in
[conditional encodings](./conditional-encoding.md) and
[`"filter"`](./transform/filter.md) transforms. GenomeSpy compiles the
conditional encoding rules into efficient GPU shader code, enabling fast
interactions in very large data sets.

### Point Selection

The following example has been adapted from Vega-Lite's [example
gallery](https://vega.github.io/vega-lite/examples/interactive_bar_select_highlight.html)
with slight modifications (GenomeSpy provides no `"bar"` mark). The
specification below is fully compatible with Vega-Lite. You can select multiple
bars by holding down the `Shift` key.

EXAMPLE examples/docs/grammar/parameters/point-selection.json height=250

### Interval Selection

Interval selections allow for selecting a range of data points along one or two axes.
By default, the start gesture depends on whether the brushed channels are
zoomable:

- if any brushed channel is zoomable, start brushing with `Shift` + drag
- otherwise, start brushing with plain drag

You can override this behavior with `select.on`, for example `"on": "mousedown"`
to always start brushing on plain drag. The selection can be cleared by clicking
outside the selected area.

Active interval selections can also be resized with the mouse wheel when the
pointer is over the selection rectangle. This is controlled by `select.zoom`.
By default, `select.zoom` is:

- `false` when any brushed channel uses a zoomable scale (to avoid wheel-gesture conflicts)
- `true` otherwise

You can override the behavior with `select.zoom: true/false` or an explicit
wheel event definition such as `"zoom": "wheel[event.altKey]"`.

In concatenated views, `select.extent` controls where the selection rectangle is
drawn. The default `"auto"` draws one rectangle across the concat container when
the selected channel uses aligned projections in the child views. Otherwise, it
draws a rectangle in each participating view. `"container"` requires the
spanning rectangle, and `"view"` always draws per-view rectangles.

EXAMPLE examples/docs/grammar/parameters/interval-selection.json height=240

Selections can also drive ["filter"](./transform/filter.md) transforms, allowing for
aggregating or otherwise transforming only the selected data points. The example
below shows how to aggregate only the brushed penguins from the [Palmer
Penguins](https://allisonhorst.github.io/palmerpenguins/) dataset.

EXAMPLE examples/docs/grammar/parameters/penguins.json height=380 spechidden

#### Linking Scale Domains Across Views

An interval selection can drive [scale](./scale.md#domain-from-selection-parameters)
domains in sibling views. To make this
work with GenomeSpy's hierarchical parameter scopes:

1. Define an empty parameter in a common ancestor.
2. Define the brushing selection in a child view with the same `name`.
3. Add `"push": "outer"` so selection updates are written to the ancestor
   parameter.
4. Reference the parameter in a linked scale domain, for example:
   `{ "param": "brush" }`. The domain can be placed in
   `encoding.<channel>.scale.domain` or, for composed views, in a view-level
   `scales.<channel>.domain`.

If the linked scale is zoomable, GenomeSpy automatically keeps the domain and
selection synchronized in both directions. For non-zoomable linked scales, the
selection only drives the domain.

Use `initial` on the linked domain object to provide the configured starting
domain while the selection is empty. `initial` is only supported on zoomable
linked scales:

```json
{
  "scale": {
    "zoom": true,
    "domain": {
      "param": "brush",
      "initial": [10, 20]
    }
  }
}
```

`initial` participates in the configured domain of the linked scale. If the
linked interval selection is later cleared, the scale returns to its
normal default or data-derived domain instead of restoring `initial`.

!!! note "GenomeSpy App persistence"

    In the GenomeSpy App, selection parameters are persisted in bookmarks,
    URL hash state, and provenance history by default. In overview+detail
    setups, this means the linked domain is restored through the selection
    state. Use `persist: false` when the brush is only auxiliary UI and should
    not affect saved state.

    For app-specific state sharing and persistence, see
    [Visualizing Sample Collections](../sample-collections/visualizing.md).

##### Zoomable Linking Example

EXAMPLE examples/docs/grammar/parameters/two-way-linking.json height=250

##### Overview+detail Example

The example below shows an overview+detail view of a genome. The top view shows
the whole genome, while the bottom view shows a zoomed-in region. The linked
domain is configured at the root using `scales.x.domain`, and its `initial`
value sets the detail view's starting domain. The overview template uses
`resolve.scale.x: "excluded"` so its own x scales are not affected by the
detail domain. A [`"link"`](./mark/link.md) mark with a `"diagonal"` shape
visually connects the selected region in the overview to the detail view.

EXAMPLE examples/docs/grammar/parameters/genome-overview-detail.json height=150 spechidden

## Ruler Parameters

Ruler parameters track one domain coordinate per configured positional channel
and display it as a guide in compatible views. They are useful for cursor
readouts, genome-browser-style center coordinates, and sibling views that
compute from a shared cursor coordinate.

Rulers are not selections. They store a tagged parameter value such as:

```js
{
    type: "ruler",
    values: {
        x: 12.5
    }
}
```

Rulers can be pointer-driven, following the mouse pointer, or viewport-driven,
following the center of the current scale viewport.

Pointer-driven rulers use `ruler.on`:

- `"mousemove"` follows the pointer and clears on mouse leave by default.
- `"mousedown"` updates on press and continues while dragging. Use an event
  filter such as `"mousedown[event.shiftKey]"` when plain drag is used for zoom
  or pan gestures.

Viewport-driven rulers use `"source": "viewport"` and track the center of the
current scale viewport. A viewport ruler must not define `on` and does not clear
on mouse leave.

### Ruler Guides in Descendant Views

Rulers can be shown separately in each view with a compatible scale or drawn
across a container (`hconcat` or `vconcat`) when the participating views share
the relevant scale and layout alignment.

The example below shows a pointer-driven ruler drawn inside two views with
independent x scales.

EXAMPLE examples/docs/grammar/parameters/ruler.json height=240

### Pushing Ruler Values to Ancestor Scopes

Like selection parameters, ruler parameters can use `push: "outer"` to update a
parameter declared in an ancestor scope. This allows one view to provide the
coordinate while a sibling view reads the same parameter in expressions,
transforms, or encodings.

EXAMPLE examples/docs/grammar/parameters/ruler-push-outer.json height=240

### Properties

`ruler` supports the following properties:

SCHEMA RulerConfig
