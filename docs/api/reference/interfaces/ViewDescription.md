[GenomeSpy Core API](../index.md) / ViewDescription

# Interface: ViewDescription

## Properties

### visibility

> **visibility**: `object`

Visibility/opacity state, not proof that a row produced visible pixels.

#### configured

> **configured**: `boolean`

#### ancestorsVisible

> **ancestorsVisible**: `boolean`

#### opacity

> **opacity**: `number` \| `null`

Null when opacity cannot yet be evaluated to a finite value.

***

### source

> **source**: [`ViewSourceDescription`](ViewSourceDescription.md) \| `null`

***

### dataRevision

> **dataRevision**: `number` \| `null`

Current collector publication revision, or null without a collector.

***

### title

> **title**: `string` \| `string`[] \| `null`

View title text, or null when absent.

***

### description

> **description**: `string` \| `string`[] \| `null`

Authored view description, or null when absent.

***

### encoding

> **encoding**: `Encoding`

Authored encoding combined with inherited encoding, detached from the specification.

***

### dataReady

> **dataReady**: `boolean`

Unit-view data readiness for the current viewport; false for containers.
Does not imply a rendered frame.
