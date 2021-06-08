# Gather

TODO: Rename to RegexGather

The Gather transform gathers columns into key-value pairs using a regular expression.

## Parameters

SCHEMA RegexFoldParams

## Example

Given the following data:

| SNP        | foo.AF | bar.AF | baz.AF |
| ---------- | ------ | ------ | ------ |
| rs99924582 | 0.3    | 0.24   | 0.94   |
| rs22238423 | 0.92   | 0.21   | 0.42   |

... and configuration:

```json
{
  "type": "gather",
  "columnRegex": ["^(.*)\\.AF$"],
  "asValue": ["VAF"],
  "asKey": "sample"
}
```

The matched columns are folded into new data rows. All others are left intact:

| SNP        | sample | VAF  |
| ---------- | ------ | ---- |
| rs99924582 | foo    | 0.3  |
| rs99924582 | bar    | 0.24 |
| rs99924582 | baz    | 0.94 |
| rs22238423 | foo    | 0.92 |
| rs22238423 | bar    | 0.21 |
| rs22238423 | baz    | 0.42 |
