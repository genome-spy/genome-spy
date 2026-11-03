# Rule

Rule mark displays each row as a line segment. Rules can span the whole
width or height of the view. Alternatively, they may have specific endpoints.

EXAMPLE examples/docs/grammar/mark/rule/rule-mark.json height=150

## Channels

Rule mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `fill`, `opacity`, and `size` channels.

`fill` sets the body color and takes precedence over `color`. Both support
constant values, fields, expressions, and conditional encodings. `size` controls
the body thickness in logical pixels; `opacity` controls its opacity.

## Properties

SCHEMA RuleProps

## Examples

### Ranged rules

EXAMPLE examples/docs/grammar/mark/rule/ranged-rules.json height=150

### Human-mouse synteny

EXAMPLE examples/docs/grammar/mark/rule/synteny-hg38-mm10.json height=460
