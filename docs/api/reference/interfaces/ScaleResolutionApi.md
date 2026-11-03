[GenomeSpy Core API](../index.md) / ScaleResolutionApi

# Interface: ScaleResolutionApi

A public API for ScaleResolution

## Methods

### getViewport()

> **getViewport**(): \[`number`, `number`\]

Return a detached half-open band/point rank interval; null fits all categories.
Throws for other scale types. Listen to `"viewport"` events for navigation
changes; the categorical domain continues to contain all categories.
Fractional positions inside grouping gaps are not included.

#### Returns

\[`number`, `number`\]

***

### zoomToViewport()

> **zoomToViewport**(`viewport`, `options?`): `Promise`<`void`\>

Navigate a band/point scale in half-open rank coordinates, preserving its
categorical domain. Null fits all categories. Intervals narrower than one
category expand around their midpoint to span one category.
Uses the same transition options as zoomTo().

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `viewport` | \[`number`, `number`\] |
| `options?` | [`ZoomToOptions`](ZoomToOptions.md) |

#### Returns

`Promise`<`void`\>

***

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

Returns the current, possibly zoomed domain. For locus scales, this is
the internal half-open numeric interval; zoomTo() currently expects an
inclusive upper endpoint. Band and point scales return the full ordered
category domain, independently of their scale viewport.

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

Zooms to the given interval, optionally animating the transition.
Band and point scales use zoomToViewport() instead.

For locus scales, explicit numeric and chromosome-relative endpoints are
zero-based with an inclusive upper endpoint. Subtract one from the upper
position of half-open intervals returned by parseCoordinates() or datum
search before navigation. Whole-chromosome shortcuts retain their full extent.

This legacy locus convention is retained for compatibility. Standardizing
genomic interval APIs on half-open endpoints is tracked for v2.0 in
[#620](https://github.com/genome-spy/genome-spy/issues/620).

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
