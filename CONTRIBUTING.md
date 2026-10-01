# Contributing to GenomeSpy

Thank you for considering contributing GenomeSpy.

## Commit Guidelines

### Atomic Commits

Every commit should be atomic, encapsulating a single change. This practice
enhances clarity and simplifies code review and bug tracing. Before pushing,
review your commits to ensure each represents a single logical change.

### Conventional Commits and Commitlint

We adhere strictly to the [conventional
commits](https://www.conventionalcommits.org/en/v1.0.0/) specification to
maintain a clean, navigable, and informative commit history. To facilitate this,
commit messages should be validated using
[commitlint](https://commitlint.js.org/). Running `npm install` will install
git hooks that will validate your commit messages automatically.

If applicable, the scope in the commit message should be the package name, e.g.,
`core` or `app`. However, when making commits that will be squashed into a
single commit, the scope can be omitted.

Conventional Commits describe Git history. They no longer calculate versions or
generate release notes after `v1.0.0`; Changesets records those decisions.

## Release notes for contributions

Include a `.changeset/*.md` fragment with each user-visible change, whether it
arrives through a PR or a direct commit to `master` or `main`:

```sh
npm run changeset
npm run release:check
npm run release:status
```

Select the directly affected packages and describe the benefit or corrected
behavior in language GenomeSpy users understand. Use `patch` for compatible
fixes, `minor` for compatible functionality, and `major` for breaking API or
specification changes. Every breaking note must explain the required migration.
The eight release packages share one fixed version, so selecting a single
affected package propagates the bump to the group. Private applications are
versioned but never published or tagged. The private WebGPU prototype remains
outside the group, at its own development version.

Update an existing fragment when further commits change the same unreleased
feature. Use separate fragments for independent changes. For changes with no
release impact, such as tests, CI, pure refactoring, or internal documentation,
record the decision with an empty fragment:

```sh
npm run changeset -- --empty
```

CI checks PRs and pushes to `master`/`main` for a new or updated fragment. It
validates package names, release plans, and the publication boundary; reviewers
still assess the bump and prose. Version commits consume fragments and do not
need another no-release marker. See [.changeset/README.md](.changeset/README.md)
for the complete contribution contract.

## Releases

`v1.0.0` was the final release calculated with Lerna Lite and Conventional
Commits. Preserve the existing versions and changelog history as the baseline;
start accumulating Changesets fragments for subsequent changes.

Prepare a stable release from a clean checkout with committed fragments:

```sh
npm run release:status
npm run release:check
npm run release:version
git diff
```

`release:status` inspects the calculated versions without modifying the repo.
`release:version` runs Changesets, consumes pending fragments, updates manifests
and package changelogs, synchronizes `package-lock.json`, and
adds a root changelog entry grouped into breaking changes, features, and fixes.
Each logical fragment appears once in the root entry, even when several fixed
packages are affected. The GitHub changelog formatter supplies PR/commit links
and contributor attribution; release preparation needs a `GITHUB_TOKEN` with
the formatter's documented read permissions. See the
[formatter documentation](https://changesets.dev/packages/changelog-github).
Empty fragments alone do not create a release. This command supports stable
releases. The deferred branch policy and required prerelease work are recorded
under [future major release lines](#future-major-release-lines). Snapshot
workflows require a separate design.

Review and commit all generated changes using Conventional Commits, then run the
normal lint, type, build, and test checks and `npm run smoke:examples` before
publication. Inspect the npm publication candidates with:

```sh
npm run release:plan
```

Only App, Core, Inspector, and the React component are published. All eight
release packages share Core's manifest version; the private WebGPU prototype
keeps its independent version. npm workspaces builds packages in the explicit
order in the root `build` script, with Core and the plugins before App and the
frontends. Update that order when introducing a new build dependency.

### Set up npm trusted publishing once

For each of `@genome-spy/core`, `@genome-spy/app`, `@genome-spy/inspector`, and
`@genome-spy/react-component`, open its npm package settings and add a GitHub
Actions trusted publisher with:

- Organization: `genome-spy`
- Repository: `genome-spy`
- Workflow filename: `publish.yml` (just the filename)
- Environment: leave empty; this workflow does not use a GitHub environment
- Allowed actions: enable direct `npm publish`

New trusted publisher configurations default to staged publishing, which this
Changesets workflow does not use. Enable direct publishing explicitly. The
workflow uses a GitHub-hosted runner, Node 24, npm 11 (at least 11.5.1), and
`id-token: write`. npm exchanges the workflow identity for a short-lived publish
credential and automatically supplies provenance for these public packages.
No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. See
[npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
After verifying the first successful trusted release, restrict legacy token
publishing and revoke unused automation tokens in npm settings.

Keep the existing `ACTIONS_DEPLOY_KEY` repository secret for the separate site
repository. The release action needs permission to create repository tags and
GitHub releases; repository rules must permit those operations by GitHub Actions.

### Publish a reviewed release commit

Push the reviewed version commit to `master` and let CI pass. In GitHub Actions,
select **Publish GenomeSpy**, choose **Run workflow** on `master`, and enter the
exact prepared manifest version, such as `1.0.1`. The run uses the commit selected
when it starts; subsequent commits do not change that checkout.

The action verifies the expected stable version, synchronized packages, consumed
release fragments, root release notes, and absence of the global tag. It then
runs lint, type checks, tests, embedding-example builds, then the complete
ordered build and real npm packing with lifecycle scripts. The final build runs
after tests because bundle smoke tests rewrite App outputs without its schema.
Archive validation checks runtime and type entry files before publication. Core's packing hook rewrites its source
exports to built files and restores the working manifest afterward.

Changesets publishes the four public packages at their reviewed versions and
skips versions already present on npm. Publication reuses the completed
builds; publishing does not repeat them. The action creates the single
annotated `vX.Y.Z` tag at that commit and a GitHub release containing the root
changelog entry after npm succeeds. Package-specific Git tags are disabled.

The action explicitly calls the docs/Playground deployment workflow at the new
tag, including versioned schemas and alias updates. A GitHub release created
with `GITHUB_TOKEN` does not trigger another release-event workflow. Human-created
releases and manual docs deployments still use the existing triggers. See
[GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

If npm publication fails partway through, rerun the publish job at the same
commit; Changesets skips successfully published package versions. If the tag and
GitHub release already exist and only docs failed, rerun the failed docs job.
The publish job rejects an existing global tag, so inspect a failure during tag
or release creation and complete that step manually before deploying docs.

`npm run release:publish` is the action's publishing command and performs a real
npm publication. Do not run it during preparation or rehearsal. Use
`npm run release:version` instead of plain `changeset version` so the lockfile
and root changelog are prepared too.

### Rehearse without publishing

Use a disposable checkout or worktree to rehearse versioning. `changeset version`
has no non-mutating dry run. `release:status` and `release:plan` inspect plans;
versioning consumes fragments and changes files. To build and pack locally:

```sh
npm run build
mkdir -p /tmp/genomespy-pack
npm run --silent release:pack -- --pack-destination /tmp/genomespy-pack --json \
  > /tmp/genomespy-pack/packed-packages.json
node scripts/verifyPackedPackages.mjs /tmp/genomespy-pack/packed-packages.json
git diff --exit-code -- packages/*/package.json
```

Packing runs the actual `prepack`/`postpack` lifecycle and writes only the four
public tarballs. Inspect their manifests and entry files before release. Never
run publication, tag pushes, or GitHub-release creation during rehearsal.

### Future major release lines

This policy is deferred. Continue compatible 1.x development on `master`, using
patch and minor changesets and stable releases under npm's `latest` tag. Create
the maintenance branch and enter prerelease mode when work on the next breaking
release begins, after the supporting tooling below is implemented.

Before merging the first breaking PR, create `release/1.x` from the chosen
stable 1.x baseline, including the release tooling. Prefer cutting the branch
after a stable release so pending release fragments have been consumed. The
intended branch roles are:

| Branch        | Accepted changes                                  | Release line                       |
| ------------- | ------------------------------------------------- | ---------------------------------- |
| `master`      | Main development, including breaking changes      | Next major, initially 2.0 previews |
| `release/1.x` | Compatible fixes and selected compatible features | Stable 1.x                         |

Keep `.changeset/config.json`'s `baseBranch` as `master` on the development
branch and set it to `release/1.x` on the maintenance branch. Use temporary
branches for feature and backport PRs; each supported major needs one enduring
maintenance branch, not a branch per feature.

Breaking PRs target `master` and include a major changeset with migration
instructions. Compatible work also targets `master` by default. Merging a PR
records release intent; it does not publish packages. Once prerelease support
is ready, enter Changesets prerelease mode with `next` on `master` and prepare
reviewed previews such as `2.0.0-next.0`. When the major is ready, exit prerelease
mode and prepare the final stable version commit. See the
[Changesets prerelease guide](https://changesets.dev/guide/prereleases).

For changes needed by both lines, merge the implementation into `master`, then
open a backport PR against `release/1.x` by cherry-picking or adapting it. Include
a changeset appropriate to the 1.x behavior, usually patch for a fix. Fix bugs
specific to 1.x on the maintenance branch and forward-port them when relevant.
Keep release/version commits, generated changelogs, lockfile version updates,
and prerelease state local to each line; port individual implementation changes
rather than routinely merging whole release branches. See the
[Changesets backporting guide](https://changesets.dev/guide/backporting-changes).

The intended npm channel policy is:

| Release                                          | npm dist-tag |
| ------------------------------------------------ | ------------ |
| Stable 1.x while it is the current stable major  | `latest`     |
| 2.0 prereleases                                  | `next`       |
| Final 2.0 and subsequent current stable releases | `latest`     |
| 1.x maintenance after 2.0 becomes stable         | `latest-1`   |

Older-major releases must explicitly use their maintenance tag to preserve the
current `latest`. GitHub prereleases must be marked as such, and older-major
releases must not replace the current major as the latest GitHub release. See
[npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/).

Before activating this policy, complete the following work:

- Extend `scripts/release.mjs` and the contribution gate for Changesets
  prerelease entry, repeated previews, and exit. Preserve the fixed/private
  package policy, handle archived `.changeset/pre/` notes in the final changelog,
  and check the expected version against the selected release channel.
- Extend both CI workflows to cover maintenance branches and their PRs.
- Make `publish.yml` validate the branch, version, and npm channel together,
  including the transition from 1.x `latest` to 2.x `latest`. Preserve the global
  Git tags and mark GitHub releases with the appropriate prerelease/latest status.
- Route preview and maintenance docs and Playground builds separately from the
  primary stable site. Publish schemas and advance aliases for the appropriate
  release line; previews and old-major docs must not replace current stable docs.
- Rehearse repeated previews, finalization, and maintenance publication in
  disposable fixtures before enabling the workflow, including checking that a
  backport cannot move npm's `latest` or overwrite the primary site.

The current scripts reject prerelease state and the publisher accepts stable
versions from `master` only. Keep those restrictions until this work is ready.

## Coding Practices

### Language and Typings

Our codebase is primarily JavaScript, utilizing
[JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
for type annotations. The TypeScript language server in VSCode uses the JSDoc
comments for type checking. Before pushing your changes, ensure that your code
is correctly typed and passes the type checking. You can run the type checking with:

```sh
npm -ws --if-present run test:tsc
```

### Code Formatting with Prettier

To ensure code consistency and readability, all contributions must adhere to our
formatting standards, enforced by [Prettier](https://prettier.io/). We recommend
running Prettier before submitting your contributions to avoid
formatting-related revisions. The Prettier
[extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
for VSCode is recommended for automatic formatting.

### Editor Configuration

We provide an `.editorconfig` file to help maintain consistent coding styles for
various editors and IDEs. VSCode users need an
[extension](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
to leverage these settings automatically.

### Ensure High Performance in Hot Paths

GenomeSpy is a high-performance visualization toolkit, and we strive to maintain
this standard in all aspects of the project. When making changes, especially in
hot paths of GenomeSpy's data flow, ensure that the performance is not
compromised. Particularly, avoid creating large numbers of objects in loops, if
the objects are to be discarded soon after.

However, premature optimization is discouraged and code readability is preferred
over unnecessary performance hacks. Instead, use the performance tools provided
by the browser to identify bottlenecks and optimize accordingly.

### Testing

GenomeSpy uses [vitest](https://vitest.dev/) for both unit and integration
testing. While our unit tests are thorough, we recognize a need for stronger
integration testing. Contributions aimed at enhancing our integration test suite
are especially welcome and needed. Tests can be run with:

```sh
npm run test
```

Before a release, smoke-test all curated examples in headless Chromium:

```sh
npm run smoke:examples
```

The check resolves imports, loads data, and waits for rendering to settle. It
does not write screenshots. Network access is required by examples that use
remote data.

### Publishing versioned schemas

The documentation deployment publishes Core and App schemas only for a stable
GitHub release. It writes immutable exact files and updates the matching minor
and major aliases under `https://genomespy.app/schema/`. Manual documentation
deployments and prereleases do not change the public schema tree.
Manual deployments stop before updating the site if the current Core or App
major has no published alias yet.

Before advancing a major alias, the release job validates compatible examples
from the currently deployed documentation against the new schema. A failure
means the schema or specification types must be corrected, or the change must
move to a new major version. The late-v0 corpus is also checked for the first v1
release because that transition is intentionally compatible.

To exercise publication without touching the live site, build both schemas and
run the publisher against a temporary copy or empty directory:

```sh
npm run build:schemas
node scripts/publish-schemas.mjs --site-dir /path/to/site-copy
```

Inspect `schema/core/` and `schema/app/` in that directory. Each contains exact,
minor, and major files plus a manifest that records alias targets. Reusing an
exact version with different content fails, rerunning the same release is
idempotent, and publishing an older release cannot move aliases backward. Core
and App package versions are handled independently.

## How to Contribute

Before making contributions, please familiarize yourself with the following
processes to ensure a smooth and efficient collaboration.

### Setting Up Your Development Environment

Setting up a local development environment is the first step. VSCode is the
recommended IDE for GenomeSpy development, as it provides a seamless development
experience with integrated tools and extensions. However, any IDE that supports
JavaScript and TypeScript can be used.

Use Node.js 24 (as CI does) and npm 10.9 or newer for the development and release
tools.

After installing dependencies, generate the JSON Schemas used for editing
GenomeSpy examples:

```sh
npm ci
npm run build:schemas
```

Open `genome-spy.code-workspace` in VSCode and trust the workspace. Its
committed settings associate Core examples under `examples/core/` and
`examples/docs/` with `packages/core/dist/schema.json`. App examples under
`examples/app/` use `packages/app/dist/schema.json`. You can also regenerate
both schemas with **Tasks: Run Task → Build JSON schemas** from the Command
Palette. No extension is required for JSON Schema support, and your personal
`.vscode/` settings remain separate.

Regenerate the schemas after changing specification types in
`packages/core/src/spec/` or `packages/app/src/spec/`. VSCode normally notices
the changed schema files automatically. If completion or validation remains
stale, run the build task and then use **Developer: Reload Window**.

If VSCode reports that a schema cannot be resolved, check that both
`dist/schema.json` files exist and rerun `npm run build:schemas`. Maintained
examples should not declare `$schema`, because it takes precedence over the
workspace association. Check the example's directory if it receives the App
schema instead of Core, or vice versa.

Other editors can use the same generated schema files. Configure the editor to
associate the Core and App example paths with their respective files, or add an
explicit `$schema` to private specifications. For example, a file directly
under `private/` can use `../packages/core/dist/schema.json` for the current
checkout.

### Debugging

The following entry (with a correct `pathMapping`) in VSCode's `launch.json` can
be used to debug the GenomeSpy app:

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "GenomeSpy App",
  "url": "http://localhost:8080/",
  "sourceMaps": false,
  "webRoot": "${workspaceFolder}/packages/app/src",
  "pathMapping": {
    "/@fs/Users/klavikka/genome-spy/packages/core/src": "${workspaceFolder}/packages/core/src"
  },
  "enableContentValidation": false
}
```

The `enableContentValidation` property is essential, as we don't use source maps
during development. However, vite rewrites the imports, making the content
validation fail.

### Development Server

See the [`README.md`](./README.md) for instructions on how to start the development server.

### Submitting Pull Requests

Prefer submitting changes through pull requests (PRs). Direct maintainer commits
to `master` or `main` follow the same changeset/no-release convention. Please provide a
clear and detailed description of your changes, including the motivation and
context behind them. PRs undergo a review process, and constructive feedback
should be expected and welcomed.

### Documentation

If new features are introduced in your pull request, please also update the
documentation in the [`docs/`](docs/) directory. If the changes alter the
visualization grammar, the typings and their documentation in the
[`packages/core/src/spec/`](packages/core/src/spec/) directory should also be
updated.

The docs build uses a repo-local Python virtual environment managed by `uv`.
From the repo root, run:

```sh
npm run docs:install
npm run docs:serve
```

Use `npm run build:docs` when you want the same one-shot docs build that CI runs.
If CairoSVG cannot find `cairo`, install the native libraries first:
`brew install cairo` on macOS, or
`apt-get install libcairo2-dev libfreetype6-dev libffi-dev libjpeg-dev libpng-dev zlib1g-dev`
on Ubuntu/Debian.

## Community and Communication

We encourage open and respectful communication within our community. If you have
questions, suggestions, or need clarification on any aspect of the project,
please feel free to reach out through GitHub
[discussions](https://github.com/genome-spy/genome-spy/discussions) or
[issues](https://github.com/genome-spy/genome-spy/issues).
