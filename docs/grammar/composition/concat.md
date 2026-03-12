# View Concatenation

The `vconcat` and `hconcat` composition operators place views side-by-side
either vertically or horizontally. The `vconcat` is practical for building
genomic visualizations with multiple tracks. The `concat` operator with the
`columns` property produces a wrapping grid layout.

The spacing (in pixels) between concatenated views can be adjusted using the
`spacing` property (Default: `10`).

## Example

### Vertical

Using `vconcat` for a vertical layout.

EXAMPLE examples/docs/grammar/composition/concat/vertical-concat.json

### Horizontal

Using `hconcat` for a horizontal layout.

EXAMPLE examples/docs/grammar/composition/concat/horizontal-concat.json height=200

### Grid

Using `concat` and `columns` for a grid layout. For simplicity, the same
visualization is used for all panels in the grid.

EXAMPLE examples/docs/grammar/composition/concat/grid-concat.json height=400

### Separators

You can draw separators between child views using the `separator` property.
Separators are centered within the spacing gaps and do not affect layout. Use
`true` to enable the defaults or provide a
[`rule` mark](../mark/rule.md) style object.
Use `includePlotMargin: false` to keep the separators inside the plot area.

EXAMPLE examples/docs/grammar/composition/concat/concat-separators.json height=280

## Child sizing

The concatenation operators mimic the behavior of the CSS
[flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/). The child
views have an absolute minimum size (`px`) in pixels and an unitless `grow`
value that specifies in what proportion the possible remaining space should be
distributed. The remaining space depends on the parent view's size.

In the following example, the left view has a width of `20` px, the center view
has a grow of `1`, and the right view has a grow of `2`. If you resize the web
browser, you can observe that the width of the left view stays constant while
the remaining space is distributed in proportions of 1:2.

EXAMPLE examples/docs/grammar/composition/concat/child-sizing.json height=50

### SizeDef

SCHEMA SizeDef

The size may have both absolute (`px`) and proportional (`grow`) components.
When views are nested, both the absolute and proportional sizes are added up.
Thus, the width of the above example is `{ "px": 40, "grow": 3 }`. The spacing
between the child views is added to the total absolute width.

Views' size properties (`width` and `height`) accept both SizeDef objects and
shorthands. The SizeDef objects contain either or both of `px` and `grow`
properties. Numbers are interpreted as as absolute sizes, and `"container"` is
the same as `{ grow: 1 }`. Undefined sizes generally default to `"container"`.

Concatenation operators can nested flexibly to build complex layouts as in the
following example.

EXAMPLE examples/docs/grammar/composition/concat/sizedef-layout.json height=150

### Scrollable viewports

Sometimes the concents of a view are so large that they do not fit into the
available space. In such cases, the view can be made scrollable by setting an
explicit size for the view using the `viewportWidth` and `viewportHeight`
properties. They accept the same values as `width` and `height` properties except
for the step size. Scrollable viewports are particularly useful for categorical
data types (`"ordinal"` and `"nominal"`) and respective scales and axes that
do not support zooming and panning.

EXAMPLE examples/docs/grammar/composition/concat/scrollable-viewports.json height=200

## Resolve

By default, all channels have `"independent"` scales and axes. However, because
track-based layouts that resemble genome browsers are such a common use case,
`vconcat` defaults to `"shared"` resolution for `x` channel and `hconcat`
defaults to `"shared"` resolution for `y` channel.

### Shared axes

Concatenation operators support shared axes on channels that also have shared
scales. Axis domain line, ticks, and labels are drawn only once for each row or column.
Grid lines are drawn for all participating views.

EXAMPLE examples/docs/grammar/composition/concat/shared-axes.json height=350