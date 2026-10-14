[GenomeSpy Core API](../index.md) / ViewSourceDescription

# Interface: ViewSourceDescription

Current primary source state, before any view transforms.

## Properties

### retentionEnabled

> **retentionEnabled**: `boolean`

***

### dataRevision

> **dataRevision**: `number` \| `null`

Retained collector revision, or null when retention is disabled/uninitialized.

***

### ready

> **ready**: `boolean`

Whether the source meets its current viewport readiness policy.

***

### loadingStatus

> **loadingStatus**: `"error"` \| `"loading"` \| `"complete"` \| `null`

***

### coverage

> **coverage**: \{ `type`: `"complete-source"`; \} \| \{ `type`: `"published-domain"`; `channel`: `"x"` \| `"y"`; `domain`: `number`[]; \} \| \{ `type`: `"unknown"`; \}

#### Union Members

##### Type Literal

\{ `type`: `"complete-source"`; \}

***

##### Type Literal

\{ `type`: `"published-domain"`; `channel`: `"x"` \| `"y"`; `domain`: `number`[]; \}

##### type

> **type**: `"published-domain"`

##### channel

> **channel**: `"x"` \| `"y"`

##### domain

> **domain**: `number`[]

Linearized bounds of the last publication, not raw-record completeness.

***

##### Type Literal

\{ `type`: `"unknown"`; \}
