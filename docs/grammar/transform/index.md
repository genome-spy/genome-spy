# Transforms

Transforms allow for modifying the data before it is displayed on screen.
They may filter (subset) the data, add or remove fields, or add new rows.

TODO: More about the data flow etc...

## Example

```json
{
  ...,
  "data": { ... },
  "transform": [
    {
      "type": "filter",
      "expr": "datum.end - datum.start < 5000"
    }
  ],
  ...
}
```
