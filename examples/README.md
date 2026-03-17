# Examples

This directory contains shared example specifications used across the monorepo.

Launch the app dev server with `npm start` and open examples with URLs like:

`http://localhost:8080/?spec=examples/core/first.json`

## Purpose

The examples in this directory are shared assets for:

- docs
- the app dev server
- the playground
- screenshot generation
- example validation tests

Treat them as user-facing source files. They should be easy to read, easy to
reuse, and stable enough for automated tooling.

## Structure

- `core/` is for curated shared examples that work with GenomeSpy Core.
- `docs/` is for examples extracted from documentation pages.
- `app/` is reserved for app-only examples.
- `data/` contains small GenomeSpy-owned fixtures referenced by examples.
- `vega-datasets/` is reserved for upstream `vega-datasets` files served at
  runtime and staged into the built docs site.

## Data Sources

Shared examples use three dataset classes:

- `data/...` for small local fixtures that belong to this repo
- `vega-datasets/...` for files served unchanged from the `vega-datasets`
  package
- `https://data.genomespy.app/...` for larger externally hosted genomic assets

Use example-root-relative URLs such as `"url": "data/sincos.csv"` and
`"url": "vega-datasets/cars.json"`. Do not hardcode `"/examples/..."` in specs.
The same spec must work both in local dev and in deployed docs under
`/docs/examples/...`.

## Formatting

This section is a style guide for both humans and LLMs editing example specs.

### General rules

- Keep JSON valid and compatible with Prettier.
- Keep `$schema` first and `description` second.
- Add a blank line between major top-level sections to improve scanability.
- Prefer short files that read well in documentation code blocks.
- Preserve semantic grouping even when compacting the formatting.

### Compactness

- Put short objects on a single line.
- Put short arrays on a single line.
- Keep simple inline `values` rows on a single line per object.
- Use the shortest equivalent form when it improves readability.
  - Prefer `"mark": "point"` over `"mark": { "type": "point" }` when no other mark props are needed.
  - Prefer `"x2": { "field": "end" }` on one line when it stays readable.
- Do not force everything onto one line. Expand nested objects when that makes structure clearer.

### Grouping

- Group related top-level sections with blank lines between them.
  - Typical order is: `$schema`, `description`, data/setup, shared config, composition, marks/encodings.
- Within arrays such as `layer`, `concat`, `hconcat`, and `vconcat`, separate visually distinct child views with blank lines when the children are more than trivial one-liners.
- Keep tiny repeated child specs compact.
  - Example: `[{ "mark": "point" }, { "mark": "point" }]`

### Docs examples

- Docs examples should stay simple and self-contained.
- They may reference shared files under `data/` or `vega-datasets/`.
- They should not import other example specs or views.
- Prefer tidy URLs such as `"url": "data/sincos.csv"` or
  `"url": "vega-datasets/cars.json"`.

### What to optimize for

- A reader should be able to understand the example quickly in the docs.
- Related properties should appear near each other.
- Trivial ceremony should be collapsed.
- Complex structure should still be visually obvious.

In short: compact, grouped, and readable beats mechanically expanded JSON.
