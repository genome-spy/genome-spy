# GenomeSpy

GenomeSpy is a high-performance, browser-based visual analytics toolkit for
genomic data. The monorepo contains the WebGL-based declarative visualization
core, the Lit/Redux cohort-analysis application, integrations and examples, and
an early browser-side LLM agent with a thin Python relay.

## Instruction and architecture routing

- Before editing a package, read the nearest descendant `AGENTS.md` files for
  the target paths. Codex sessions started at the repository root do not load
  descendant instructions automatically.
- Start architectural work at `ARCHITECTURE.md`, then read only the linked
  subsystem documents relevant to the change.
- Repository workflows live in `.agents/skills/` and should be used when their
  descriptions match the task.

## Project map and stack

- `packages/core`: ESNext JavaScript with JSDoc, TypeScript specification types,
  JSON Schema generation, WebGL2, and twgl.js. State lives primarily in the view
  hierarchy; data flows through `FlowNode`s; scales are coordinated by
  `ScaleResolution`; reactive parameters use `ViewParamRuntime`/`ParamRuntime`.
  Its declarative grammar is strongly inspired by Vega and Vega-Lite.
- `packages/app`: GenomeSpy Core embedded in a Lit UI, with Redux Toolkit and
  provenance-aware interactions. Use FontAwesome and the project's own CSS;
  there is no external CSS framework or component library.
- `packages/app-agent`: Browser-side agent plugin and chat UI. Its Python relay
  is under `packages/app-agent/server/`.
- The monorepo is managed with lerna-lite.

## Workflow expectations

- Before non-trivial edits, make a brief working plan. Use the
  `plan-genomespy-change` skill for requested design or implementation
  proposals; routine edits do not need a formal plan file. Do not infer
  permission to edit from a question or review request.
- Consider `docs/` for user-visible Core or App features. Refactors usually do
  not require documentation changes.
- For refactors and simplification, measure relevant size before and after with
  `wc -l`, `git diff --stat`, or focused counts. Added code is a signal to
  re-check whether the result is actually simpler; accept growth only when it
  clearly improves correctness, readability, or maintainability.
- Prefer deleting duplicate paths and simplifying control flow over introducing
  abstractions. Do not replace straightforward code with a larger structure
  without a clear tradeoff.
- When editing shared example specs under `examples/`, follow
  `examples/README.md`.

## Testing

- Use Vitest for JavaScript/TypeScript tests and keep `.test.` files next to the
  code they cover. Add a short comment for non-obvious setup or intent.
- Do not use TDD for trivial copy or presentation-only changes. Apply the small
  edit directly and use the lightest relevant verification.
- Permanent tests should verify behavior, contracts, dataflow, layout semantics,
  or user-visible output rather than repeat the implementation.
- Prefer representative assertions. Exhaustive configuration or generated-shape
  assertions are appropriate only when the full shape is an intentional
  compatibility contract.
- Temporary implementation-detail tests are acceptable while debugging, but
  delete or rewrite them before finishing. After refactors, remove tests for
  temporary compatibility paths unless the behavior remains a public contract.
- During iteration, run the narrowest relevant suite and use Vitest's `agent`
  reporter to keep successful output compact. Run the full suite only when the
  scope or risk warrants it.
- Use the `test-genomespy-views` skill for generated specs, layout snapshots,
  or rendered hierarchy inspection.

Common checks from the repository root:

- Focused suite: `npx vitest run <test-file> --reporter=agent`
- Full unit suite: `npm test -- --reporter=agent`
- Workspace TypeScript checks: `npm --workspaces run test:tsc --if-present`
- Lint: `npm run lint`

## Project and code guidelines

- Use type hints in every language that supports them. JavaScript and TypeScript
  use JSDoc annotations.
- Class members without a clear initializer need an explicit JSDoc type; members
  with a clear initializer may rely on inference. Put a blank line between
  adjacent JSDoc-annotated members, except before the first member in a block.
- When removing a function or class, remove its JSDoc block too.
- Formatting is defined by `.editorconfig` and Prettier: JavaScript and WGSL use
  four spaces, JSON uses two, and indentation uses spaces rather than tabs.
- Use blank lines to separate logical blocks within functions, such as setup,
  validation, computation, subscription wiring, and publication. Keep closely
  related statements together; do not rely on comments alone to structure dense code.
- Use modern ESNext syntax. Prefer `const` unless reassignment is necessary and
  use `Array.from` instead of spread when converting a `NodeList` to an array.
- Prefer offensive over defensive code: rely on types, validate at boundaries,
  fail fast on unexpected input, and avoid unnecessary null checks, optional
  chaining, and silent fallbacks.
- Before adding recovery, rollback, retries, or reentrancy support, identify the
  supported caller or user-visible requirement that needs it. A hypothetical
  failure or a test introduced with the machinery is not sufficient justification.
  Prefer rejecting unsupported operations at a clear boundary over supporting
  arbitrary partial states. Preserve cleanup and handling of expected lifecycle
  events such as loading, cancellation, and disposal.
- Prefer an explicit `else` when both branches are similarly likely. Branches on
  enums must cover every case and fail loudly on unknown values.
- Prefer explicit contracts over implicit behavior, such as requiring domains
  for ordinal and band scales.
- Use readable concatenation for two simple string parts and template literals
  when combining more than two elements.
- Avoid optional or nullable state unless it has clear semantics.
- Use JSDoc to record non-obvious intent. Keep one source of truth and derive
  secondary views through helpers.
- Use `Map` or `WeakMap` when identity matters; prefer an empty map over an
  optional map.
- Classes use `PascalCase`, files use `camelCase`, and related types share a
  naming stem.
- Prefer iterator helpers such as `map`, `filter`, and `flatMap` directly on
  iterables instead of converting them to arrays first.

## Documentation and change delivery

- Use the `write-genomespy-docs` skill for user-facing docs, specification JSDoc,
  schema macros, or docs builds.
- Use the `plan-genomespy-change` skill for architecture or implementation
  proposals.
- Use the `debug-genomespy-web` skill for browser reproduction and UI smoke
  testing.
- For GitHub reads and writes, including PRs, reviews, comments, and issues,
  prefer the connected GitHub MCP tools. Use the `gh` CLI only when the
  connector does not support the required operation or context.
- For agent-authored or materially rewritten GitHub issue or PR bodies, reviews,
  and comments, append
  `_Posted by <agent name> (AI agent) at the user's request._`, replacing
  `<agent name>` with the actual agent identity, such as `Codex` or `Claude`.
  Do not append attribution to issue or PR titles. Omit the footer only when
  posting the user's wording verbatim, and never present agent-authored text as
  if the user wrote it.
- Before creating a PR or merging, reconcile every incomplete task in relevant
  `plans/` files by completing it or marking it discarded, commit that record,
  and delete the plan files in a later commit. Never merge temporary plan files.
- Commits use Conventional Commits. The complete header and every body/footer
  line must be at most 100 characters. Include a brief body by default, focused
  on the rationale for the change; omit it only for genuinely trivial commits.
  Reserve `docs` for user-facing documentation that belongs in changelogs. Use
  `chore` for internal documentation such as agent instructions and architecture
  maintenance.
  Use the `prepare-genomespy-change` skill when writing commits, commit messages,
  PR titles, or PR notes.
