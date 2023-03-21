# Collect

The `"collect"` transform collects (buffers) the data items from the data flow
into an internal array and optionally sorts them.

## Parameters

SCHEMA CollectParams

## Example

```json
{
  "type": "collect",
  "sort": {
    "field": ["score"],
    "order": ["descending"]
  }
}
```
