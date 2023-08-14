# Flatten

The `"flatten"` transform converts fields that hold arrays into distinct,
individual data objects. This creates a new sequence of data, where each
element encompasses both an extracted array component and all the original
fields from the corresponding input object.

## Parameters

SCHEMA FlattenParams

## Example

### Single-Field Flattening

This example flattens the array-valued field named `foo`. Note that all fields except `foo` are repeated in every output datum.

```json
{ "type": "flatten", "fields": ["foo"] }
```

Input data:

```json
[
  { "name": "alpha", "data": 123, "foo": [1, 2] },
  { "name": "beta", "data": 456, "foo": [3, 4, 5] }
]
```

Result:

```json
[
  { "name": "alpha", "data": 123, "foo": 1 },
  { "name": "alpha", "data": 123, "foo": 2 },
  { "name": "beta", "data": 456, "foo": 3 },
  { "name": "beta", "data": 456, "foo": 4 },
  { "name": "beta", "data": 456, "foo": 5 }
]
```

### Adding an Index Field

```json
{ "type": "flatten", "fields": ["foo"], "index": "idx" }
```

This example adds an field containing the array index that each item originated from.

```json
[
  { "name": "alpha", "data": 123, "foo": [1, 2] },
  { "name": "beta", "data": 456, "foo": [3, 4, 5] }
]
```

Result:

```json
[
  { "name": "alpha", "data": 123, "foo": 1, "idx": 0 },
  { "name": "alpha", "data": 123, "foo": 2, "idx": 1 },
  { "name": "beta", "data": 456, "foo": 3, "idx": 0 },
  { "name": "beta", "data": 456, "foo": 4, "idx": 1 },
  { "name": "beta", "data": 456, "foo": 5, "idx": 2 }
]
```

### Multi-Field Flattening

```json
{ "type": "flatten", "fields": ["foo", "bar"] }
```

This example simultaneously flattens the array-valued fields `foo` and `bar`. Given the input data

```json
[
  { "key": "alpha", "foo": [1, 2], "bar": ["A", "B"] },
  { "key": "beta", "foo": [3, 4, 5], "bar": ["C", "D"] }
]
```

this example produces the output:

```json
[
  { "key": "alpha", "foo": 1, "bar": "A" },
  { "key": "alpha", "foo": 2, "bar": "B" },
  { "key": "beta", "foo": 3, "bar": "C" },
  { "key": "beta", "foo": 4, "bar": "D" },
  { "key": "beta", "foo": 5, "bar": null }
]
```

### Flattening Array Objects

```json
{ "type": "flatten" }
```

This example treats the data objects as arrays that should be flattened. Given the input data

```json
[[{ "foo": 1 }], [{ "foo": 2 }, { "foo": 3 }]]
```

this example produces the output:

```json
[{ "foo": 1 }, { "foo": 2 }, { "foo": 3 }]
```
