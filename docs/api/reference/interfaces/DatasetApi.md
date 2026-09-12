[GenomeSpy Core API](../index.md) / DatasetApi

# Interface: DatasetApi

## Properties

### set

> **set**: <`T`\>(`name`, `data`) => `void`

Replaces a named dataset declared by the associated owner.

Descendant views that resolve the declaration receive the updated data.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `data` | `T`[] |

#### Returns

`void`

***

### load

> **load**: (`name`, `data`, `format`) => `Promise`<`void`\>

Decodes an in-memory binary payload and replaces a named dataset declared
by the associated owner.

If loads overlap, only the most recently started dataset operation is
applied. The promise resolves after dataflow propagation and render
scheduling, but does not wait for the next animation frame.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `data` | `ArrayBuffer` \| `ArrayBufferView`<`ArrayBufferLike`\> |
| `format` | [`BinaryDatasetFormat`](BinaryDatasetFormat.md) |

#### Returns

`Promise`<`void`\>

***

### reset

> **reset**: (`name`) => `void`

Restores a named dataset declared by the associated owner to its configured
values.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`void`
