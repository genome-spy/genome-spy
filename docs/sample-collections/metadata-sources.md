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
        "attributes": {
          "TP53": {
            "type": "quantitative",
            "scale": { "scheme": "redblue", "domainMid": 0 }
          }
        },
        "backend": {
          "backend": "zarr",
          "url": "data/expr.zarr"
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
(`initialLoad: false`), and defines quantitative styling for selected
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

- `attributes` applies to specific columns
- `attributes[""]` sets a source-level default for all imported columns

Example:

```json
{
  "id": "clinical",
  "name": "Clinical",
  "groupPath": "Clinical",
  "initialLoad": "*",
  "excludeColumns": ["sample", "displayName"],
  "attributes": {
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

In this example, `purity` and `ploidy` are configured as quantitative with
custom scales, and `treatment` gets a custom title. Other imported columns
without explicit defs still work: GenomeSpy infers their type from values.
When using grouped/hierarchical names (`attributeGroupSeparator`), `attributes`
can also target group nodes for shared defaults. See
[`Grouping and hierarchy`](#grouping-and-hierarchy).

If you need an explicit source-wide default (instead of inference), define
`attributes[""]` and then override selected columns with specific keys.

## Grouping and hierarchy

Grouping helps when metadata has many attributes: users can collapse and expand
groups in the hierarchy, and authors can configure shared defaults once at
group level (for example `type` and `scale`) instead of repeating them for
every child column.

Metadata organization is controlled by two related properties:

- `groupPath`: where imported columns are placed
- `attributeGroupSeparator`: how path-like column names are split into groups

### Placement with `groupPath`

Without `groupPath`, imported columns are added at the root. With `groupPath`,
imported columns are prefixed under that path.

Example:

```json
{
  "id": "expression",
  "groupPath": "Expression",
  "backend": {
    "backend": "zarr",
    "url": "data/expr.zarr"
  }
}
```

Importing column `TP53` from this source creates attribute path
`Expression/TP53`.

### Hierarchy with `attributeGroupSeparator`

`attributeGroupSeparator` lets grouped column names define hierarchy levels. It
also enables group-level definitions in `attributes`.

Suppose you have columns such as:

- `patientId`
- `clinical.PFI`
- `clinical.OS`
- `signature.HRD`
- `signature.APOBEC`

With `attributeGroupSeparator: "."`, the `clinical.*` and `signature.*`
columns are grouped under `clinical` and `signature`.

Inheritance rules are straightforward: child columns inherit `type` and `scale`
from the nearest parent group unless overridden by a more specific key.
`visible` and `title` apply to the group node itself (for example `clinical`)
rather than to all child columns.

Example configuration:

```json
{
  "id": "clinical",
  "name": "Clinical",
  "attributeGroupSeparator": ".",
  "attributes": {
    "patientId": {
      "type": "nominal"
    },
    "clinical": {
      "type": "quantitative",
      "scale": { "scheme": "blues" }
    },
    "clinical.OS": {
      "visible": false
    },
    "signature": {
      "type": "quantitative",
      "scale": { "scheme": "yelloworangered" },
      "visible": false
    }
  },
  "backend": {
    "backend": "data",
    "data": { "url": "samples.tsv" },
    "sampleIdField": "sample"
  }
}
```

In this configuration, `clinical.PFI` inherits quantitative/blues defaults from
`clinical`, while `clinical.OS` applies its own override (`visible: false`).

### Using both together

When both are set, `groupPath` places imported attributes under a destination
group and `attributeGroupSeparator` defines how grouped names are interpreted.

`attributeGroupSeparator` also affects how `groupPath` itself is parsed:

- with `attributeGroupSeparator: "."`, `groupPath: "Expression.RNA"` becomes
  `Expression/RNA`
- without `attributeGroupSeparator`, `groupPath` is split by `/` (so
  `"Expression/RNA"` becomes `Expression/RNA`, but `"Expression.RNA"` stays a
  single group name)

## Schema reference

### `samples` entry points

APP_SCHEMA SampleDef identity metadataSources

### Metadata source definitions

APP_SCHEMA MetadataSourceEntry

APP_SCHEMA MetadataSourceDef

### Backends

#### `data` backend

APP_SCHEMA DataBackendDef

#### `zarr` backend

Example with optional lookup helpers and matrix path overrides:

```json
{
  "id": "expression",
  "name": "Expression (Zarr)",
  "description": "Normalized expression matrix with identifier lookup.",
  "initialLoad": false,
  "groupPath": "Expression",
  "attributes": {
    "": {
      "type": "quantitative",
      "scale": { "scheme": "redblue", "domainMid": 0 }
    }
  },
  "backend": {
    "backend": "zarr",
    "url": "data/expr.zarr",
    "matrix": {
      "valuesPath": "X",
      "rowIdsPath": "obs_names",
      "columnIdsPath": "var_names"
    },
    "identifiers": [
      {
        "name": "symbol",
        "path": "var/symbol",
        "primary": true,
        "caseInsensitive": true
      },
      {
        "name": "ensembl",
        "path": "var/ensembl_id",
        "stripVersionSuffix": true
      }
    ]
  }
}
```

If your store uses the default matrix paths (`X`, `obs_names`, `var_names`),
you can omit the entire `matrix` block. Identifier helpers are optional too:
if omitted, only primary column ids are used for lookup. For a minimal setup,
see the simpler Zarr example near the top of this page.

APP_SCHEMA ZarrBackendDef

##### Zarr layout details

These definitions describe where matrix content lives inside the Zarr store.
Use these path overrides for expression-style sample-by-feature arrays.

APP_SCHEMA ZarrMatrixLayoutDef

##### Zarr identifier helpers

These optional definitions improve column lookup from user-entered terms. Use
`identifiers` for aligned identifier arrays (for example symbol and Ensembl).

APP_SCHEMA ColumnIdentifierField

## Notes

- Omitted `initialLoad` uses backend defaults. For `backend: "data"`, this is
  equivalent to `initialLoad: "*"` for convenience.
- `excludeColumns` is useful when the same table contains identity fields (for
  example, `sample` or `displayName`) that should not become metadata
  attributes.
- Keep `metadataSources` flat: nested source imports are not supported.
