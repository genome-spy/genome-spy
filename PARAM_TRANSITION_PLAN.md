# Param Transition Plan

## Rationale

GenomeSpy parameters can drive visual density, layout, opacity, thresholds, and
data filtering. Many of these values change in response to direct user input,
such as sliders or zoom gestures. Abrupt changes are correct but can feel rough
in modern interfaces, especially when a small numeric change produces a large
visual jump.

Authors can currently smooth some cases with expressions, for example by using
`smoothstep(...)` in an opacity expression. That mixes state semantics with
presentation. A param transition should let a specification keep the target
state crisp while the runtime exposes a smoothly changing numeric value for
rendering and layout.

The initial feature should be a small visual smoothing primitive, not a general
async param system.

## Use Cases

### Smooth Slider-Driven Layout

In `examples/docs/genomic-data/examples/bam-read-alignments.json`,
`laneHeight` is controlled by an integer slider:

```json
{
  "name": "laneHeight",
  "value": 12,
  "bind": { "input": "range", "min": 2, "max": 30, "step": 1 }
}
```

Changing the slider from `2` to `3` immediately increases the pileup row height
by 50%. The target value should remain discrete because the slider step is an
integer, but expressions should be able to see fractional intermediate values
while the visual layout settles.

### Crisp State With Smooth Presentation

The BAM read alignment example currently uses a ramp for the "Zoom in closer to
load data" message:

```json
{
  "expr": "smoothstep(windowSize * 0.7, windowSize, abs(domain('x')[1] - domain('x')[0]))"
}
```

The BAM source uses `windowSize` as a hard loading threshold. The opacity ramp
creates an in-between state where the message can be partially visible even
when the data is already loadable.

A transitioned derived param would keep the state decision aligned with loading
while smoothing only the presentation:

```json
{
  "name": "zoomMessageOpacity",
  "expr": "abs(domain('x')[1] - domain('x')[0]) > windowSize ? 1 : 0",
  "transition": { "type": "lerp", "halfLife": 80, "epsilon": 0.001 }
}
```

### Smooth Visual Thresholds

Input-bound thresholds can remain precise target values while visual encodings
follow smoothly. This helps avoid abrupt changes in opacity, size, or guide
positions during slider drags.
