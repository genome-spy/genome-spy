# GenomeSpy Agent Server

This directory contains a thin Python relay server that sits between GenomeSpy in
the browser and a model server.

The model server can be local or remote. Common local options are vLLM, Ollama,
LM Studio, and MLX-based servers. For remote providers, we have been using OpenAI.

## How It Works

- GenomeSpy sends the relay a `message`, `history`, and `context`.
- The relay adds the system prompt and prompt context.
- The relay forwards the turn to the configured model server.
- The relay normalizes the provider response to `answer`, `clarify`, or
  `tool_call`.
- If streaming is enabled, the relay can also forward SSE events.

**Diagram**
```text
GenomeSpy browser
  -> GenomeSpy agent relay (/v1/agent-turn)
    -> model server (/v1/responses)
      -> model
    <- normalized relay response
  <- assistant message in the chat panel
```

### Installation

The assumption is that GenomeSpy is already installed.

**First install uv**

On macOS and Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Restart your shell so `uv` is on `PATH`.

**Then install the relay server**

From the repo root:

```bash
cd utils/agent_server
uv sync
```

### Quick Start With OpenAI

From the repo root:

**Set env variables**
```bash
export OPENAI_API_KEY=<your-openai-api-key>
export GENOMESPY_AGENT_MODEL=gpt-5.4-mini
export GENOMESPY_AGENT_BASE_URL=https://api.openai.com/v1
export GENOMESPY_AGENT_API_KEY=$OPENAI_API_KEY
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

**Launch the python relay server**
```bash
UV_CACHE_DIR=/tmp/uv-cache uv run --project utils/agent_server \
  uvicorn app.main:app \
  --host 127.0.0.1 \
  --port 8001 \
  --app-dir utils/agent_server
```

**Set VITE configs to point to the relay server and start the GenomeSpy server**
```bash
VITE_AGENT_ENABLED=true \
VITE_AGENT_BASE_URL=http://127.0.0.1:8001 \
npm start
```

This is the easiest setup because it does not require a separate local model server. You just need to have some API-tokens on your OAI account.

## Local Model Servers

### Ollama

The current relay path expects a Responses API-compatible server.

```bash
ollama serve
ollama pull gemma4:e4b

export GENOMESPY_AGENT_MODEL=gemma4:e4b
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:11434/v1
export GENOMESPY_AGENT_API_KEY=ollama
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

If the first request is slow, keep `GENOMESPY_AGENT_ENABLE_STREAMING=false`
until the setup is stable.

### LM Studio

LM Studio exposes an OpenAI-compatible local server.

Start the local server in the LM Studio app and load a model. The local server
usually listens on port `1234`.

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:1234/v1
export GENOMESPY_AGENT_API_KEY=lm-studio
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

If you want LM Studio to listen on your LAN, enable the local server's network
access in the LM Studio UI and point the relay at that machine's IP address.

### vLLM

vLLM exposes an OpenAI-compatible API. Start it with:

```bash
vllm serve <model-or-path> \
  --host 127.0.0.1 \
  --port 8000 \
  --api-key placeholder \
  --max-model-len 262144 \
  --quantization moe_wna16 \
  --gpu-memory-utilization 0.80
```

Then point the relay at it:

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:8000/v1
export GENOMESPY_AGENT_API_KEY=placeholder
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

#### Optional DGX setup

If you want to run vLLM on a DGX and point a MacBook at it, see
[`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md).

### oMLX

oMLX is the Mac-native MLX server. It is a good fit when you want local
inference on Apple Silicon.

Install and start it with:

```bash
git clone https://github.com/jundot/omlx
cd omlx
pip install -e .
omlx serve --model-dir ~/models
```

oMLX exposes an OpenAI-compatible API on `http://127.0.0.1:8000/v1`.

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:8000/v1
export GENOMESPY_AGENT_API_KEY=omlx
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

If you already use LM Studio models, point `--model-dir` at the same model
directory.


## Use From Another Machine

If the relay runs on another machine:

1. Find the relay host IP:
   ```bash
   hostname -I
   ```
2. Start GenomeSpy on your MacBook or other laptop:
   ```bash
   VITE_AGENT_ENABLED=true \
   VITE_AGENT_BASE_URL=http://<relay-host-ip>:8001 \
   npm start
   ```
3. Keep the browser local and point it at the relay, not the model server.

## Troubleshooting

- Relay starts but the browser cannot connect
  - Check that `VITE_AGENT_BASE_URL` points to the relay.
  - For local development, it should usually be `http://127.0.0.1:8001`.
- Relay and browser use different ports
  - The port in `VITE_AGENT_BASE_URL` must match `uvicorn --port`.
  - Example: if `uvicorn` uses `--port 8001`, then
    `VITE_AGENT_BASE_URL` must use `:8001`.
- Relay startup fails with `KeyError: 'GENOMESPY_AGENT_MODEL'`
  - `GENOMESPY_AGENT_MODEL` is required.
  - Fix: export it before starting `uvicorn`.
- `VIRTUAL_ENV=.venv does not match the project environment path`
  - `uv` wants to use the project environment instead of the active one.
  - Fix: add `--active` or let `uv` use the project environment directly.
- `curl http://127.0.0.1:8001/...` from the Mac fails
  - The relay is on the remote host, not the Mac.
  - Fix: use `http://<relay-host-ip>:8001/...` instead.

If you are using DGX + vLLM, see
[`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md) for the CUDA, Python, GPU, and
vLLM-specific troubleshooting notes.
