# Flatten Delimited

The `flattenDelimited` transform flattens (or normalizes) a field or a set of
fields that contain delimited values. In other words, each delimited value is
written into a new data object that contains a single value from the delimited
field. All other fields are copied as such.

## Parameters

SCHEMA FlattenDelimitedParams

## Example

Given the following data:

| patient | tissue      | value |
| ------- | ----------- | ----- |
| A       | Ova,Asc     | 4,2   |
| B       | Adn,Asc,Ute | 6,3,4 |

... and configuration:

```json
{
  "type": "flattenDelimited",
  "field": ["tissue", "value"],
  "separator": [",", ","]
}
```

TODO: Rename separator to delimiter

Flattened data is produced:

| patient | tissue | value |
| ------- | ------ | ----- |
| A       | Ova    | 4     |
| A       | Asc    | 2     |
| B       | Adn    | 6     |
| B       | Asc    | 3     |
| B       | Ute    | 4     |
