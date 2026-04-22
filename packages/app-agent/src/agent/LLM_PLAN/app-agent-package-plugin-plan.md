# App Agent Package and Plugin Plan

This plan describes how to move the browser-side agent code from
`@genome-spy/app` into a new monorepo package, `@genome-spy/app-agent`, and
expose it as an optional App plugin.

The goal is a clean package boundary with a smooth development and embedding
experience. The default App bundle should stay agent-free unless the embedding
page explicitly imports and installs the agent plugin.

## Goals

- Move the browser-side agent implementation into `@genome-spy/app-agent`.
- Move the Python relay into the same agent ownership area so the future
  separate repository contains the browser plugin and the server it speaks to.
- Keep `@genome-spy/app` responsible for the app shell, provenance, intent
  pipeline, `SampleView`, and the app-owned `AgentApi`.
- Let users enable the agent by importing and installing a plugin.
- Keep API keys and model-provider details out of the browser by continuing to
  route browser requests through the Python relay.
- Preserve fast local development for app, agent, and relay changes.
- Avoid a broad public extension framework while the agent API is still moving.

## Non-Goals

- Do not expose arbitrary App internals to plugins.
- Do not design a general plugin marketplace or plugin discovery system.
- Do not make the agent enabled by environment variables in the default App
  bundle.
- Do not split the agent into a separate repository in the first monorepo
  migration. The package layout should make that later move straightforward.
- Do not publish the Python relay as part of the browser npm package artifact.
  It may live under the same monorepo package directory, but its Python
  packaging and runtime stay separate from the browser bundle.

## Target Packages

### `@genome-spy/app`

Owns the host application.

- `App`
- `embed`
- toolbar and app-shell UI host
- provenance and intent execution
- `AgentApi`
- thin `agentShared` exports for pure helpers and type re-exports
- plugin installation lifecycle

The App package should not import browser agent runtime modules.

### `@genome-spy/app-agent`

Owns the optional browser plugin and the Python relay service.

- agent plugin entry point
- agent state
- agent adapter and relay transport
- chat panel
- session controller
- context builders
- tool and action catalogs
- generated agent schemas and catalog artifacts
- toolbar registration and panel wiring
- agent-local tests, stories, and generation scripts
- Python relay source, tests, lockfile, and server documentation

The package may depend on `@genome-spy/app` through public exports only.

The long-term target is that `@genome-spy/app-agent` can move to a separate
repository with both browser and server code intact.

### Python relay

Moves from `utils/agent_server` into the app-agent ownership area, likely under
`packages/app-agent/server`.

- receives `/v1/agent-turn` from the browser plugin
- adds system prompts and provider configuration
- calls OpenAI-compatible model backends
- normalizes responses and streaming events
- remains a separate Python project with its own `pyproject.toml` and lockfile
- is not bundled into the browser plugin build

## Plugin API

Add a minimal plugin contract to `@genome-spy/app`.

```ts
export interface AppPlugin {
    name?: string;
    install(
        host: AppPluginHost
    ): void | (() => void) | Promise<void | (() => void)>;
}

export interface AppPluginHost {
    readonly ui: AppUiHost;
    getAgentApi(): Promise<AgentApi>;
}
```

Use `App` itself as the initial host object if it already provides this narrow surface.
Keep the type narrow so plugin code does not depend on unrelated App internals.

Add `plugins?: AppPlugin[]` to `AppEmbedOptions`.

Install plugins in `embed()` after constructing `App` and before `app.launch()`.
Store disposer callbacks and call them from the embed handle's `finalize()`.

```js
const app = new App(element, specObject, embedOptions);
const pluginDisposers = await installAppPlugins(app, embedOptions.plugins ?? []);
await app.launch();
```

The plugin installer should fail fast when a plugin throws during setup. A
plugin failure means the embedding page has explicitly opted into that plugin,
so silent fallback would make debugging harder.

## App Shell Hooks

The existing toolbar extension hooks can stay on `app.ui`.

```ts
interface AppUiHost {
    registerToolbarButton(button: ToolbarButtonSpec): () => void;
    registerToolbarMenuItem(item: MenuItem): () => void;
    registerDockedPanel?(panel: HTMLElement): () => void;
}
```

Use the docked-panel hook for the chat panel so the plugin does not need direct
access to the app container. The plugin can style the element before
registration.

## User Experience

Users enable the agent by importing `@genome-spy/app-agent` and adding it to
`plugins`.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>GenomeSpy</title>
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.jsdelivr.net/npm/@genome-spy/app@0.76.0/dist/style.css"
    />
  </head>
  <body>
    <script type="module">
      import { embed } from "https://cdn.jsdelivr.net/npm/@genome-spy/app@0.76.0/dist/index.es.js";
      import { appAgent } from "https://cdn.jsdelivr.net/npm/@genome-spy/app-agent@0.76.0/dist/index.es.js";

      await embed(document.body, "spec.json", {
        showInspectorButton: true,
        plugins: [
          appAgent({
            baseUrl: "http://127.0.0.1:8001",
          }),
        ],
      });
    </script>
  </body>
</html>
```

Expected behavior:

- Without the plugin import, the App has no agent code or agent UI.
- With the plugin installed, the toolbar shows the agent chat button.
- The chat panel preflights the configured relay.
- If the relay is unavailable, the panel shows a clear unavailable state.
- Browser requests go to the relay, not directly to the model provider.

For published App usage, the plugin import is the feature gate. The App package
does not need to include agent code unless the embedding page imports
`@genome-spy/app-agent`.

For local development with `packages/app/dev-server.mjs`, use the relay base URL
to opt into the plugin from the dev entry point.

## Developer Experience

Create a package directory:

```text
packages/app-agent/
  package.json
  vite.config.js
  tsconfig.json
  src/
    index.js
    plugin.js
    agentAdapter.js
    agentState.js
    chatPanel.js
    ...
  scripts/
    generateAgentActionCatalog.mjs
    generateAgentToolCatalog.mjs
    ...
  server/
    pyproject.toml
    uv.lock
    app/
    tests/
    README.md
```

The package entry point should expose a plugin factory:

```js
export function appAgent(options) {
    return {
        name: "@genome-spy/app-agent",
        async install(app) {
            const agentApi = await app.getAgentApi();
            const agentState = getAgentState(app);

            agentState.baseUrl = options.baseUrl;
            agentState.agentAdapter = createAgentAdapter(agentApi, options);

            return registerAgentUi(app, agentState, options);
        },
    };
}
```

The plugin should accept options such as:

```ts
export interface AppAgentOptions {
    baseUrl: string;
    devTools?: boolean;
    title?: string;
}
```

`baseUrl` should be required. A missing `baseUrl` is a configuration error for
the plugin factory, not a reason to install a disabled plugin.

### Local Dev Loop

Run the App dev server with the relay URL:

```bash
VITE_AGENT_BASE_URL=http://127.0.0.1:8001 \
npm start
```

Run the relay:

```bash
UV_CACHE_DIR=/tmp/uv-cache uv run --project packages/app-agent/server \
  uvicorn app.main:app \
  --host 127.0.0.1 \
  --port 8001 \
  --app-dir packages/app-agent/server
```

The App dev entry point should import the plugin only when the relay base URL is
provided:

```js
const plugins = [];

if (import.meta.env.VITE_AGENT_BASE_URL) {
    const { appAgent } = await import("@genome-spy/app-agent");
    plugins.push(
        appAgent({
            baseUrl: import.meta.env.VITE_AGENT_BASE_URL,
            devTools: true,
        })
    );
}

await embed(document.body, specUrl, { plugins });
```

This keeps the regular dev URL unchanged. The spec still comes from the
existing `spec` query parameter used by `singlePageApp.js`; the agent plugin
only loads when a relay base URL is configured.

Development should not use a prebuilt or bundled app-agent artifact. The app
dev server should resolve `@genome-spy/app-agent` to workspace source so changes
in the new package update without rebuilding published artifacts. Use a Vite
alias or source export if needed:

```js
resolve: {
    alias: {
        "@genome-spy/app-agent": fileURLToPath(
            new URL("../app-agent/src/index.js", import.meta.url)
        ),
    },
},
optimizeDeps: {
    exclude: ["@genome-spy/app-agent"],
},
```

The exact mechanism can be adjusted once the package exists, but the invariant
is that `npm start` serves app-agent source modules during development.

## Build and Publishing

`@genome-spy/app-agent` should publish a browser-loadable ESM build.
The Python relay should live in the same package directory, but outside the npm
`files` payload unless the publish strategy intentionally includes server
sources.

Important constraints:

- The CDN example should work without import maps.
- Shared dependencies that are not expected to be globally available should be
  bundled into the plugin build.
- `@genome-spy/app` should remain a peer dependency to avoid bundling a second
  App copy.
- The browser package must not bundle Python relay files into `dist`.
- The relay should remain runnable with `uv run --project
  packages/app-agent/server`.
- Keep versions aligned with the monorepo release version.

Initial package metadata:

```json
{
  "name": "@genome-spy/app-agent",
  "version": "0.76.0",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.es.js",
  "exports": {
    ".": {
      "import": "./dist/index.es.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist/"],
  "peerDependencies": {
    "@genome-spy/app": "^0.76.0"
  }
}
```

Generation scripts should move from `packages/app/scripts` to
`packages/app-agent/scripts`. Generated agent artifacts should move with the
agent source.

## Migration Plan

1. [x] Add `plugins?: AppPlugin[]` to `@genome-spy/app` embed options.
2. [x] Add plugin installation and disposal to `embed()`.
3. [x] Add a minimal App plugin host type and tests.
4. [x] Move `agentEmbedRuntime.js` logic into a new plugin factory in
   `packages/app-agent/src/plugin.js`.
5. [x] Remove the static `setupAgentRuntime` import from `@genome-spy/app`.
6. [x] Move browser agent source files from `packages/app/src/agent` to
   `packages/app-agent/src`.
7. [x] Move agent generation scripts and generated artifacts to `packages/app-agent`.
8. [ ] Update imports so the extracted package uses public `@genome-spy/app` exports
   and public `@genome-spy/core` exports only.
9. [x] Move or replace app-local agent tests with package-local tests.
10. [ ] Move `utils/agent_server` to `packages/app-agent/server`.
11. [ ] Update relay commands, README paths, and any benchmark/dev tooling that
    references `utils/agent_server`.
12. [x] Update `singlePageApp.js` or a dev-only entry point to install
    `appAgent({ baseUrl })` from Vite env variables.
13. [ ] Update relay README examples to use the plugin import.
14. [x] Remove `agentBaseUrl` from `@genome-spy/app` embed options after the plugin
    path is working.

## Testing

Add focused coverage for:

- plugin install calls `app.getAgentApi()`
- plugin registers and disposes toolbar controls
- embed `finalize()` disposes plugins
- plugin does not load unless imported by the embedding page
- missing or invalid relay URL fails with a clear error
- existing agent adapter tests still pass after import-path updates
- generated agent catalogs and schemas stay in sync
- `packages/app/dev-server.mjs` can install the workspace-source plugin through
  `VITE_AGENT_BASE_URL`

Run before finishing the extraction:

```bash
npm -w @genome-spy/app run test:tsc
npm -w @genome-spy/app-agent run test:tsc
npx vitest run packages/app/src/index*.test.js packages/app-agent/src
uv run --project packages/app-agent/server pytest
```

Run the full suite before publishing:

```bash
npm test
npm --workspaces run test:tsc --if-present
npm run lint
```

## Open Questions

- Should `registerDockedPanel()` be added before or after the package move?
- Should `agentShared` remain under `@genome-spy/app`, or should a later
  `@genome-spy/app-agent-shared` package exist for MCP reuse?
- Should the plugin expose a public chat controller API for custom embedding,
  or only the toolbar panel for now?
- Should dev tools be enabled by `appAgent({ devTools: true })`, by
  `import.meta.env.DEV`, or both?
- Should the relay be published as a Python package from the future separate
  app-agent repo, or stay source-installed with `uv`?
- Should the npm package include relay source files for convenience, or should
  npm publish only the browser plugin?

## Acceptance Criteria

- `@genome-spy/app` builds without importing browser agent runtime modules.
- `@genome-spy/app-agent` can be imported from npm/CDN and installed through
  `plugins`.
- The default user template remains unchanged for users who do not want the
  agent.
- The agent-enabled template requires only one additional import and one plugin
  entry.
- The existing chat, context, tool execution, and intent execution flows work
  through the extracted package.
- `npm start` serves `@genome-spy/app-agent` from workspace source during
  development, without requiring an app-agent build.
- The Python relay lives under `packages/app-agent/server` and still passes its
  pytest suite.
- Local development works with `npm start` plus the app-agent relay.
