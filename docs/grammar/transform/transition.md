# Transition

The `"transition"` transform smooths numeric fields between dataflow updates.
It matches rows by a stable unique key and writes interpolated values either to
new fields or back to the input fields. Omit the transform when values should
update immediately without temporal state.

## Parameters

SCHEMA TransitionParams

## Usage

Keep target and displayed fields separate when an upstream transform recomputes
the targets reactively:

```json
{
  "type": "transition",
  "key": "id",
  "fields": ["targetDx", "targetDy"],
  "as": ["dx", "dy"],
  "targetDelay": 10,
  "halfLife": 100,
  "epsilon": 0.25
}
```

`halfLife` controls how quickly the remaining distance decreases. `epsilon`
sets the distance at which values snap exactly to their targets. A positive
`targetDelay` waits for the complete target batch to remain unchanged before
accepting it, which can reduce directional changes when a discrete layout
algorithm produces several intermediate arrangements during interaction. Its
default value of zero accepts every target immediately.

Keys must remain stable and unique within each batch. New keys snap directly to
their first values because they have no previous displayed position. Removed
keys release their transition state. Updates before the first render and
headless rendering also snap to their targets.
