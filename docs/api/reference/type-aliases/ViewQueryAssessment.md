[GenomeSpy Core API](../index.md) / ViewQueryAssessment

# Type Alias: ViewQueryAssessment

> **ViewQueryAssessment** = \{ `status`: `"ready"`; \} \| \{ `status`: `"pending"`; `reason`: `"data-not-ready"`; \} \| \{ `status`: `"unsupported"`; `reason`: `Exclude`<[`QuerySupportReason`](QuerySupportReason.md), `"data-not-ready"`\>; \}

A snapshot of scope support, not a guarantee of later execution or row cloneability.
