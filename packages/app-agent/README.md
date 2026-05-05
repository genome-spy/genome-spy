# GenomeSpy App Agent

`@genome-spy/app-agent` contains an experimental browser-side AI agent plugin
for GenomeSpy App. It provides the chat panel, agent UI wiring, and browser-side
state machine, and exposes selected tools and Redux-backed actions that let the
agent LLM inspect and update the current visualization.

This package is private for now and is not published to npm.

## Enable It In App Dev

In app development, `packages/app/src/singlePageApp.js` uses the app dev server
entry point to load the agent plugin only when `VITE_AGENT_BASE_URL` is set.
Point it at the Python relay, then start the app dev server:

```bash
VITE_AGENT_BASE_URL=http://127.0.0.1:8001 npm start
```

The relay lives in [`server/`](./server/). See
[`server/README.md`](./server/README.md) for relay startup commands and
environment variables.

## Use As App Plugin

Outside the app dev server, the agent is enabled by importing the ESM plugin and
passing it to App through `plugins`. The App package does not need to include
agent code unless the embedding page imports `@genome-spy/app-agent`.

This package is currently private, so the `app-agent` import below uses a
placeholder URL. Once the package is published or otherwise hosted as ESM, point
the import at that bundle.

```html
<script type="module">
  import { embed } from "https://cdn.jsdelivr.net/npm/@genome-spy/app@0.75.0/dist/index.es.js";
  import { appAgent } from "https://example.test/@genome-spy/app-agent/dist/index.es.js";

  await embed(document.body, "spec.json", {
    showInspectorButton: true,
    plugins: [
      appAgent({
        baseUrl: "http://127.0.0.1:8001",
      }),
    ],
  });
</script>
```

With the plugin installed, the toolbar shows the agent chat button. The chat
panel preflights the configured relay and sends browser requests to the relay,
not directly to the model provider. Without the plugin import, App has no agent
UI.

## Package Scripts

- `npm run storybook` to develop the chat panel UI in Storybook
- `npm run test` for the package test suite
- `npm run build` to produce the bundled browser package

## Boundary Notes

- Keep shared logic behind public app exports.
- Do not duplicate app-owned code or types unless there is no practical
  alternative.
- Expand the public app surface deliberately when the agent needs a new hook.
