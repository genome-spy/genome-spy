# Coverage

The `"coverage"` transform computes
[coverage](<https://en.wikipedia.org/wiki/Coverage_(genetics)>) for overlapping
segments. The result is a new list of non-overlapping segments with the coverage
values. The segments must be sorted by their start coordinates before passing
them to the coverage transform.

## Parameters

SCHEMA CoverageParams

## Example

Given the following data:

| start | end |
| ----- | --- |
| 0     | 4   |
| 1     | 3   |

... and configuration:

```json
{
  "type": "coverage",
  "start": "startpos",
  "end": "endpos"
}
```

A new list of segments is produced:

| start | end | coverage |
| ----- | --- | -------- |
| 0     | 1   | 1        |
| 1     | 3   | 2        |
| 3     | 4   | 1        |

## Interactive example

The following example demonstrates both `"coverage"` and `"pileup"` transforms.

EXAMPLE examples/docs/grammar/transform/coverage/coverage-pileup.json
