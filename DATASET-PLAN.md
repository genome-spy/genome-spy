# Dataset Plan

## Goals

- Keep example data paths short and stable across local dev, docs, playground,
  screenshot tooling, and the deployed site.
- Use `vega-datasets` as-is instead of copying individual upstream files into
  the GenomeSpy repo.
- Keep large genomic example datasets out of the `genome-spy` repo.
- Make ownership and provenance obvious from the URL path alone.

## Dataset Classes

### 1. GenomeSpy-owned fixtures

Use `examples/data/` for small trivial files that belong to this repo.

Typical contents:

- tiny synthetic CSV/TSV fixtures such as `sincos.csv`
- toy BED/BEDPE files with generated intervals
- other lightweight files that are used by examples, tests, and docs

These files stay in git.

### 2. Upstream Vega datasets

Use `examples/vega-datasets/` for files served from the `vega-datasets`
package.

Example URLs in specs:

- `data/sincos.csv`
- `vega-datasets/cars.json`

The dataset files themselves are not committed to this repo. They are served in
dev and staged into the static docs site during the docs build.

### 3. Externally hosted genomic datasets

Use `https://data.genomespy.app/...` for larger genomic example datasets and
other public datasets that should not live in this repo.

These datasets remain outside the repo and are referenced with absolute URLs or
an explicit `baseUrl`.

## URL Policy

Shared example specs should use example-root-relative URLs:

- `data/...`
- `vega-datasets/...`

Do not hardcode `/examples/...` in specs. Relative URLs are what make the same
spec work in:

- local dev servers that expose `/examples/...`
- deployed docs where examples live under `/docs/examples/...`
- the deployed playground, which points at `/docs/examples/...`

External genomic assets are the exception and should use absolute
`https://data.genomespy.app/...` URLs.

## Serving Strategy

### Dev servers

Expose:

- `/examples` from repo-root `examples/`
- `/examples/vega-datasets` from `node_modules/vega-datasets/data`

### Playground dev server

Expose:

- `/examples` from repo-root `examples/`
- `/docs/examples` from repo-root `examples/`
- `/examples/vega-datasets` from `node_modules/vega-datasets/data`
- `/docs/examples/vega-datasets` from `node_modules/vega-datasets/data`

### Docs build and GitHub Pages

During docs asset preparation:

- copy repo-root `examples/` into ignored `docs/examples/`
- copy `node_modules/vega-datasets/data` into
  `docs/examples/vega-datasets/`

The GitHub Pages deployment already publishes the built docs tree, so staged
files under `docs/examples/` become available at
`https://genomespy.app/docs/examples/...`.

## Documentation Strategy

### GenomeSpy fixtures

Document local trivial fixtures in:

- `examples/README.md`
- `examples/data/README.md`

Keep this short and focused on ownership and purpose.

### Vega datasets

Document once that GenomeSpy serves `vega-datasets` unchanged and relies on the
upstream package for original sources and licenses.

Do not duplicate per-dataset provenance in GenomeSpy docs.

### Hosted genomic datasets

Keep the canonical provenance documentation in the repo docs, not in generated
asset folders.

Use:

- short source and terms notes in user-facing docs such as
  `docs/grammar/data/lazy.md`
- a central dataset catalog page in the docs for full provenance details

Each catalog entry should include:

- hosted URL at `data.genomespy.app`
- original source URL
- source organization
- assembly / release / version
- any preprocessing GenomeSpy applied
- terms or license summary
- examples that use the dataset

## Repository Organization

Keep `examples/data/` limited to small repo-owned fixtures.

Do not use it for:

- vendored `vega-datasets` files
- large genomic mirrors
- mixed provenance assets with unclear ownership

The resulting boundaries should be:

- `examples/data/`: small local fixtures owned by GenomeSpy
- `examples/vega-datasets/`: upstream datasets served from `vega-datasets`
- `https://data.genomespy.app/...`: external genomic datasets

## Phased Rollout

Implement this refactor as a sequence of small commits.

### Phase 1. Serve `vega-datasets` in dev

Update local development servers so that `vega-datasets` is available at:

- `/examples/vega-datasets/...`
- `/docs/examples/vega-datasets/...` where needed

This should cover:

- `packages/core/dev-server.mjs`
- `packages/app/dev-server.mjs`
- `packages/playground/vite.config.js`

Suggested separate commit:

- `chore(examples): serve vega-datasets in dev`

### Phase 2. Stage `vega-datasets` for docs builds

Update the docs asset preparation step so that the built docs include
`docs/examples/vega-datasets/...` without tracking those files in git.

This should be done in:

- `scripts/prepare-docs-assets.mjs`

Suggested separate commit:

- `build(docs): stage vega-datasets for static examples`

### Phase 3. Reorganize repo-owned example fixtures

Clean up `examples/data/` so that it only contains GenomeSpy-owned trivial
fixtures.

This may include:

- moving files into clearer subdirectories if that improves readability
- adding `examples/data/README.md`
- removing ambiguous or redundant fixture files

Suggested separate commit:

- `chore(examples): organize local data fixtures`

### Phase 4. Migrate example specs to the new paths

Update shared specs to use the new path policy:

- local fixtures via `data/...`
- upstream fixtures via `vega-datasets/...`
- external genomic assets via `https://data.genomespy.app/...`

This should cover:

- `examples/core/**`
- `examples/docs/**`
- `examples/app/**` if applicable

Suggested separate commit:

- `refactor(examples): adopt explicit dataset paths`

### Phase 5. Document dataset ownership and provenance

Add or update documentation that explains the three dataset classes and where
their provenance information lives.

This should cover:

- `examples/README.md`
- `examples/data/README.md`
- a central docs page for hosted genomic datasets
- brief cross-links from `docs/grammar/data/lazy.md`

Suggested separate commit:

- `docs: document dataset classes and provenance`

### Phase 6. Verify shared tooling

Run and fix any issues in the flows that depend on shared examples:

- docs build
- playground build
- example validation tests
- screenshot capture tooling

Suggested separate commit:

- `test(examples): verify shared dataset paths`
