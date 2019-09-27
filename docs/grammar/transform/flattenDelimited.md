---
title: Flatten Delimited Transform
---

FlattenDelimited transform flattens (or normalizes) a field or a set of
fields that contain delimited values.

## Example

Given the following data:

| patient | tissue | value |
| - | - | - |
| A | Ova,Asc | 4,2 |
| B | Adn,Asc,Ute | 6, 3, 4 |

... and configuration:

```javascript
{
    "type": "flattenDelimited",
    "field": ["tissue", "value"],
    "separator": [",", ","]
}
```

TODO: Rename separator to delimiter

Flattened data is produced:

| patient | tissue | value |
| - | - | - |
| A | Ova | 4 |
| A | Asc | 2 |
| B | Adn | 6 |
| B | Asc | 3 |
| B | Ute | 4 |
