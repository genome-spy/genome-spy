[GenomeSpy Core API](../index.md) / DatumSearchMatch

# Interface: DatumSearchMatch

A detached matching record from one loaded publication.

## Properties

### view

> **view**: [`ViewHandle`](ViewHandle.md)

***

### datum

> **datum**: `Record`<`string`, `unknown`\>

***

### fields

> **fields**: `string`[]

***

### facetId

> **facetId**: `Scalar`[]

***

### targets

> **targets**: [`DatumSearchTarget`](DatumSearchTarget.md)[]

***

### targetIssues

> **targetIssues**: `object`[]

#### channel

> **channel**: `"x"` \| `"y"`

#### reason

> **reason**: `"unsupported-projection"` \| `"invalid-position"`
