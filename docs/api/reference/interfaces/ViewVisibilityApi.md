[GenomeSpy Core API](../index.md) / ViewVisibilityApi

# Interface: ViewVisibilityApi

Visibility of a live view. After view removal or embed finalization, reads
throw and writes reject.

## Properties

### locallyVisible

> `readonly` **locallyVisible**: `boolean`

The view's own visibility choice before ancestor and layout rules.

***

### staticDefault

> `readonly` **staticDefault**: `boolean`

The authored boolean, `true` when omitted, or `undefined` for an expression.

***

### override

> `readonly` **override**: `boolean`

The explicit choice to save, even when it equals the authored default.

## Methods

### setOverride()

> **setOverride**(`value`): `Promise`<`void`\>

Stores an explicit choice or clears it with `undefined`. Writes reject
for expression-controlled views. Writes run in order with structural
mutations and can be awaited inside `views.transaction()`.

Resolves after required first-show initialization and any reflow request.
Layout and viewport-dependent lazy data may settle later.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `boolean` |

#### Returns

`Promise`<`void`\>
