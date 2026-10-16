[GenomeSpy Core API](../index.md) / TransformDataOptions

# Interface: TransformDataOptions

Request for a bounded calculation on a unit view's current records.

## Properties

### scope

> **scope**: `"viewport"` \| \{ `selection`: `string`; \}

Capture records inside the viewport or a named interval brush.

***

### transform

> **transform**: readonly [`AnalysisTransformParams`](../type-aliases/AnalysisTransformParams.md)[]

Explicit pipeline; expressions have datum and built-ins, without live view parameters.

***

### inputLimit

> **inputLimit**: `number`

Maximum captured input size. Overflow rejects before analysis starts.

#### Minimum

0

#### Maximum

9007199254740991

#### Multiple Of

1

***

### limit

> **limit**: `number`

Maximum returned row count, applied after the complete calculation.

#### Minimum

0

#### Maximum

9007199254740991

#### Multiple Of

1
