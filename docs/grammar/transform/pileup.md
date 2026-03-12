# Pileup

The `"pileup"` transform computes a piled up layout for overlapping segments.
The computed lane can be used to position the segments in a visualization. The
segments must be sorted by their start coordinates before passing them to the
pileup transform.

## Parameters

SCHEMA PileupParams

## Example

Given the following data:

| start | end |
| ----- | --- |
| 0     | 4   |
| 1     | 3   |
| 2     | 6   |
| 4     | 8   |

... and configuration:

```json
{
  "type": "pileup",
  "start": "start",
  "end": "end",
  "as": "lane"
}
```

A new field is added:

| start | end | lane |
| ----- | --- | ---- |
| 0     | 4   | 0    |
| 1     | 3   | 1    |
| 2     | 6   | 2    |
| 4     | 8   | 1    |

## Interactive example

The following example demonstrates both `"coverage"` and `"pileup"` transforms.

EXAMPLE examples/docs/grammar/transform/pileup/pileup-lanes.json
