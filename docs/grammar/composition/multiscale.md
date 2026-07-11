# Multiscale Composition

`multiscale` is a convenience macro for semantic zooming. It expands to a
[`layer`](./layer.md) composition with generated opacity transitions between
child views.

## Example

EXAMPLE examples/docs/grammar/composition/multiscale/multiscale-composition.json height=180 spechidden

## How It Works

`multiscale` children are ordered from zoomed-out to zoomed-in. For `N` child
views, `stops` must contain `N - 1` values.

At compile time, `multiscale` is expanded into a regular
[`layer`](./layer.md). Normal layer behavior still applies (inherited
encodings/data, scale resolution, and opacity multiplication with manually
specified child opacity).

By default, each child is wrapped with a zoom-driven opacity ramp that
cross-fades adjacent levels. The ramp is tied directly to the zoom metric, so
two adjacent levels remain partly visible while the zoom level is between their
stops.

By default, channel selection is automatic:

1. If both `x` and `y` are available, the zoom metric is averaged.
2. If only one is available, that one is used.
3. Scales that are not visible at the `multiscale` scope (for example,
   independent descendant-local scales) are ignored.

For manual opacity control patterns, see
[`layer` zoom-driven opacity](./layer.md#zoom-driven-layer-opacity).

## Transitioned Stops

Set `stops.transition` to select one detail level at each stop and cross-fade
only while the selected level changes. See [numeric
transitions](../parameters.md#numeric-transitions) for the transition options.
Unlike the default opacity ramp, this is a time-based cross-fade rather than a
persistent blend across a zoom range. After it settles, the selected level is
fully visible and all other levels are hidden.

Set `stops.state` to give each generated stage a local 0–1 parameter. Child
expressions can use it to animate mark properties such as point size or stroke
width alongside the default opacity cross-fade.

Transitioned stops require an explicit `"x"` or `"y"` channel and cannot use
`fade`:

```json
{
  "stops": {
    "channel": "x",
    "values": [40000],
    "transition": { "type": "lerp", "halfLife": 60 },
    "state": "stageState"
  },
  "multiscale": [
    { "name": "Overview", "mark": "rect" },
    {
      "name": "Detail",
      "mark": { "type": "point", "size": { "expr": "20 + 80 * stageState" } }
    }
  ]
}
```

EXAMPLE examples/docs/grammar/composition/multiscale/multiscale-transition.json height=180 spechidden

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
