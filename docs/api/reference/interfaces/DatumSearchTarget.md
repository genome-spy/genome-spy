[GenomeSpy Core API](../index.md) / DatumSearchTarget

# Interface: DatumSearchTarget

A record-derived interval; lookup never navigates. Locus intervals are half-open.

## Properties

### kind

> **kind**: `"locus"` \| `"numeric"`

***

### channel

> **channel**: `"x"` \| `"y"`

***

### scale

> **scale**: [`ScaleResolutionApi`](ScaleResolutionApi.md)

***

### interval

> **interval**: \[`number`, `number`\]

***

### zoomable

> **zoomable**: `boolean`
