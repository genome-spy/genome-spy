# GenomeSpy App Agent

`@genome-spy/app-agent` contains the browser-side agent plugin for GenomeSpy
App. It provides the chat panel, agent UI wiring, tool execution, and the
browser-side state machine used by the agent experience.

This package is private for now and is not published to npm.

## Enable It In App Dev

The app only loads the agent plugin when `VITE_AGENT_BASE_URL` is set. Point
it at the Python relay, then start the app dev server:

```bash
VITE_AGENT_BASE_URL=http://127.0.0.1:8001 npm start
```

The relay lives in [`server/`](./server/). See
[`server/README.md`](./server/README.md) for relay startup commands and
environment variables.

## Package Scripts

- `npm run storybook` to develop the chat panel UI in Storybook
- `npm run test` for the package test suite
- `npm run build` to produce the bundled browser package

## Boundary Notes

- Keep shared logic behind public app exports.
- Do not duplicate app-owned code or types unless there is no practical
  alternative.
- Expand the public app surface deliberately when the agent needs a new hook.
