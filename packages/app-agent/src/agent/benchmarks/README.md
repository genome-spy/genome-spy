# Agent Benchmark Runner

This is a minimal standalone benchmark runner for the GenomeSpy agent.

The benchmark lives under `packages/app-agent/src/agent/benchmarks/` so it
stays bundled with the agent module.

It reuses the real browser agent runtime through the existing
`AgentSessionController`. The goal is to keep the first implementation small
and avoid benchmark-only copies of validation, execution, or summary logic.

## Prerequisites

- install workspace dependencies so `playwright` is available
- run an agent server, or let the benchmark point at one you already have

The default agent server URL is `http://127.0.0.1:8000`.

## Common Local Workflow

If you already have the relay server and the GenomeSpy app dev server running in
separate terminals, run the benchmark like this from the repo root:

```bash
node packages/app-agent/src/agent/benchmarks/run.mjs \
  --case-file packages/app-agent/src/agent/benchmarks/cases/fuse-encode.json \
  --interactive \
  --case-mode action \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --quiet-browser-warnings
```

Run a single case the same way by adding `--case-id <id>`, for example:

```bash
node packages/app-agent/src/agent/benchmarks/run.mjs \
  --case-file packages/app-agent/src/agent/benchmarks/cases/fuse-encode.json \
  --case-id fuse-encode.group_by_gender \
  --interactive \
  --case-mode action \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --quiet-browser-warnings
```

Run only description-based cases:

```bash
node packages/app-agent/src/agent/benchmarks/run.mjs \
  --case-file packages/app-agent/src/agent/benchmarks/cases/fuse-encode.json \
  --case-mode description \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --quiet-browser-warnings
```

**Arguments:**

- `--case-file`: benchmark suite JSON file
- `--case-id`: run one case from the suite
- `--case-mode`: run `all`, `action`, or `description` cases
- `--interactive`: show the browser and keep it open
- `--app-url`: use an already running GenomeSpy app server
- `--agent-url`: use an already running relay/agent server
- `--quiet-browser-warnings`: hide browser warnings from CLI output
- `--screenshots`: capture `before.png` and `after.png` for each case
- `--output-dir`: custom artifact output directory
- `--timeout-ms`: per-case timeout in milliseconds

## What The Runner Does

If `--app-url` is omitted, the runner starts `packages/app/dev-server.mjs`
with:

- `VITE_AGENT_BASE_URL=<agent-url>`

For each case, it:

1. loads the requested visualization if it is not already loaded
2. restores visualization defaults and rolls provenance back
3. resets the browser-side agent session
4. sends the prompt through the existing controller
5. writes a JSON result and optional screenshots
6. evaluates the case oracle

## Folder Structure

The benchmark folder is intentionally small:

- `cases/`: local benchmark suite JSON files
- `results/`: generated run artifacts and reports
- `run.mjs`: CLI runner
- `README.md`: usage notes

In practice:

- put visualization-specific prompt suites under `cases/`
- inspect benchmark outputs under `results/`
- keep the runner logic in `run.mjs`

## Input

The main input is a benchmark suite JSON file passed with `--case-file`.

Example:

```text
packages/app-agent/src/agent/benchmarks/cases/fuse-encode.json
```

At a high level, a suite contains:

- shared visualization setup such as `route` and `specPath`
- a `cases` array
- for each case:
  - `id`
  - `prompt`
  - `difficulty`
  - `taskType`
  - `outcomeType`
  - `oracle`

`--case-mode` filters the suite before execution:

- `all`: run every case
- `action`: run state-change and mixed task cases
- `description`: run descriptive/text-answer cases

## Output

Results are written under:

```text
packages/app-agent/src/agent/benchmarks/results/<timestamp>/
```

The local `results/` directory is ignored by git.
The local `cases/` directory is also ignored by git so users can keep
visualization-specific benchmark suites local by default.

Each run writes:

- `suite-result.json`
- one subdirectory per case
- `result.json`

When `--screenshots` is passed, each case directory also includes:

- `before.png`
- `after.png`

## Current Limitations

- the first version is intentionally small
- the starter cases use a public example spec instead of a richer private
  metadata-heavy visualization
- answer checking is deterministic and simple
- state checking currently focuses on fields that are easy to inspect through
  existing app/runtime handles

When adding new cases, prefer extending case data before extending the runner.
