# Rule

Rule mark displays each row as a line segment. Rules can span the whole
width or height of the view. Alternatively, they may have specific endpoints.

EXAMPLE examples/docs/grammar/mark/rule/rule-mark.json height=150

## Channels

Rule mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `opacity`, and `size` channels.

An optional `outlineColor` and `outlineWidth` separate overlapping rules. For
example, `"mark": {"type": "rule", "outlineColor": "white", "outlineWidth": 1}`
adds one pixel to each side of the line without changing its encoded `size`.
Each outline is painted with its rule, so later rules cover earlier ones.
Outlines are supported by WebGL, Canvas2D, and SVG export. The experimental
WebGPU renderer rejects outlined rules.

## Properties

SCHEMA RuleProps

## Examples

### Ranged rules

EXAMPLE examples/docs/grammar/mark/rule/ranged-rules.json height=150

### Human-mouse synteny

EXAMPLE examples/docs/grammar/mark/rule/synteny-hg38-mm10.json height=460
