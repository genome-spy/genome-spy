[GenomeSpy Core API](../index.md) / DataLoadingEntry

# Interface: DataLoadingEntry

Current outcome of one canonical source that has attempted loading.

## Properties

### sourceId

> **sourceId**: `string`

Stable source identity within this embed. Equivalent sources may be shared.

***

### viewId

> **viewId**: `string`

Original declaring view's id. That view may no longer be live.

***

### viewPath

> **viewPath**: `string`

Original declaring view's descriptive path, captured at its first attempt.

***

### origin?

> `optional` **origin?**: `string`

Specification location or identifier returned by `EmbedOptions.getSpecOrigin`.

***

### status

> **status**: `"error"` \| `"loading"` \| `"complete"`

***

### message?

> `optional` **message?**: `string`

Present only for errors.

***

### errorPhase?

> `optional` **errorPhase?**: `"request"` \| `"processing"`

Confirmed failure boundary; absent when attribution is ambiguous.
