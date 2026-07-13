# Stack

The `"stack"` transform computes a stacked layout. Stacked bar plots and
[sequence logos](https://www.wikiwand.com/en/Sequence_logo) are some of its
applications.

## Parameters

SCHEMA StackParams

## Examples

### Stacked bar plot

EXAMPLE examples/docs/grammar/transform/stack/stacked-bar-plot.json height=250

### Sequence logo

EXAMPLE examples/docs/grammar/transform/stack/sequence-logo.json height=150

For a genomic application, see the [Multiple Sequence Alignment
example](../../genomic-data/examples/multiple-sequence-alignment.md), which
uses `offset: "information"` to build a sequence logo from aligned bases.
