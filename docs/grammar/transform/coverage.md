# Coverage

The `"coverage"` transform computes
[coverage](<https://en.wikipedia.org/wiki/Coverage_(genetics)>) for overlapping
segments. The result is a new list of non-overlapping segments with the coverage
values. Sort segments by start, within each chromosome when using `chrom`.

To summarize the distribution of interval labels, see
[`categoricalCoverage`](categorical-coverage.md).

## Parameters

SCHEMA CoverageParams

## Example

Start with two overlapping segments.

| start | end |
| ----- | --- |
| 0     | 4   |
| 1     | 3   |

Apply the coverage transform to their `start` and `end` fields.

```json
{
  "type": "coverage",
  "start": "start",
  "end": "end"
}
```

The result partitions the coordinates into spans with constant coverage.

| start | end | coverage |
| ----- | --- | -------- |
| 0     | 1   | 1        |
| 1     | 3   | 2        |
| 3     | 4   | 1        |

## Interactive example

The following example demonstrates both `"coverage"` and `"pileup"` transforms.

EXAMPLE examples/docs/grammar/transform/coverage/coverage-pileup.json
