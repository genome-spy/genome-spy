# GenomeSpy Agent Server PoC

This directory contains the minimal Python relay service for the read-only
conversation PoC described in
`packages/app/src/agent/LLM_PLAN/conversation-server-PoC.md`.

## Scope

The service is intentionally thin:

- accepts `POST /v1/plan`
- reads `message`, `history`, and `context` as-is
- prepends a fixed internal system prompt
- forwards the assembled prompt to one LLM provider
- normalizes the result to either `answer` or `clarify`

The service does not:

- rebuild GenomeSpy context
- validate GenomeSpy semantics
- execute tools or actions
- perform retries, truncation, or summarization

## Tech stack

- `FastAPI`
- `httpx`
- `pydantic`
- `uvicorn`
- `pytest`
- `ruff`
- `mypy`

## Configuration

The server currently uses one OpenAI-compatible chat-completions adapter.

Required environment variables:

- `GENOMESPY_AGENT_MODEL`

Optional environment variables:

- `GENOMESPY_AGENT_BASE_URL`
  - default: `http://127.0.0.1:11434/v1`
- `GENOMESPY_AGENT_API_KEY`
  - default: `ollama`
- `GENOMESPY_AGENT_TIMEOUT_SECONDS`
  - default: `180`
- `GENOMESPY_AGENT_SYSTEM_PROMPT`
  - overrides the built-in GenomeSpy system prompt

The default base URL targets a local OpenAI-compatible endpoint. This works for
providers such as LM Studio or vLLM when configured with a compatible API.

## Ollama warm-up

When the relay talks to a local Ollama model, the first request can take much
longer than later ones because the model may need to load into memory. The
relay therefore defaults to a `180` second timeout.

If the first request still times out, try warming the model with a direct
request first:

```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ollama" \
  -d '{
    "model": "gemma4:e4b",
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }'
```

If needed, increase the timeout explicitly:

```bash
export GENOMESPY_AGENT_TIMEOUT_SECONDS=300
```

## Run

### 1. Start GenomeSpy

From the repo root, start the GenomeSpy dev server with agent support enabled
and point it at the local Python relay:

```bash
VITE_AGENT_ENABLED=true VITE_AGENT_BASE_URL=http://127.0.0.1:8000 npm start
```

This starts the GenomeSpy example app on `http://localhost:8080/`.

### 2. Start or verify Ollama

Ollama usually runs as a background service. If it is not already running, you
can start it with:

```bash
ollama serve
```

If you get an "address already in use" message, Ollama is already running and
you can leave it alone.

To verify Ollama is responding:

```bash
curl http://127.0.0.1:11434/api/tags
```

To pull the example model used in this README:

```bash
ollama pull gemma4:e4b
```

To confirm the model is available:

```bash
ollama list
```

### 3. Start the Python relay

From the repo root:

```bash
export GENOMESPY_AGENT_MODEL=gemma4:e4b
export GENOMESPY_AGENT_BASE_URL=http://127.0.0.1:11434/v1
export GENOMESPY_AGENT_API_KEY=ollama

uv run --project utils/agent_server uvicorn app.main:app --reload --app-dir utils/agent_server
```

### 4. Use the GenomeSpy chat panel

Open the GenomeSpy app in the browser at `http://localhost:8080/` and load one
of the example visualizations.

Then:

1. Open the local agent chat panel from the toolbar.
2. Type a question such as:
   - `What is in this visualization?`
   - `How are methylation levels encoded?`
3. Submit the message.

The chat panel request should travel from GenomeSpy to the Python relay as a
`POST` request to:

```text
http://127.0.0.1:8000/v1/plan
```

The Python relay then forwards the assembled prompt to Ollama and returns a
normalized `answer` or `clarify` response back to the chat panel.

If everything is wired correctly, you should see:

- the browser app running on `http://localhost:8080/`
- the Python relay logging `POST /v1/plan`
- the chat panel rendering the returned assistant message

## Test

```bash
uv run --project utils/agent_server pytest
uv run --project utils/agent_server ruff check .
uv run --project utils/agent_server mypy app
```

## Request shape

```json
{
  "message": "How are methylation levels encoded?",
  "history": [
    {
      "id": "msg_001",
      "role": "user",
      "text": "What is in this visualization?"
    }
  ],
  "context": {
    "schemaVersion": 1
  }
}
```

## Response shape

```json
{
  "type": "answer",
  "message": "Methylation levels are encoded with the beta-value track."
}
```
