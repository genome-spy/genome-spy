# GenomeSpy Agent Server

This directory contains the thin Python relay that sits between GenomeSpy in
the browser and a model server.

The relay accepts GenomeSpy’s `POST /v1/agent-turn` request, forwards the
assembled prompt to a model server, and normalizes the reply into the shape
GenomeSpy expects.

The model server can be local or remote. Common options are vLLM, Ollama,
LM Studio, and MLX-based servers.

## Quick Start

1. Install `uv`.
2. Sync the relay project.
3. Start a model server.
4. Start the GenomeSpy relay.
5. Point GenomeSpy at the relay.

### Install uv

On macOS and Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Restart your shell so `uv` is on `PATH`.

### Install the relay

From the repo root:

```bash
cd utils/agent_server
uv sync
```

### Relay command

From the repo root:

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:<model-port>/v1
export GENOMESPY_AGENT_API_STYLE=<responses|chat_completions>
export GENOMESPY_AGENT_API_KEY=<api-key-or-placeholder>
export GENOMESPY_AGENT_ENABLE_STREAMING=false

UV_CACHE_DIR=/tmp/uv-cache uv run --project utils/agent_server \
  uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8001 \
  --app-dir utils/agent_server
```

The example intentionally does not use `--reload`. It is not needed for normal
relay use, and in this repo it can trigger aggressive file watching across the
GenomeSpy tree and cause high CPU and battery usage.

### Browser command

From the repo root on the machine running GenomeSpy:

```bash
VITE_AGENT_ENABLED=true \
VITE_AGENT_BASE_URL=http://<relay-host>:8001 \
npm start
```

## Relay Diagram

```text
GenomeSpy browser
  -> GenomeSpy agent relay (/v1/agent-turn)
    -> model server (/v1/responses or /v1/chat/completions)
      -> model
    <- normalized relay response
  <- assistant message in the chat panel
```

## How It Works

- GenomeSpy sends the relay a `message`, `history`, and `context`.
- The relay adds the system prompt and prompt context.
- The relay forwards the turn to the configured model server.
- The relay normalizes the provider response to `answer`, `clarify`, or
  `tool_call`.
- If streaming is enabled, the relay can also forward SSE events.

## Installation

The relay uses `uv`, `FastAPI`, `httpx`, and `pydantic`.

Install `uv` first, then run `uv sync` in `utils/agent_server/`.

Useful checks:

```bash
uv run --project utils/agent_server pytest
uv run --project utils/agent_server ruff check .
uv run --project utils/agent_server mypy app
```

## Transport Selection

- `GENOMESPY_AGENT_API_STYLE=responses` is the preferred and default relay mode.
- Use `GENOMESPY_AGENT_API_STYLE=chat_completions` only for providers that do not support `/v1/responses` or that work more reliably through the legacy compatibility path.
- The relay keeps both transports so local and hosted providers can be compared behind the same `/v1/agent-turn` API.

## Providers

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
export GENOMESPY_AGENT_API_STYLE=chat_completions
export GENOMESPY_AGENT_API_KEY=placeholder
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

#### Optional DGX setup

If you want to run vLLM on a DGX and point a MacBook at it, see
[`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md).

### LM Studio

LM Studio exposes an OpenAI-compatible local server.

Start the local server in the LM Studio app and load a model. The local server
usually listens on port `1234`.

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:1234/v1
export GENOMESPY_AGENT_API_STYLE=responses
export GENOMESPY_AGENT_API_KEY=lm-studio
```

If you want LM Studio to listen on your LAN, enable the local server’s network
access in the LM Studio UI and point the relay at that machine’s IP address.

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
export GENOMESPY_AGENT_API_STYLE=responses
export GENOMESPY_AGENT_API_KEY=omlx
```

If you already use LM Studio models, point `--model-dir` at the same model
directory.

### Ollama

Ollama currently uses the `chat_completions` relay mode.

```bash
ollama serve
ollama pull gemma4:e4b

export GENOMESPY_AGENT_MODEL=gemma4:e4b
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:11434/v1
export GENOMESPY_AGENT_API_STYLE=chat_completions
export GENOMESPY_AGENT_API_KEY=ollama
```

If the first request is slow, keep `GENOMESPY_AGENT_ENABLE_STREAMING=false`
until the setup is stable.

### OpenAI

If you are using OpenAI directly, export the relay variables like this:

```bash
export GENOMESPY_AGENT_MODEL=gpt-4.1-mini
export GENOMESPY_AGENT_BASE_URL=https://api.openai.com/v1
export GENOMESPY_AGENT_API_STYLE=responses
export GENOMESPY_AGENT_API_KEY=$OPENAI_API_KEY
export GENOMESPY_AGENT_ENABLE_STREAMING=false
```

If `OPENAI_API_KEY` is not already set in your shell:

```bash
export OPENAI_API_KEY=<your-openai-api-key>
```

### OpenAI-compatible servers

Use this for local or remote servers that expose an OpenAI-style API.

```bash
export GENOMESPY_AGENT_MODEL=<model-name>
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:<port>/v1
export GENOMESPY_AGENT_API_STYLE=responses
export GENOMESPY_AGENT_API_KEY=<api-key-or-placeholder>
```

## Example Requests

The relay accepts `POST /v1/agent-turn`.

### Minimal payload

```bash
curl -s http://127.0.0.1:8001/v1/agent-turn \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "What is this visualization about?",
    "history": [],
    "context": {
      "schemaVersion": 1
    }
  }'
```

### GenomeSpy-shaped payload

```bash
curl -s http://127.0.0.1:8001/v1/agent-turn \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Summarize the active view in one sentence.",
    "history": [
      {
        "id": "msg_001",
        "role": "user",
        "text": "What is on the screen?"
      }
    ],
    "context": {
      "schemaVersion": 1,
      "sampleSummary": {
        "sampleCount": 2,
        "groupCount": 1
      },
      "actionCatalog": [],
      "toolCatalog": [],
      "attributes": [],
      "viewWorkflows": {
        "workflows": []
      },
      "provenance": [],
      "lifecycle": {
        "appInitialized": true
      },
      "viewRoot": {
        "title": "Example genomic track",
        "type": "view",
        "name": "viewRoot"
      }
    }
  }'
```

If you want SSE output, append `?stream=true` to the relay URL.

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

- `VIRTUAL_ENV=.venv does not match the project environment path`
  - `uv` wants to use the project environment instead of the active one.
  - Fix: add `--active` or let `uv` use the project environment directly.
- `curl http://127.0.0.1:8001/...` from the Mac fails
  - The relay is on the remote host, not the Mac.
  - Fix: use `http://<relay-host-ip>:8001/...` instead.

If you are using DGX + vLLM, see
[`DGX_VLLM_SETUP.md`](./DGX_VLLM_SETUP.md) for the CUDA, Python, GPU, and
vLLM-specific troubleshooting notes.
