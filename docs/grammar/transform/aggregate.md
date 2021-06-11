# Aggregate

The `aggregate` transform is currently minimal – it adds a new `count` field
that contains the number of data items in a group. More aggregate operations
will be added later.

## Parameters

SCHEMA AggregateParams

## Example

Given the following data:

| x      | y   |
| ------ | --- |
| first  | 123 |
| first  | 456 |
| second | 789 |

... and configuration:

```json
{
  "type": "aggregate",
  "groupby": ["x"]
}
```

A new list of data objects is created:

| x      | count |
| ------ | ----- |
| first  | 2     |
| second | 1     |
