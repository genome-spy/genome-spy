# Count

The `"count"` transform publishes the number of input rows as a read-only
parameter while passing every row onward. It can, for example, display an
empty-data message without collecting an array of feature identifiers.

## Parameters

SCHEMA CountParams

## Output parameter

`param` declares a parameter in the owning view's scope. Do not also declare it
in `params`. Descendant views can read it in expressions. The parameter is
read-only and is not saved in bookmarks.

The count starts at `null` before the first successful result. Each completed
input publishes its total row count, including `0` for an empty result. A result
can span multiple files or facets. Place `"count"` after any filters that define
which rows to count.

Loading or processing failures retain the last successful value.

Outputs can drive visual expressions but cannot be read by another data source
or transform expression.
