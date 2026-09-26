[GenomeSpy Core API](../index.md) / ViewSliceAnalysisStage

# Type Alias: ViewSliceAnalysisStage

> **ViewSliceAnalysisStage** = \{ `type`: `"filter"`; `field`: `string`; `op`: `"gt"` \| `"gte"` \| `"lt"` \| `"lte"` \| `"eq"` \| `"neq"`; `value`: `number`; `absolute?`: `boolean`; \} \| \{ `type`: `"aggregate"`; `groupby?`: `string`[]; `fields`: (`string` \| `null`)[]; `ops`: [`ViewSliceAggregate`](../interfaces/ViewSliceAggregate.md)\[`"op"`\][]; `as`: `string`[]; \} \| \{ `type`: `"window"`; `groupby?`: `string`[]; `sort?`: \{ `field`: `string` \| `string`[]; `order?`: `"ascending"` \| `"descending"` \| (`"ascending"` \| `"descending"`)[]; \}; `ops`: (`"row_number"` \| `"count"`)[]; `fields?`: `null`[]; `as`: `string`[]; `frame`: \[`null`, `null`\]; \}

Restricted analysis over explicitly disclosed fields in a scoped query.
