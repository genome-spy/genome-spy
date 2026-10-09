[GenomeSpy Core API](../index.md) / DataLoadingApi

# Interface: DataLoadingApi

Observes eager URL and lazy loading attempts, including transform side inputs.
Does not validate unrequested data or report synchronous named-data updates.

## Properties

### getSnapshot

> **getSnapshot**: () => readonly [`DataLoadingEntry`](DataLoadingEntry.md)[]

Returns detached current entries, including errors preceding embed completion.

#### Returns

readonly [`DataLoadingEntry`](DataLoadingEntry.md)[]

***

### subscribe

> **subscribe**: (`listener`) => () => `void`

Observes future changes. Subscribe, then read the snapshot synchronously
for initial state and subsequent changes. Finalization unsubscribes all
listeners. Listener exceptions are reported asynchronously to the browser
and cannot change loading outcomes or prevent delivery to other listeners.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`change`) => `void` |

#### Returns

() => `void`
