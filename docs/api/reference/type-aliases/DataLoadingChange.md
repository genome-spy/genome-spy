[GenomeSpy Core API](../index.md) / DataLoadingChange

# Type Alias: DataLoadingChange

> **DataLoadingChange** = \{ `type`: `"update"`; `entry`: [`DataLoadingEntry`](../interfaces/DataLoadingEntry.md); \} \| \{ `type`: `"remove"`; `sourceId`: `string`; \}

One source update or removal, rather than a complete snapshot.
