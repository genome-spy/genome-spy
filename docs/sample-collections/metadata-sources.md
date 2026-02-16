# Configuring Metadata Sources

!!! note "Developer Documentation"

    This page is intended for visualization authors configuring metadata
    sources in `samples`.

## Overview

Metadata sources make sample metadata configurable as explicit sources instead
of one monolithic metadata table. This enables:

- eager loading for regular tabular metadata (`backend: "data"`)
- lazy loading for large matrix-like metadata (`backend: "zarr"`)
- per-source defaults for imported columns

!!! warning "Legacy compatibility"

    The legacy `samples.data` and `samples.attributes` configuration remains
    supported for backward compatibility, but new configurations should use
    `samples.metadataSources`.

## Quick example

```json
{
  "samples": {
    "identity": {
      "data": { "url": "samples.tsv" },
      "idField": "sample",
      "displayNameField": "displayName"
    },
    "metadataSources": [
      {
        "id": "clinical",
        "name": "Clinical",
        "initialLoad": "*",
        "excludeColumns": ["sample", "displayName"],
        "backend": {
          "backend": "data",
          "data": { "url": "samples.tsv" },
          "sampleIdField": "sample"
        }
      },
      {
        "id": "expression",
        "name": "Expression",
        "initialLoad": false,
        "groupPath": "Expression",
        "defaultAttributeDef": {
          "type": "quantitative",
          "scale": { "scheme": "redblue", "domainMid": 0 }
        },
        "backend": {
          "backend": "zarr",
          "url": "data/expr.zarr",
          "layout": "matrix"
        }
      }
    ]
  }
}
```

In this example, `identity` reads the canonical sample ids and display names
from `samples.tsv`. The first metadata source (`clinical`) uses the same TSV as
an eager table source and autoloads all non-excluded columns at startup. The
second source (`expression`) points to a Zarr matrix, is lazy by default
(`initialLoad: false`), and defines default quantitative styling for imported
expression columns under the `Expression` group.

## Splitting configuration into files

When source definitions become long, you can keep `samples.metadataSources`
compact by importing each source from a separate JSON file.

Example in the main spec:

```json
{
  "samples": {
    "identity": {
      "data": { "url": "samples.tsv" },
      "idField": "sample",
      "displayNameField": "displayName"
    },
    "metadataSources": [
      { "import": { "url": "metadata-sources/clinical-source.json" } },
      { "import": { "url": "metadata-sources/expression-source.json" } }
    ]
  },
  ...
}
```

Example imported source file (`metadata-sources/clinical-source.json`):

```json
{
  "id": "clinical",
  "name": "Clinical",
  "initialLoad": "*",
  "excludeColumns": ["sample", "displayName"],
  "backend": {
    "backend": "data",
    "data": { "url": "../samples.tsv" },
    "sampleIdField": "sample"
  }
}
```

Import behavior:

- each imported file must define exactly one metadata source object
- nested imports are not supported
- relative paths are resolved using GenomeSpy base-url rules
- backend URLs inside an imported source are resolved relative to that imported
  file

## Configuring attribute types and scales

Attribute configuration can be attached directly to a source:

- `defaultAttributeDef` applies to all imported columns from that source
- `columnDefs` applies to specific columns and overrides defaults

Example:

```json
{
  "id": "clinical",
  "name": "Clinical",
  "groupPath": "Clinical",
  "initialLoad": "*",
  "excludeColumns": ["sample", "displayName"],
  "defaultAttributeDef": {
    "type": "nominal"
  },
  "columnDefs": {
    "purity": {
      "type": "quantitative",
      "scale": {
        "domain": [0, 1],
        "scheme": "yellowgreenblue"
      }
    },
    "ploidy": {
      "type": "quantitative",
      "scale": {
        "domain": [1.5, 6],
        "scheme": "blues"
      }
    },
    "treatment": {
      "title": "Treatment",
      "visible": true
    }
  },
  "backend": {
    "backend": "data",
    "data": { "url": "samples.tsv" },
    "sampleIdField": "sample"
  }
}
```

In this example, imported clinical columns are nominal by default. `purity` and
`ploidy` are overridden as quantitative with custom scales, and `treatment` gets
a custom title. If no explicit `type` is provided for a column, GenomeSpy
infers it from values.

## Grouping imported attributes

Metadata can be flat or hierarchical. `groupPath` controls where imported
columns are placed in that hierarchy.

- without `groupPath`: imported columns are added at the root
- with `groupPath`: imported columns are prefixed under that group path

Example:

```json
{
  "id": "expression",
  "groupPath": "Expression/RNA",
  "backend": {
    "backend": "zarr",
    "url": "data/expr.zarr",
    "layout": "matrix"
  }
}
```

Importing column `TP53` from this source creates attribute path
`Expression/RNA/TP53`.

If `attributeGroupSeparator` is set for the source, it is also used to parse
`groupPath`. For example, with `attributeGroupSeparator: "."`, value
`groupPath: "Expression.RNA"` resolves to the same hierarchy path.

## Schema reference

### `samples` entry points

APP_SCHEMA SampleDef identity metadataSources

### Metadata source definitions

APP_SCHEMA MetadataSourceEntry

APP_SCHEMA MetadataSourceDef

### Backends

APP_SCHEMA DataBackendDef

APP_SCHEMA ZarrBackendDef

### Zarr layout details

These definitions describe where the matrix/table content lives inside the
Zarr store. Use matrix layout for expression-style sample-by-feature arrays, and
table layout for row-oriented Zarr representations.

APP_SCHEMA ZarrMatrixLayoutDef

APP_SCHEMA ZarrTableLayoutDef

### Zarr identifier helpers

These optional definitions improve column lookup from user-entered terms. Use
`identifiers` for aligned identifier arrays (for example symbol and Ensembl),
and `synonymIndex` for separate synonym-to-column mappings.

APP_SCHEMA ColumnIdentifierField

APP_SCHEMA ColumnSynonymIndex

## Notes

- Omitted `initialLoad` uses backend defaults. For `backend: "data"`, this is
  equivalent to `initialLoad: "*"` for convenience.
- `excludeColumns` is useful when the same table contains identity fields (for
  example, `sample` or `displayName`) that should not become metadata
  attributes.
- Keep `metadataSources` flat: nested source imports are not supported.
