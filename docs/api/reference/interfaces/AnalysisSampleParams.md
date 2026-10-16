[GenomeSpy Core API](../index.md) / AnalysisSampleParams

# Interface: AnalysisSampleParams

A reservoir sample with the existing default size of 500.

## Extends

- `Omit`<`SampleParams`, `"size"`\>

## Properties

### description?

> `optional` **description?**: `string`

A description of the transform step. Can be used for documentation
and agent context.

#### Inherited from

`Omit.description`

***

### type

> **type**: `"sample"`

The type of the transform to be applied

#### Inherited from

`Omit.type`

***

### size?

> `optional` **size?**: `number`

Maximum sample size; must be a positive safe integer.

#### Minimum

1

#### Maximum

9007199254740991

#### Multiple Of

1
