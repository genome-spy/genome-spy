# Versioned Schema Workflow Plan

## Context

GenomeSpy currently publishes the generated Core and App JSON Schemas inside
their npm packages. Repository examples refer to the unversioned jsDelivr
package URLs, so editors always resolve the latest published package. The docs
asset build copies the same examples into the published documentation and the
production Playground loads those staged copies.

Version 1.0 establishes a compatibility boundary for the specification
grammar: compatible additions may be released throughout the 1.x line, while
breaking grammar changes are reserved for 2.0. Public schema URLs should make
that boundary visible without leaving copied specifications pinned to stale
minor releases. At the same time, contributors developing the next major
version must receive validation and completion from their current checkout,
not from the latest released schema.

The proposed publication model follows the established Vega and Vega-Lite
schema layout. Their project-owned schema service retains exact release files
and updates underspecified major and minor aliases to the newest matching
release. This plan adopts the URL and alias model, but implements it in
GenomeSpy's existing release-triggered static-site deployment rather than
copying their schema repository tooling.

Reference:
<https://github.com/vega/schema#readme>

Only the public URL and alias convention is reused. No Vega implementation code
is copied; the referenced schema repository is BSD-3-Clause licensed.

## Goals

- Give users stable, recognizable schema URLs owned by the GenomeSpy project.
- Let published examples follow compatible schema improvements within one
  package major without crossing a breaking major-version boundary.
- Retain immutable schemas for exact Core and App package releases.
- Keep schema aliases synchronized with official releases and preserve every
  previously published major.
- Validate repository examples in VS Code against schemas generated from the
  current checkout, including during development of GenomeSpy 2.0.
- Keep local docs and Playground development useful before the next public
  schema alias exists.
- Make schema generation and refresh discoverable and low-friction for
  contributors.

## Non-goals

- Runtime validation of a specification's declared schema version.
- Runtime validation of complete specifications against JSON Schema.
- Automatically migrating specifications between incompatible major versions.
- Guaranteeing that schema validation detects semantic, data-dependent, or
  expression-level incompatibilities.
- Removing the package-hosted schemas or preventing users from using jsDelivr.
- Publishing development-branch schemas as stable public aliases.

## Key decisions

### Use project-owned versioned URLs

The documented canonical URLs will be:

```text
https://genomespy.app/schema/core/v1.json
https://genomespy.app/schema/core/v1.2.json
https://genomespy.app/schema/core/v1.2.3.json

https://genomespy.app/schema/app/v1.json
https://genomespy.app/schema/app/v1.2.json
https://genomespy.app/schema/app/v1.2.3.json
```

The versions are package versions. Core and App versions must be read and
published independently even while the monorepo releases them in lockstep.

- An exact URL is immutable.
- A minor alias is replaced by the newest stable patch in that minor line.
- A major alias is replaced by the newest stable release in that major line.
- Old exact files and old major aliases remain available indefinitely.

Examples and normal documentation use the major alias. Exact URLs exist for
archival and reproducibility needs but are not the default recommendation.
jsDelivr remains an automatic mirror of every package's exact and ranged
versions.

### Separate repository validation from published declarations

Checked-in GenomeSpy examples will not declare a released GenomeSpy `$schema`.
VS Code workspace settings will instead associate example path groups with the
locally generated Core or App schema. This is necessary because VS Code applies
an explicit `$schema` before file-pattern associations; a released v1
declaration therefore prevents the local association from supplying the
current branch's v2 schema.

The docs asset staging step will insert the canonical major-version `$schema`
as the first property of each published GenomeSpy example. Thus:

- repository contributors validate against their current branch;
- production Playground users see the public versioned URL;
- downloaded and copied examples retain a useful schema declaration;
- a future v2 development branch does not need a prematurely published
  `v2.json` endpoint.

Examples that intentionally identify another grammar, such as Vega-Lite, must
retain that declaration and must not receive a GenomeSpy schema automatically.
The staging rules must classify Core and App examples explicitly and fail on
ambiguous or unexpected declarations rather than silently choosing a schema.
The existing third-party declarations will be reviewed and recorded in an
allowlist so that accidental legacy declarations do not become permanent by
default. Because their explicit declarations take precedence in VS Code, the
local GenomeSpy path associations must not change their validation behavior.

Raw repository examples are contributor sources rather than the supported
copy-and-adapt distribution. `examples/README.md` will direct users to the
published documentation or Playground versions, which contain the public
schema declaration, while explaining the workspace-local validation used by
contributors. This is an intentional tradeoff: branch-correct validation for
contributors takes priority over schema assistance when an individual raw file
is opened outside the repository workspace.

### Generate local schemas through one documented command

A repository-root command will generate both development schemas into the
existing package build locations. VS Code mappings will target those local
files. A workspace task may invoke the command on demand and can optionally run
when the folder opens, but command-line usage must remain sufficient for
contributors who do not use VS Code.

The workflow must give a clear error or setup instruction when a generated
schema is missing. A watcher is worthwhile only if generation is fast and the
existing development servers cannot cheaply regenerate schemas when relevant
specification type files change.

### Publish only from stable release events

The existing documentation workflow builds from a GitHub release tag and
checks out the `genome-spy.github.io` repository. On a stable release, it will
copy each generated schema to its exact filename and refresh its minor and
major aliases in the site repository.

Canonical schemas will live at `deploy-site/schema/core/` and
`deploy-site/schema/app/`, outside the `docs` and `playground` directories that
the current workflow replaces. The deploy step will stage this tree
separately. Manual workflow dispatches, prerelease events, and local
documentation builds must not mutate it; publication requires an actual
release event whose payload explicitly has `prerelease == false`. This prevents
unreleased grammar changes from appearing under a released URL. Preview builds
can use their staged local schema through the Playground's bundled-schema
mapping; they do not need a public development schema endpoint.

Exact-file publication must fail if the filename already exists with different
content. Alias replacement is expected. Schema files for other versions and
majors must not be removed when the documentation and Playground directories
are replaced. A small manifest in each library's schema directory will record
the exact version behind every alias. Publication advances an alias only when
the incoming stable version is newer than its recorded target. Rerunning the
same release is idempotent, while an older release cannot roll an alias back.
Core and App apply this comparison independently.

Before 1.0, staged examples will continue receiving the current unversioned
jsDelivr declarations even though repository sources use local associations.
Canonical `genomespy.app` URLs become the staging default only when the
corresponding package version reaches 1.0. This lets the workflow land and be
tested during 0.x without creating an undocumented `v0.json` contract. The
schema documentation follows the same conditional publication rule.

### Keep editor resolution local where possible

The Playground JSON language service will receive a `schemaRequestService` (or
an equivalent normalization boundary) that parses canonical Core schema URLs.
When the URL's major matches the bundled Core package major, it returns the
bundled schema for `v1`, `v1.2`, and `v1.2.3` forms without a network request.
This keeps completion aligned with the Playground runtime and supports preview
builds whose public alias has not been released yet. A declaration for another
major is fetched from its public URL rather than silently validated against the
wrong bundled grammar. Existing unversioned jsDelivr and unpkg URLs remain
mapped to the bundle during the pre-v1 transition.

The App schema is used for App specification editing and documentation, but the
current Playground is a Core editor. App URL handling should be added only to
an editor that actually loads App specifications; publication must not imply
unsupported App editing in the Core Playground.

## Alternatives considered

### Use jsDelivr as the canonical URL

This requires less deployment code and naturally tracks npm package versions.
However, the npm path exposes packaging details, ranged URLs have CDN alias
caching, and GenomeSpy cannot independently preserve or redirect the public
identifier if hosting conventions change. Keeping jsDelivr as a mirror retains
its operational benefits while a project-owned URL provides the stable public
contract.

### Put released `$schema` URLs in repository examples

This is convenient for people opening a raw example outside the repository,
but it makes next-major development awkward. An explicit released schema takes
precedence over the local file-pattern association instead of letting the local
schema act as an override. A public development URL would still lag local
feature branches and introduce network and cache dependencies.

### Use exact versions in all published examples

Exact URLs maximize reproducibility but become stale when users copy and adapt
examples, causing completion to omit compatible features added in later minor
releases. Major aliases provide the intended compatibility boundary with less
maintenance.

### Version the grammar independently of packages

An independent grammar version could describe compatibility more precisely,
especially across the compatible late-v0 to v1 transition. It would also give
users and maintainers two related version systems to track. Package versions
remain the public schema versions, with the v1 release documented as
stabilizing the existing grammar.

## Milestone 1: Local schema development workflow

### Intended outcome

Contributors can generate the Core and App schemas with one command, and VS
Code validates each repository example against the schema from the current
checkout without requiring a network connection or a published next-major
schema.

### Affected areas and downstream consumers

- Root `package.json` schema-generation scripts.
- `.vscode/settings.json` and, if useful, `.vscode/tasks.json`.
- GenomeSpy `$schema` declarations in `examples/core`, `examples/docs`, and
  `examples/app`.
- `examples/README.md` contributor guidance.
- Core and App schema build outputs consumed by documentation and Playground
  builds.

### Verification

- On a clean checkout, run the documented setup command and confirm both schema
  files are generated.
- Add a temporary Core specification property on a development branch and
  confirm VS Code completion and validation update after regeneration without a
  public schema change.
- Confirm Core examples use the Core schema and App examples use the App schema.
- Audit and allowlist examples that deliberately declare Vega-Lite or another
  schema, then confirm the workspace mappings do not change their validation
  behavior.
- Confirm a missing generated schema produces actionable setup guidance.

### Documentation and migration

Replace the current blanket “keep `$schema` first” rule in the examples
contributor guide. Document the local schema workflow, the third-party
declaration exception, why public GenomeSpy declarations are added during
publication, and where users should obtain copyable published examples.

### Tentative commit

`build: add local schema development workflow`

## Milestone 2: Versioned example staging and documentation

### Intended outcome

Published example JSON contains the appropriate canonical major-version schema
URL, the schema documentation recommends that URL, and production Playground
editing uses the schema bundled with its matching release.

### Affected areas and downstream consumers

- `scripts/prepare-docs-assets.mjs` example staging and version handling.
- Generated assets under `docs/example-specs/`.
- `docs/grammar/index.md` and any schema-related generated snippets.
- `utils/markdown_extension` behavior and tests where example source is read.
- `packages/playground/src/editor/jsonLanguageServiceWorker.js`.
- Production Playground links emitted by the documentation extension.

### Verification

- Unit-test Core and App URL generation for stable, minor, and patch versions.
- Unit-test the pre-v1 path so 0.x builds retain unversioned jsDelivr URLs and
  do not imply a public `v0.json` contract.
- Unit-test staging so formatting is preserved, the schema stays first, and
  allowlisted third-party `$schema` declarations are not replaced.
- Build documentation and inspect representative staged examples:
  `examples/docs/grammar/mark/point/point-mark.json` and
  `examples/app/samples.json`.
- Open a staged Core example in the production-equivalent Playground and verify
  completion, hover documentation, and validation use the bundled schema
  without a schema-download error.
- Exercise major, minor, and exact canonical Core URLs. Assert that matching
  majors use the bundle without a request and that a different major resolves
  the declared public schema instead of the bundle.
- Confirm inline documentation examples remain concise while downloadable and
  Playground versions contain the major alias.
- Fail the build if a staged GenomeSpy example retains an unversioned public
  schema URL or receives the wrong package's schema.

### Documentation and migration

Document major aliases as the default, explain exact-version URLs as an
optional reproducibility tool, and identify jsDelivr as a mirror rather than
the canonical URL.

### Tentative commit

`feat(docs): stage examples with versioned schema URLs`

## Milestone 3: Release publication and retention

### Intended outcome

Every stable release publishes immutable exact Core and App schemas and updates
the corresponding minor and major aliases at `genomespy.app`, without modifying
schemas during manual or preview deployments.

### Affected areas and downstream consumers

- `.github/workflows/docs-and-playground.yml` release conditions and deploy
  inputs.
- Schema deployment logic targeting the checked-out
  `genome-spy/genome-spy.github.io` repository.
- Existing generated `site/schema.json` and `site/app-schema.json` artifacts.
- Users and editors resolving historical or aliased schema URLs.

### Verification

- Exercise publication logic against a temporary site checkout for a sequence
  such as 1.0.0, 1.0.1, 1.1.0, and 2.0.0, including an out-of-order rerun.
- Verify exact files never change, minor aliases advance only within their
  minor line, major aliases advance only within their major line, and old tags
  cannot move either alias backward.
- Verify publishing v2 retains every v1 file and leaves `v1.json` pointing to
  the last v1 release.
- Verify Core and App artifacts are byte-for-byte equal to their corresponding
  package build outputs for the exact release.
- Verify a manual workflow dispatch does not modify the canonical schema tree.
- Verify a prerelease event cannot modify aliases and a repeated stable release
  is idempotent.
- Exercise divergent Core and App package versions and confirm their aliases
  advance independently.
- Before advancing an alias, validate a representative corpus of specifications
  published by the previous matching release against the new schema. Treat a
  failure as a compatibility regression requiring either a correction or a
  deliberate major-version release.
- After the v1.0 release, fetch all six initial Core/App exact, minor, and major
  URLs and validate representative specifications with them.

### Documentation and migration

Add the schema publication and immutability rules to the release documentation.
Record the compatible late-v0 to v1 transition, without adding runtime version
checks.

### Tentative commit

`ci: publish versioned schemas with releases`

## Integration verification

Before releasing v1.0:

1. Generate local schemas and confirm current Core and App examples validate in
   VS Code from a clean checkout.
2. Build the documentation from the v1.0 release candidate and inspect the
   staged example JSON, rendered schema guidance, and generated schema files.
3. Run the existing curated-example browser smoke suite.
4. Open `point-mark.json` from the documentation in the Playground and verify
   that the visible `v1.json` declaration produces completion, hover, and
   validation without network errors.
5. Open the staged App `samples.json` through the documented App example path
   and confirm its URL identifies the App schema.
6. Dry-run publication into a temporary copy of the site repository and verify
   retention, monotonic alias advancement, and exact-file immutability.
7. After publishing v1.0, fetch the canonical URLs from an external client and
   compare the exact schemas with the npm package artifacts.

Review gates are appropriate after the local/public schema boundary is
implemented and again after release publication is integrated. The final review
should inspect source examples, staged assets, Playground behavior, and site
retention together because each subsystem sees a different form of the schema
declaration.

## Risks and mitigations

- **Generated local schemas become stale.** Provide one obvious command,
  actionable missing-schema guidance, and an optional editor task. Consider a
  watcher only after measuring generation cost.
- **An example is assigned the wrong schema.** Classify known example roots,
  preserve explicit third-party declarations, and fail on ambiguous cases.
- **A preview overwrites a stable alias.** Gate canonical publication on stable
  non-prerelease events and test manual-dispatch and prerelease behavior.
- **A release overwrites an immutable exact schema.** Compare existing content
  and fail on differences instead of replacing the file.
- **An old release rerun rolls an alias backward.** Track alias targets in a
  manifest and require monotonic SemVer advancement independently for Core and
  App.
- **A later major removes old schema URLs.** Keep the schema tree outside the
  directories that the deployment currently deletes and exercise sequential
  release tests.
- **Playground validation differs from the visible URL.** Ensure the Playground
  bundle and staged examples originate from the same release tag, and resolve
  recognized canonical URLs to the bundled schema.
- **The Core and App versions diverge later.** Derive and test their aliases
  independently rather than relying on the Lerna version.
- **A compatible release narrows the schema accidentally.** Validate the
  previous matching release's representative public example corpus before
  advancing an alias and review intentional schema-tightening changes.

## Unresolved questions

- Should schema generation run automatically when a trusted VS Code workspace
  opens, or should the repository provide only a manual task and command?
- Is schema generation fast enough for a watch mode, and which source paths
  should trigger Core versus App regeneration?
- Should stable prereleases eventually publish exact prerelease schemas under a
  separate opt-in URL, or is local validation sufficient until a final release?
- Should the canonical schemas gain a top-level `$id` matching their exact or
  aliased public URL? This is not required for the initial publication model and
  should be decided with reference-resolution behavior in mind.

## Acceptance criteria

- Public Core and App examples use their respective `v<major>.json` canonical
  schema URLs.
- Documentation recommends the same major aliases and accurately explains
  exact and minor alternatives.
- VS Code validates repository examples against locally generated schemas from
  the current checkout, including an unreleased next-major branch.
- Production Playground schema assistance works for canonical versioned URLs
  without depending on a remote fetch.
- A stable release publishes exact, minor, and major schema files for Core and
  App from that release tag.
- Exact files are immutable, aliases advance only within their declared range,
  and old major schemas survive subsequent documentation deployments.
- Preview and manual documentation builds cannot update canonical schema
  aliases.
- Prereleases and out-of-order release reruns cannot update canonical aliases,
  while rerunning the current release is idempotent.
- A compatible alias is not advanced when the new schema rejects the previous
  matching release's representative public example corpus.
- The release and contributor workflows are documented and covered by focused
  automated checks.
