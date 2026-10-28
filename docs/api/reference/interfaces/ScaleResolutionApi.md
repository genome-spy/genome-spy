[GenomeSpy Core API](../index.md) / ScaleResolutionApi

# Interface: ScaleResolutionApi

A public API for ScaleResolution

## Methods

### addEventListener()

> **addEventListener**(`type`, `listener`): `void`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`ScaleResolutionEventType`](../type-aliases/ScaleResolutionEventType.md) |
| `listener` | [`ScaleResolutionListener`](../type-aliases/ScaleResolutionListener.md) |

#### Returns

`void`

***

### removeEventListener()

> **removeEventListener**(`type`, `listener`): `void`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`ScaleResolutionEventType`](../type-aliases/ScaleResolutionEventType.md) |
| `listener` | [`ScaleResolutionListener`](../type-aliases/ScaleResolutionListener.md) |

#### Returns

`void`

***

### getDomain()

> **getDomain**(): `any`[]

Returns the current, possible zoomed domain.

#### Returns

`any`[]

***

### isDomainDefinedExplicitly()

> **isDomainDefinedExplicitly**(): `boolean`

Returns true if the domain has been provided explicitly in the spec.

#### Returns

`boolean`

***

### isDomainInitialized()

> **isDomainInitialized**(): `boolean`

Returns true when the scale domain has moved beyond the placeholder startup state.

#### Returns

`boolean`

#### Deprecated

This legacy heuristic does not indicate data readiness.
Inspect getDomain() for the usability conditions required by your consumer.

***

### getAssembly()

> **getAssembly**(): [`CoordinateAssembly`](CoordinateAssembly.md)

Returns detached ordered contigs from an initialized locus scale. Throws for non-locus scales.

#### Returns

[`CoordinateAssembly`](CoordinateAssembly.md)

***

### getComplexDomain()

> **getComplexDomain**(): `NumericDomain` \| `ComplexDomain`

Returns the current domain converted into complex objects. Locus endpoints
are zero-based and inclusive, covering the integer bases in the viewport.

#### Returns

`NumericDomain` \| `ComplexDomain`

***

### getLinkedSelectionDomainInfo()

> **getLinkedSelectionDomainInfo**(): `object`

#### Returns

`object`

##### param

> **param**: `string`

##### encoding

> **encoding**: `"x"` \| `"y"`

##### persist

> **persist**: `boolean`

***

### isZoomed()

> **isZoomed**(): `boolean`

#### Returns

`boolean`

***

### isZoomable()

> **isZoomable**(): `boolean`

#### Returns

`boolean`

***

### zoomTo()

#### Call Signature

> **zoomTo**(`domain`, `options?`): `Promise`<`void`\>

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `domain` | `number`[] \| `ComplexDomain` |
| `options?` | [`ZoomToOptions`](ZoomToOptions.md) |

##### Returns

`Promise`<`void`\>

#### Call Signature

> **zoomTo**(`domain`, `duration`): `Promise`<`void`\>

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `domain` | `number`[] \| `ComplexDomain` |
| `duration` | `number` \| `boolean` |

##### Returns

`Promise`<`void`\>

##### Deprecated

Use the options object form: `zoomTo(domain, { duration })`.
