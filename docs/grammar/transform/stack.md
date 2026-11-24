# Stack

The `"stack"` transform computes a stacked layout. Stacked bar plots and
[sequence logos](https://www.wikiwand.com/en/Sequence_logo) are some of its
applications.

## Parameters

SCHEMA StackParams

## Examples

### Stacked bar plot

EXAMPLE examples/docs/grammar/transform/stack/stacked-bar-plot.json height=250

### Diverging bars

Use `offset: "diverging"` to stack positive values above zero and negative
values below it. Each sign stacks independently in the specified sort order. The
output fields contain the lower and upper endpoints. Zero values produce
zero-height segments at zero. Non-numeric and non-finite values produce missing
endpoints and contribute nothing to the stack.

EXAMPLE examples/docs/grammar/transform/stack/diverging.json height=220

### Sequence logo

EXAMPLE examples/docs/grammar/transform/stack/sequence-logo.json height=150

For a genomic application, see the
[Multiple Sequence Alignment example](../../examples/genomic-data/multiple-sequence-alignment.md),
which uses `offset: "information"` to build a sequence logo from aligned bases.
