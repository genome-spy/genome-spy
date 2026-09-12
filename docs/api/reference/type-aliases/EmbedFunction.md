[GenomeSpy Core API](../index.md) / EmbedFunction

# Type Alias: EmbedFunction

> **EmbedFunction** = (`el`, `spec`, `options?`) => `Promise`<[`EmbedResult`](../interfaces/EmbedResult.md)\>

Embeds GenomeSpy into the DOM

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `el` | `HTMLElement` \| `string` | HTMLElement or a query selector |
| `spec` | `RootSpec` \| `string` | A spec object or an URL to a JSON spec |
| `options?` | [`EmbedOptions`](../interfaces/EmbedOptions.md) | Options |

## Returns

`Promise`<[`EmbedResult`](../interfaces/EmbedResult.md)\>
