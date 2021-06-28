# JavaScript API

The JavaScipt API is currently quite minimal.

## Embedding

See the [getting started](./getting-started.md) page.

## Methods in the result object

The embed function returns a promise that resolves into an object that provides
the current public API. The following methods are currently exposed:

`api.finalize()`
: Releases all resources and unregisters event listeners, etc.

`api.addEventListener(type, callback)`
: Adds an event listener, which is called when the user interacts with a mark
instance. Currently, only `"click"` events are supported. The callback receives
an event object as its first (and only) parameter. The `datum` property
contains the datum that the user interacted with.
