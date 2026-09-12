[GenomeSpy Core API](../index.md) / ParamNamespace

# Interface: ParamNamespace

Parameters and selections resolved from one view's lexical scope.

A scoped namespace resolves the nearest declaration in that view and its
ancestors. Use `EmbedResult.params` for the authored top-level scope or a
`ViewHandle.params` namespace for a particular view. Handles returned from
this namespace are live capabilities: operations fail after finalization or,
for a view-scoped namespace, after that view is removed.

## Properties

### get

> **get**: <`T`\>(`name`) => [`ParamApi`](ParamApi.md)<`T`\>

Returns a handle for a parameter declared in this scope or an ancestor.
Use a generic type argument when the parameter contains an object or
array value.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | [`ParamValue`](../type-aliases/ParamValue.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`ParamApi`](ParamApi.md)<`T`\>

***

### getSelection

> **getSelection**: (`name`) => [`SelectionApi`](../type-aliases/SelectionApi.md)

Returns a capability for a named point or interval selection.

Throws when the name is not declared as a supported selection in this
scope.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`SelectionApi`](../type-aliases/SelectionApi.md)
