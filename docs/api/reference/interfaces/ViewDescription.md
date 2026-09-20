[GenomeSpy Core API](../index.md) / ViewDescription

# Interface: ViewDescription

## Properties

### title

> **title**: `string` \| `string`[]

View title text, or null when absent.

***

### description

> **description**: `string` \| `string`[]

Authored view description, or null when absent.

***

### encoding

> **encoding**: `Encoding`

Authored encoding combined with inherited encoding, detached from the specification.

***

### dataReady

> **dataReady**: `boolean`

Current viewport contribution readiness; does not imply a rendered frame.
