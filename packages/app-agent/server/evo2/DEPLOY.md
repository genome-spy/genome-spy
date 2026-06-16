# Cloud Deployment Planning

Notes on deploying the Evo2 inference server to cloud GPU providers.
Not a how-to guide yet — a planning document for when credits are available.

## Key constraints

- **Model size**: evo2_7b loads ~14 GB of weights. Cold start takes 2–3 min.
- **Reference genome**: hg19.fa is ~3 GB. The `/score` and `/entropy` endpoints
  (raw sequence input) don't need it; only `/vep` (coordinate input) does.
  On cloud providers without a persistent filesystem, omitting the genome
  mount disables `/vep` but keeps the other two endpoints fully functional.
- **GPU requirement**: Any NVIDIA Ampere or newer (sm_80+). The 7B model fits
  on 24 GB VRAM (e.g. L4, A10G, RTX 3090). Hopper (H100) is faster but not
  required for the 7B model.

---

## Modal

Modal is the most ergonomic option for serverless GPU inference in Python.
It manages containers, scaling, and cold-start warming automatically.

**Architecture**

Replace the LitServe server with a Modal `@app.cls` that exposes HTTP
endpoints via `@modal.web_endpoint`. The three task functions (`decode_score`,
`decode_vep`, `decode_entropy` from `tasks.py`) map cleanly to endpoints.

**Sketch**

```python
import modal
from tasks import decode_score, encode_score, ScoreBatch
from scoring import run_scores

app = modal.App("genomespy-evo2")

# Named volume so weights survive across cold starts.
hf_cache = modal.Volume.from_name("evo2-hf-cache", create_if_missing=True)

image = (
    modal.Image.from_registry("nvcr.io/nvidia/pytorch:25.06-py3")
    .pip_install("evo2", "litserve", "pydantic>=2.9.0", "pyfaidx>=0.8.0")
)

@app.cls(
    gpu="L4",   # cheapest GPU that fits evo2_7b; upgrade to A100/H100 for speed
    image=image,
    volumes={"/root/.cache/huggingface": hf_cache},
    secrets=[modal.Secret.from_name("huggingface")],
    container_idle_timeout=300,
)
class Evo2:
    @modal.enter()
    def load(self):
        from evo2.models import Evo2 as _Evo2
        m = _Evo2("evo2_7b")
        self.model = m.model
        self.tokenizer = m.tokenizer

    @modal.web_endpoint(method="POST")
    def score(self, request: dict):
        from schema import ScoreRequest
        batch = decode_score(ScoreRequest.model_validate(request))
        scores = run_scores(self.model, self.tokenizer, "cuda", batch.seqs, batch.reduce)
        return encode_score(scores, batch).model_dump()
```

**Reference genome on Modal**

Options in order of preference:
1. `modal.CloudBucketMount` — mount an S3 or GCS bucket containing hg19.fa
   directly into the container. No download, reads on demand via FUSE.
2. `modal.Volume` — download hg19.fa once, persist in a Modal volume.
   Attach to the container as a second volume.
3. Skip it — only expose `/score` and `/entropy`; require callers to send
   sequences directly. GenomeSpy can supply sequences from its own FASTA
   reader anyway.

**Cost estimate (L4, us-east-1)**

| Scenario | $/hr | Notes |
|---|---|---|
| Idle (no requests) | ~$0 | Serverless, scales to zero |
| Active inference | ~$0.80 | L4 spot pricing, ~10 req/min |
| Reserved (always-on) | ~$1.10 | L4 dedicated |

**Useful links**

- Modal GPU docs: https://modal.com/docs/guide/gpu
- CloudBucketMount: https://modal.com/docs/reference/modal.CloudBucketMount
- modal.Volume: https://modal.com/docs/reference/modal.Volume

---

## Lightning AI

Lightning AI makes sense here because the server already uses LitServe (a
Lightning AI project). They offer hosted LitServe deployments directly.

**LitServe Studio / Lightning AI Serve**

Lightning AI has a "LitServe on cloud" path that deploys a `LitAPI` subclass
without any code changes. The `Evo2API` class in `api.py` would deploy as-is.

```bash
lightning run app packages/app-agent/server/evo2/src/server.py --cloud
```

The reference genome would need to be on a Lightning AI cloud drive or omitted
(same trade-off as Modal). Model weights download from HF on first cold start.

**Status**: Lightning AI's serve product is less mature than Modal as of mid-2025.
Worth revisiting if they add GPU spot pricing or better volume support.

---

## RunPod

Lower-level than Modal — rents a persistent GPU pod, closer to a real VM.

Best for: longer-running experiments where you want full control (no cold starts,
direct SSH, can keep the genome file on disk). Not truly serverless.

**Rough flow**

1. Provision a RunPod GPU pod (RTX 4090 24 GB or A40 48 GB).
2. `docker compose up` exactly as on the DGX Spark.
3. Expose port 8001 via RunPod's public URL / proxy.

RunPod pods are billed per hour even when idle; shut them down between runs.

---

## Comparison

| | Modal | Lightning AI | RunPod |
|---|---|---|---|
| Serverless (scales to zero) | ✓ | ✓ | ✗ |
| Code changes needed | Minor | None | None |
| Reference genome support | Via S3/GCS mount | Cloud drive | Local disk |
| Cold start | 2–4 min | 2–4 min | None (always on) |
| GPU spot pricing | ✓ | TBD | ✓ |
| Maturity | High | Medium | High |

**Recommendation**: Start with Modal. The `tasks.py` / `scoring.py` split
already makes it easy to swap out the LitServe wrapper for Modal endpoints
without touching the inference logic.
