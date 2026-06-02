# DGX Remote Development Workflow

This guide covers how to use a DGX-hosted vLLM server from another machine
while keeping the GenomeSpy relay and the GenomeSpy app local.

It assumes the DGX-side model server is already running. For that setup, start
with [`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md).

This version of the workflow assumes the DGX and the local development machine
are on the same network. It uses direct network access from the local relay to
the DGX-hosted vLLM server.

## Goal

Use the DGX only for model inference while continuing local development on your
laptop or workstation.

The workflow is:

1. SSH into the DGX
2. start `vllm serve` on the DGX
3. find the DGX IP address on the shared network
4. run the GenomeSpy relay locally
5. run the GenomeSpy app locally
6. send agent traffic through the local relay to the DGX-hosted model

## Recommended Topology

- DGX
  - runs `vllm serve`
  - stores the model checkpoints locally
- local development machine
  - runs the GenomeSpy app dev server
  - runs the GenomeSpy relay server
  - connects to the DGX vLLM server over the shared network

## Request Flow

```text
local browser
  -> local GenomeSpy app
    -> local GenomeSpy relay (/v1/agent-turn)
      -> DGX vLLM (/v1/responses over the local network)
        -> model
      <- vLLM response
    <- normalized relay response
  <- rendered answer in the chat panel
```

## Confirm DGX Network Access

SSH into the DGX:

```bash
ssh <user>@<dgx-host>
```

Find the DGX IP address on the shared network:

```bash
hostname -I
```

Choose the LAN address that is reachable from the local machine. In our
same-network setup, this is typically a private-network IPv4 address such as
`192.168.1.50` or `10.0.0.25`.

Confirm that vLLM is reachable on the DGX itself:

```bash
curl -s http://127.0.0.1:8000/v1/models
```

Then confirm that the local machine can reach the same server directly:

```bash
curl -s http://<dgx-ip>:8000/v1/models
```

This workflow assumes `vllm serve` is listening on the network, for example
with `--host 0.0.0.0`.

## Run the Relay Locally

On your local development machine, from the GenomeSpy repo root:

```bash
export GENOMESPY_AGENT_PREFER_RESPONSES_ROLE_COMPAT=true
export GENOMESPY_AGENT_MODEL=Qwen3.6-35B-A3B
export GENOMESPY_AGENT_BASE_URL=http://<dgx-ip>:8000/v1
export GENOMESPY_AGENT_API_KEY=placeholder
export GENOMESPY_AGENT_ENABLE_STREAMING=true
export GENOMESPY_AGENT_TIMEOUT_SECONDS=180

UV_CACHE_DIR=/tmp/uv-cache uv run --project packages/app-agent/server \
  python -m uvicorn app.main:app \
  --host 127.0.0.1 \
  --port 8001 \
  --app-dir packages/app-agent/server
```

Notes:

- `GENOMESPY_AGENT_MODEL` must match the model ID exposed by
  `http://<dgx-ip>:8000/v1/models`.
- `GENOMESPY_AGENT_BASE_URL=http://<dgx-ip>:8000/v1` points directly at the DGX
  over the shared network.
- `GENOMESPY_AGENT_PREFER_RESPONSES_ROLE_COMPAT=true` has been useful for some
  OpenAI-compatible servers that are stricter about message roles.
- `GENOMESPY_AGENT_ENABLE_STREAMING=true` matches the current DGX workflow.
- `GENOMESPY_AGENT_TIMEOUT_SECONDS=180` has been a safer local default for
  longer model turns.

## Run GenomeSpy Locally

Also on your local machine:

```bash
VITE_AGENT_BASE_URL=http://127.0.0.1:8001 npm start
```

This keeps the browser and app dev server local while only the model inference
is remote.

## Verify the Local Relay

From the local machine:

```bash
curl -s http://127.0.0.1:8001/health
curl -s http://127.0.0.1:8001/v1/server-info
```

The `server-info` response should show:

- `model` set to the DGX-served model ID
- `base_url` set to `http://<dgx-ip>:8000/v1`
- `streamingEnabled` set to `true`

## Use the Visualization

Open the local app in the browser:

```text
http://127.0.0.1:8080/
```

The app stays local on the development machine. The agent chat sends requests
to the local relay at `127.0.0.1:8001`, and the relay forwards model traffic to
the DGX.

Once the app is open, use the normal agent chat workflow:

- open a visualization from the example or private routes
- open the agent panel
- send prompts through the local relay
- inspect relay logs locally if a model turn fails

This keeps all UI development local while using the DGX only for inference.

## Run Benchmarks

With the local relay on `8001` and the local app on `8080`, run the benchmark
runner from the repo root:

```bash
node packages/app-agent/benchmarks/run.mjs \
  --case-file packages/app-agent/benchmarks/cases/genomespy-paper-2024.json \
  --interactive \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8001 \
  --quiet-browser-warnings
```

Use `--case-id <id>` to run one case and `--repeats <n>` to repeat selected
cases.

## End-to-End Checklist

1. SSH into the DGX.
2. Confirm the DGX IP address on the shared network.
3. Confirm `curl http://<dgx-ip>:8000/v1/models` works from the local machine.
4. Start the local relay on port `8001`.
5. Start the local GenomeSpy app with
   `VITE_AGENT_BASE_URL=http://127.0.0.1:8001`.
6. Open `http://127.0.0.1:8080/` in the browser.
7. Run agent prompts or benchmarks from the local machine.
