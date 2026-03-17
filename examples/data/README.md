# Example Data Fixtures

This directory contains small data files that are owned by the GenomeSpy repo.

Use this directory for:

- tiny synthetic tabular fixtures
- small generated genomic interval files
- adapted lightweight fixtures when the upstream dataset shape used in examples
  differs from the original source package
- other lightweight files that support docs, tests, and shared examples

Do not use this directory for:

- vendored upstream datasets from `vega-datasets`
- large mirrored genomic datasets
- files whose provenance is maintained elsewhere

Use these dataset classes instead:

- `data/...` for the local fixtures in this directory
- `vega-datasets/...` for files served from the `vega-datasets` package
- `https://data.genomespy.app/...` for larger externally hosted genomic assets

Keep fixture files small, stable, and easy to understand.

If a local fixture is adapted from an external public dataset, document the
provenance in the consuming example or docs page instead of treating it as an
opaque vendor drop.
