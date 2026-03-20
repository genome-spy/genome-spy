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

EXAMPLE examples/docs/grammar/parameters/interval-selection.json height=240

Selections can also drive ["filter"](./transform/filter.md) transforms, allowing for
aggregating or otherwise transforming only the selected data points. The example
below shows how to aggregate only the brushed penguins from the [Palmer
Penguins](https://allisonhorst.github.io/palmerpenguins/) dataset.

EXAMPLE examples/docs/grammar/parameters/penguins.json height=380 spechidden

#### Linking Scale Domains Across Views

An interval selection can drive scale domains in sibling views. To make this
work with GenomeSpy's hierarchical parameter scopes:

1. Define an empty parameter in a common ancestor.
2. Define the brushing selection in a child view with the same `name`.
3. Add `"push": "outer"` so selection updates are written to the ancestor
   parameter.
4. Reference the parameter in a linked view via `scale.domain`, for example:
   `{ "param": "brush" }`.

Two-way behavior is automatic when the linked scale is zoomable. You can still
override with `sync: "oneWay"` or `sync: "twoWay"` in the scale-domain
reference.

##### Two-Way Linking Example

EXAMPLE examples/docs/grammar/parameters/two-way-linking.json height=250

##### Overview+detail Example

The example below shows an overview+detail view of a genome. The top view shows
the whole genome, while the bottom view shows a zoomed-in region.
[`"link"`](./mark/link.md) mark with a `"diagonal"` shape visually connects the
selected region in the overview to the detail view.

EXAMPLE examples/docs/grammar/parameters/genome-overview-detail.json height=150 spechidden
