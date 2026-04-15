# DGX vLLM Setup

This guide covers the optional DGX-specific path for running GenomeSpy with a
remote model server on a DGX machine.

The setup has two servers on the DGX:

- `vllm serve` runs the model and exposes an OpenAI-compatible chat API.
- `uvicorn` runs the GenomeSpy agent relay and exposes `/v1/agent-turn`.

GenomeSpy in the browser talks to the relay, not directly to vLLM.

## System Overview

- MacBook
  - runs GenomeSpy in the browser
  - sends agent requests to the DGX relay
- DGX relay
  - accepts GenomeSpy’s `/v1/agent-turn` request shape
  - builds the prompt
  - forwards it to vLLM
  - normalizes the response back into GenomeSpy’s shape
- DGX vLLM server
  - runs the model
  - exposes `/v1/chat/completions`

## Request Flow

```text
Mac browser
  -> GenomeSpy chat panel
    -> DGX uvicorn relay (/v1/agent-turn)
      -> vLLM (/v1/chat/completions)
        -> Qwen model
      <- vLLM response
    <- normalized GenomeSpy response
  <- rendered answer in the chat panel
```

## Install vLLM

The DGX needs a vLLM build that matches its CUDA runtime and Python
environment.

Things that must be true:

- `nvidia-smi` works
- the CUDA runtime libraries are available to the shell that launches vLLM
- Python development headers are available for the active Python version

The model used here is:

```text
Qwen/Qwen3.5-35B-A3B-GPTQ-Int4
```

That is the 4-bit vLLM-friendly variant we used.

Important failure modes we hit:

- `ImportError: libcudart.so.12`
  - Cause: vLLM was built against CUDA 12, but the machine exposed CUDA 13
  - Fix: install a CUDA 13-compatible vLLM build or provide the matching CUDA
    12 runtime
- `fatal error: Python.h: No such file or directory`
  - Cause: Python dev headers were missing
  - Fix: install the matching `python3-dev` package for the active Python
- `Failed to infer device type`
  - Cause: vLLM could not see a usable CUDA runtime from that shell
  - Fix: launch in the real GPU-enabled host shell or fix the CUDA runtime path

## Start vLLM

If the model is already downloaded locally, point vLLM at the repo id or the
local directory.

```bash
vllm serve Qwen/Qwen3.5-35B-A3B-GPTQ-Int4 \
  --host 127.0.0.1 \
  --port 8000 \
  --api-key placeholder \
  --max-model-len 262144 \
  --quantization moe_wna16 \
  --gpu-memory-utilization 0.80
```

Notes:

- The single GPU is handled automatically, so no tensor-parallel flag is
  needed.
- `--gpu-memory-utilization` may need to be reduced if the GPU is not empty at
  startup.

Other vLLM issues we hit:

- `Free memory on device ... is less than desired GPU memory utilization`
  - Fix: reduce `--gpu-memory-utilization`, for example to `0.75`
- `vllm: command not found`
  - Fix: use `.venv/bin/vllm` or activate the environment first

## Start the GenomeSpy Relay

From the repo root on the DGX:

```bash
export GENOMESPY_AGENT_MODEL=Qwen/Qwen3.5-35B-A3B-GPTQ-Int4
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:8000/v1
export GENOMESPY_AGENT_API_STYLE=chat_completions
export GENOMESPY_AGENT_API_KEY=placeholder
export GENOMESPY_AGENT_ENABLE_STREAMING=false

UV_CACHE_DIR=/tmp/uv-cache uv run --project utils/agent_server \
  uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8001 \
  --app-dir utils/agent_server
```

Why these values:

- `GENOMESPY_AGENT_BASE_URL` points the relay at local vLLM.
- `GENOMESPY_AGENT_API_STYLE=chat_completions` selects the OpenAI-compatible
  chat path.
- `GENOMESPY_AGENT_ENABLE_STREAMING=false` avoids provider-specific streaming
  quirks while the setup is being verified.

Important relay issues we hit:

- `VIRTUAL_ENV=.venv does not match the project environment path`
  - Fix: use `--active` or let `uv` use the project environment
- `System message must be at the beginning`
  - Cause: the provider rejected the default two-system-message chat prompt
  - Fix: the relay retries with a merged system/context prompt only for that
    exact error

## Use From a MacBook

Find the DGX IP on the DGX:

```bash
hostname -I
```

Then point GenomeSpy on the MacBook at the relay host:

```bash
VITE_AGENT_ENABLED=true \
VITE_AGENT_BASE_URL=http://<dgx-ip>:8001 \
npm start
```

The browser UI stays local on the Mac, but the agent requests go to the DGX
relay.

## Example Payloads

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

### Slightly richer payload

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

## Known Issues and Fixes

- `curl http://127.0.0.1:8001/...` from the Mac fails
  - The relay is on the remote host, not the Mac.
  - Fix: use `http://<dgx-ip>:8001/...` instead.

## DGX vLLM Troubleshooting

- `libcudart.so.12` missing
  - The vLLM build and CUDA runtime do not match.
  - Fix: use a vLLM build that matches the CUDA runtime, or install the
    matching CUDA runtime libraries.
- `Python.h` missing
  - Python development headers are missing for the active Python.
  - Fix:
    ```bash
    sudo apt-get update
    sudo apt-get install -y python3.12-dev build-essential
    ```
- `vllm: command not found`
  - The vLLM binary is not on `PATH`.
  - Fix: use `.venv/bin/vllm` or activate the environment first.
- `Free memory on device ... is less than desired GPU memory utilization`
  - vLLM wants more free VRAM than the machine currently has.
  - Fix: lower `--gpu-memory-utilization`, for example:
    ```bash
    --gpu-memory-utilization 0.75
    ```
- `System message must be at the beginning`
  - Some chat-completions providers reject the default two-system-message
    prompt shape.
  - Fix: restart the relay after the fallback patch and retry the request.
- `Failed to infer device type`
  - The shell cannot see a usable CUDA runtime.
  - Fix: confirm the GPU is visible in the same shell and that `CUDA_HOME` is
    set correctly.
