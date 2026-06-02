# DGX Remote Development Workflow

This guide covers how to use a DGX-hosted vLLM server from another machine
while keeping the GenomeSpy relay and the GenomeSpy app local.

It assumes the DGX-side model server is already running. For that setup, start
with [`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md).

## Goal

Use the DGX only for model inference while continuing local development on your
laptop or workstation.

The workflow is:

1. SSH into the DGX
2. start `vllm serve` on the DGX
3. connect from your local machine over SSH
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
  - optionally uses SSH port forwarding so the relay can talk to remote vLLM
    through `127.0.0.1`

## Request Flow

```text
local browser
  -> local GenomeSpy app
    -> local GenomeSpy relay (/v1/agent-turn)
      -> DGX vLLM (/v1/responses via SSH tunnel or direct host access)
        -> model
      <- vLLM response
    <- normalized relay response
  <- rendered answer in the chat panel
```

## Connect From Another Machine

The cleanest development flow is to keep the relay config local and forward the
DGX vLLM port over SSH.

### Recommended: SSH local port forwarding

From your local machine:

```bash
ssh -L 8000:127.0.0.1:8000 <user>@<dgx-host>
```

Leave that SSH session open while you work.

With this tunnel in place, your local machine can use:

```text
http://127.0.0.1:8000/v1
```

even though the model is actually running on the DGX.

### Alternative: direct network access

If your DGX and laptop are on the same network and the DGX firewall policy
allows it, you can point the relay directly at:

```text
http://<dgx-ip>:8000/v1
```

For routine development, the SSH tunnel is simpler and keeps the local relay
config stable.

## Run the Relay Locally

On your local development machine, from the GenomeSpy repo root:

```bash
export GENOMESPY_AGENT_PREFER_RESPONSES_ROLE_COMPAT=true
export GENOMESPY_AGENT_MODEL=Qwen3.6-35B-A3B
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:8000/v1
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

- `GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:8000/v1` assumes you are using the
  SSH tunnel above.
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

## End-to-End Checklist

1. SSH into the DGX.
2. Start `vllm serve` on the DGX.
3. On your local machine, open an SSH tunnel:
   ```bash
   ssh -L 8000:127.0.0.1:8000 <user>@<dgx-host>
   ```
4. Start the local relay on port `8001`.
5. Start the local GenomeSpy app with `VITE_AGENT_BASE_URL=http://127.0.0.1:8001`.
6. Open the app in the browser and run the agent workflow.

## Troubleshooting

- `curl http://127.0.0.1:8000/v1/models` fails on the local machine
  - The SSH tunnel is not running, or the DGX server is not listening yet.
  - Fix: verify `vllm serve` on the DGX first, then recreate the SSH tunnel.

- Relay can start, but model turns fail immediately
  - The relay is pointed at the wrong base URL.
  - Fix: confirm `GENOMESPY_AGENT_BASE_URL` matches either the SSH tunnel
    target or the DGX host IP exactly.

- Browser can load GenomeSpy, but agent requests fail
  - The app is not pointing at the local relay.
  - Fix: confirm `VITE_AGENT_BASE_URL=http://127.0.0.1:8001`.
