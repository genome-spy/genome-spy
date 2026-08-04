# One-Dimensional Non-Overlapping Item Placement

## Use case

Implement a layout helper for marks such as lollipops, labels, or other one-dimensional annotations.

Each input item has:

```ts
{ pos, length }
```

- `pos` is the original center coordinate.
- `length` is the full width or diameter.
- Items are already sorted by ascending `pos`.
- Their order must remain unchanged.
- Items may have different lengths.
- The output should contain the adjusted center position and displacement:

```ts
{ pos, length, displacement }
```

The goal is to remove overlaps while moving the items as little as possible. An optional minimum gap and optional outer bounds may be supported.

## Chosen approach

Formulate the layout as a one-dimensional minimum-displacement problem.

For adjusted center positions `p[i]`, adjacent items must satisfy:

```text
p[i + 1] - p[i] >= length[i] / 2 + length[i + 1] / 2 + gap
```

Minimize the total squared displacement from the original coordinates:

```text
sum((p[i] - originalPos[i])^2)
```

Convert the variable separation constraints into ordinary monotonic constraints using cumulative offsets. The transformed problem is weighted isotonic regression and can be solved with the pool-adjacent-violators algorithm (PAVA).

This approach is:

- deterministic
- globally optimal for the squared-displacement objective
- compatible with variable item sizes
- order-preserving
- linear-time, `O(n)`, when the input is already sorted

Simple outer bounds can be handled in the transformed space without changing the asymptotic complexity. The implementation should detect and report infeasible cases where the items cannot fit within the available interval.
