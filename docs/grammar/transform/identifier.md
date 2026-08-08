# Identifier

The `"identifier"` transform adds a runtime-unique identifier (`__uniqueId`) to
each data object.

GenomeSpy uses these identifiers internally for picking, including tooltips and
point selections. It inserts an identifier transform automatically when a mark
participates in picking and the dataflow branch does not already contain one.

Identifiers are runtime values. Do not use them as persistent record keys. For
point selections that need to survive state persistence, use `encoding.key`, as
described in the [non-visual channels
section](../mark/index.md#non-visual-channels), with fields that identify the
data objects independently of the current data flow.

## Explicit identifiers

Most specifications do not need to add this transform themselves. Add one
explicitly when several downstream views must refer to the same input object
after the data has been expanded or branched. Place it before the expansion or
branching step:

```json
{
  "transform": [
    { "type": "identifier" },
    {
      "type": "flattenCigar",
      "copyFields": ["__uniqueId", "chrom", "name", "cigar"]
    }
  ],
  "layer": [
    {
      "transform": [{ "type": "filter", "expr": "datum.cigarType == 'skip'" }],
      "mark": "rule"
    },
    {
      "transform": [
        { "type": "filter", "expr": "datum.cigarType == 'aligned'" }
      ],
      "mark": "rect"
    }
  ]
}
```

Both layers receive the same identifier for all CIGAR elements derived from
one input alignment. When a transform limits the fields copied to generated
rows, include `"__uniqueId"` explicitly, as in the example above.
