[GenomeSpy Core API](../index.md) / ViewDataApi

# Interface: ViewDataApi

Record readback and one-shot analysis for one unit view.

## Properties

### read

> **read**: (`options`) => `object`

Copies all loaded transformed records, or those inside the viewport or a named
interval brush, using structuredClone semantics and omitting picking identifiers.
Membership is tested before the limit; truncated means more matches exist.
Viewport membership uses encoded data positions, before pixel offsets or
occlusion. Brush membership follows existing interval-selection predicates.
Scoped reads require unconditional positional encodings and, for viewport reads,
continuous scales. Does not fetch data. Throws for unready data, containers,
unsupported projections, or stale handles. Scans synchronously without a
spatial index. Limit must be a nonnegative safe integer and bounds row count.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `scope`: `"all"` \| `"viewport"` \| \{ `selection`: `string`; \}; `limit`: `number`; \} |
| `options.scope` | `"all"` \| `"viewport"` \| \{ `selection`: `string`; \} |
| `options.limit` | `number` |

#### Returns

`object`

##### rows

> **rows**: `Record`<`string`, `unknown`\>[]

##### truncated

> **truncated**: `boolean`

***

### transform

> **transform**: (`options`) => `object`

Designed primarily for agentic queries: return compact results without loading
the full raw dataset into the agent's context. The limited declarative grammar
has a JSON Schema at `@genome-spy/core/transform-data-schema.json` for validating
tool inputs.

Runs a one-shot pipeline on a complete scoped snapshot of current transformed
records. Rejects input overflow; truncated reports additional output rows.
Uses an isolated flow without changing live data, parameters, or GPU buffers.
Expressions do not inherit view parameters. Runs synchronously; row limits
do not bound execution time. Does not fetch data or establish source coverage.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`TransformDataOptions`](TransformDataOptions.md) |

#### Returns

`object`

##### rows

> **rows**: `Record`<`string`, `unknown`\>[]

##### truncated

> **truncated**: `boolean`
