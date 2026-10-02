[GenomeSpy Core API](../index.md) / RecordingSession

# Interface: RecordingSession

Experimental, local plot recording. Cancellation rejects with AbortError.

## Properties

### paused

> `readonly` **paused**: `boolean`

Whether recording is paused. Paused time is excluded from the video.

***

### remainingMs

> `readonly` **remainingMs**: `number`

Remaining active recording time in milliseconds; frozen while paused.

***

### finished

> `readonly` **finished**: `Promise`<`Blob`\>

Completes on manual stop or the 60-second/64-MiB limit; rejects on failure.

## Methods

### pause()

> **pause**(): `void`

Pauses an active recording and its time limit.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Resumes a paused recording from the current plot state.

#### Returns

`void`

***

### stop()

> **stop**(): `Promise`<`Blob`\>

Finishes encoding and returns the same result as finished.

#### Returns

`Promise`<`Blob`\>

***

### cancel()

> **cancel**(): `void`

Discards the recording and releases capture resources.

#### Returns

`void`
