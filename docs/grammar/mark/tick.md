# Tick

Tick mark is a shorthand for a [`rule`](./rule.md) mark. By default, the tick
spans the full band of the orthogonal band scale. If the orthogonal positional
channel is omitted, the tick spans the full view in that direction.

EXAMPLE examples/docs/grammar/mark/tick/tick-mark.json height=220

## Channels

Tick mark supports the primary [position](./index.md#channels) channels and the
`color` and `opacity` channels.

Unlike [`rule`](./rule.md), tick does not expose `x2`, `y2`, or `size` as part
of its public API. GenomeSpy derives the endpoints internally and uses the
`thickness` property instead of `size`.

## Properties

SCHEMA TickProps
