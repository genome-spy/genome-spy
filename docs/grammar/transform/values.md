# Values

The `values` transform collects a field's values into a read-only array
parameter. The input rows continue through the pipeline.

## Parameters

SCHEMA ValuesParams

## Output parameters

### Local output

Set `param` to a string naming the output. The transform declares the parameter
in its view. Expressions in that view and its descendants can read the array by
name. The array starts at `[]`.

### Sharing an output

To share the output, declare the desired parameter name in an ancestor's
`params`. Set the transform's `param` to an object with the same `name` and
`push` set to `"outer"`. The output belongs to the nearest ancestor that
declares the name. That view and its descendants can read it in expressions.

The ancestor parameter starts at `null` and becomes `[]` when the producer is
created. Declare it before any parent expressions that read it, and handle
`null` in those expressions. Create and dispose the owner and producer together.
The producer stays active when its view is hidden.

### Updates

Each successful run publishes the field values in row order, including
duplicates. The field must contain strings, booleans, or finite numbers. An
empty result publishes `[]`. If loading or processing fails, the last successful
array remains available.

With lazy data, the array describes the last successfully loaded window, which
can include prefetched data or summary bins. Feeding the output back into the
pipeline that produces it can trigger repeated loads or updates.

## Examples

### Ordering bars by frequency

`values` publishes the ordered `weather` labels as `weatherOrder`. The x scale
uses this array as its domain. Change **Year** from 2012 to 2013 to see sun move
ahead of rain.

An inferred domain keeps its active categories in first-seen order. It would
keep rain ahead of sun in 2013 even after `collect` puts sun first in the rows.

`filter` selects the year's rows. `aggregate` counts days by weather type, and
`collect` sorts the counts before `values` publishes the labels.

EXAMPLE examples/docs/grammar/transform/weather-frequency.json height=200

!!! disclaimer ""

    The 2012–2015 Seattle observations come from NOAA via `vega-datasets`. The dataset derives its weather categories from the original measurements for instructional use. [NOAA source](https://www.ncdc.noaa.gov/cdo-web/datatools/records)

### Deriving cuts in a branch

Grouping gaps make clusters easier to distinguish in a heatmap. This synthetic
example has six feature columns in three clusters. The **Minimum boundary
strength** slider controls which cluster boundaries get gaps.

The `branch` compares adjacent cluster labels with `window` and filters the
boundaries by strength. `values` publishes the selected column indices as
`cuts`. The x scale reads that array as `gapPositions` and inserts a gap before
each index. All six columns still reach the heatmap.

EXAMPLE examples/docs/grammar/transform/branch-values.json height=170

At a threshold of `0`, gaps appear before columns `2` and `4`. Raise the
threshold to `0.5` to keep the gap before column `4`. The `collect` before the
branch buffers the input so slider changes can recompute the gaps.
