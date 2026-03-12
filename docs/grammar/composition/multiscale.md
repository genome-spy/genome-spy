# Multiscale Composition

`multiscale` is a convenience macro for semantic zooming. It expands to a
[`layer`](./layer.md) composition with generated zoom-driven
[`opacity`](./layer.md#zoom-driven-layer-opacity) transitions between child
views.

## Example

EXAMPLE examples/docs/grammar/composition/multiscale/multiscale-composition.json height=180 spechidden

## How It Works

`multiscale` children are ordered from zoomed-out to zoomed-in. For `N` child
views, `stops` must contain `N - 1` values.

At compile time, `multiscale` is expanded into a regular
[`layer`](./layer.md): each child is wrapped with generated `opacity` ramps
that cross-fade adjacent levels. Normal layer behavior still applies
(inherited encodings/data, scale resolution, and opacity multiplication with
manually specified child opacity).

By default, channel selection is automatic:

1. If both `x` and `y` are available, the zoom metric is averaged.
2. If only one is available, that one is used.
3. Scales that are not visible at the `multiscale` scope (for example,
   independent descendant-local scales) are ignored.

For manual opacity control patterns, see
[`layer` zoom-driven opacity](./layer.md#zoom-driven-layer-opacity).

### Schematic Two-Level Cross-Fade Example

This mirrors the
[`layer` cross-fading overview/detail example](./layer.md#cross-fading-overview-and-detail-layers).

```json
{
  "stops": [40000],
  "multiscale": [
    {
      "name": "Overview",
      "mark": "rect"
    },
    {
      "name": "Detail",
      "mark": "point"
    }
  ]
}
```

## Properties

All other properties follow [`layer`](./layer.md) view semantics.

SCHEMA MultiscaleSpec stops

### MultiscaleStops

SCHEMA MultiscaleStops

Array shorthand:

```json
{
  "stops": [1, 0.1]
}
```

is equivalent to:

```json
{
  "stops": {
    "metric": "unitsPerPixel",
    "values": [1, 0.1]
  }
}
```

Expression shorthands are also supported:

```json
{
  "stops": [
    2000,
    { "expr": "windowSize / max(width, 1)" },
    { "expr": "0.2 * windowSize / max(width, 1)" }
  ]
}
```

`unitsPerPixel` means data-units per screen pixel. On genomic axes, this is
typically base pairs per pixel.
