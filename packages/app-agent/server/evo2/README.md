# GenomeSpy Evo2 Inference Server

HTTP inference server for [Evo2](https://github.com/ArcInstitute/evo2), Arc Institute's
genomic foundation model. Scores DNA sequences using log-likelihood, intended for use
with the GenomeSpy visual analytics interface.

## What it does

The server loads Evo2 (default: `evo2_7b`) once and exposes a single endpoint,
`POST /evo2`. The `task` field selects the operation.

**`score`** — Given ref/alt sequence pairs, returns the log-likelihood delta between
them. Identical ref and alt sequences are deduplicated across the batch so each unique
sequence is scored only once.

The primary use case: GenomeSpy reads the reference genome client-side, extracts a
sequence window around each variant, and sends the DNA strings directly. No genome
file is needed server-side for this path.

If the client does not have the reference genome, it can send genomic coordinates
instead (`variants` mode). The server then extracts the windows itself, provided a
genome is configured via `EVO2_REF_GENOME_PATH`.

**`include_entropy`** — Set to `true` on any score request to also return per-position
Shannon entropy for each ref and alt sequence. Since logits are already computed during
scoring, entropy is free. Useful for visualising model uncertainty alongside effect
scores.

**`rc_averaging`** — Score both strands and average the result for strand-symmetric
analyses, at 2× compute cost. Forward and RC sequences are batched into a single
forward pass.

**`exon`** — Classify each input sequence as exonic or non-exonic. Uses the
pre-trained lightweight head from
[schmojo/evo2-exon-classifier](https://huggingface.co/schmojo/evo2-exon-classifier),
which operates on the layer-26 embedding of the forward and reverse-complement
sequences concatenated. Returns one probability per input sequence (0 = non-exon,
1 = exon).

**`sae`** — Extract sparse autoencoder feature activations from layer 26 for each
input sequence. Uses [Goodfire/Evo-2-Layer-26-Mixed](https://huggingface.co/Goodfire/Evo-2-Layer-26-Mixed)
(expansion ×8, top-k 64). Returns per-position sparse activations: only the active
feature indices and their values are returned. Useful for mechanistic interpretability
and visualising what genomic patterns the model has learned.

**`embed`** — Return raw intermediate layer activations for each input sequence.
The caller specifies which layers to extract via `layer_names`. Returns a dense
`(seq_len, hidden_dim)` matrix per sequence per layer. Intended for custom downstream
use; prefer `exon` or `sae` for the pre-trained heads.

## API

All requests go to `POST /evo2`.

### score — sequence mode (primary)

```json
{
  "task": "score",
  "pairs": [
    { "ref": "ACGTACGT...", "alt": "ACTTACGT..." }
  ],
  "reduce": "mean",
  "rc_averaging": false,
  "include_entropy": false
}
```

```json
{
  "scores": [
    {
      "delta": -0.023,
      "ref_score": -1.45,
      "alt_score": -1.47,
      "ref_entropy": null,
      "alt_entropy": null
    }
  ]
}
```

With `include_entropy: true`, `ref_entropy` and `alt_entropy` become arrays of
per-position Shannon entropy values (one float per base).

### score — coordinate mode (requires server-side genome)

```json
{
  "task": "score",
  "variants": [
    { "chrom": "17", "pos": 41244936, "ref": "G", "alt": "A" }
  ],
  "window_size": 2048,
  "reduce": "mean"
}
```

Same response shape. Variants that fail coordinate lookup or ref-allele verification
are returned with `delta: null` rather than failing the whole request.

### exon

```json
{ "task": "exon", "seqs": ["ATGGTGAGCAAGGGCGAGGAG...", "TCTGAAAGGACAGTTTTAT..."] }
```

```json
{ "probabilities": [0.89, 0.01] }
```

One probability per input sequence. Values above 0.5 indicate exonic. The model
scores each sequence independently using the forward + reverse-complement layer-26
embeddings; sequences do not compete with each other.

### sae

```json
{ "task": "sae", "seqs": ["ATGGTGAGCAAGGGCGAGGAG..."] }
```

```json
{
  "n_features": 32768,
  "features": [
    [
      { "indices": [16115, 18591, 29844], "values": [688.0, 246.0, 296.0] },
      { "indices": [4021, 9103], "values": [112.0, 44.0] }
    ]
  ]
}
```

`features[seq_idx][pos]` holds the active SAE features at that position — only
non-zero entries are returned. The SAE uses batch top-k sparsity (k=64), meaning
the total active features across all positions equals 64 × seq_len, distributed
unevenly. Use sequences of at least a few hundred bases for meaningful feature
landscapes.

### embed

```json
{
  "task": "embed",
  "seqs": ["ATGGTGAGCAAGGGCGAGGAG..."],
  "layer_names": ["blocks.26"]
}
```

```json
{
  "embeddings": {
    "blocks.26": [
      [ [-1.63, 1.80, -3.83, "...4096 values..."] ]
    ]
  }
}
```

`embeddings[layer][seq_idx]` is a `(seq_len, hidden_dim)` matrix. Multiple layers
can be requested in a single call. Note that responses grow large quickly:
a 1 kb sequence at layer 26 is 1000 × 4096 floats.

## Setup

**Prerequisites**

- NVIDIA GPU (Ampere sm_80 or newer; evo2_7b fits in 24 GB VRAM)
- NVIDIA Container Toolkit
- Docker Compose v2
- HuggingFace account with access to the Evo2 weights

**First run**

```bash
cp .env.example .env
# Edit .env: set HF_TOKEN (and optionally REF_GENOME_PATH for coordinate mode)
```

For local development overrides (live source mount, genome mount, etc.):

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
# Edit paths to match your machine
```

Build and start:

```bash
docker compose up --build -d
docker compose logs -f evo2-server   # wait for "Setup complete on cuda:0"
```

Model weights are downloaded from HuggingFace on first run and cached in a named
Docker volume (`genomespy-evo2-hf-cache`), so subsequent starts are fast.

**Health check**

```bash
curl http://localhost:8001/health
```

## Quick test

Once the server is up (`curl http://localhost:8001/health` returns `{"status":"ok"}`),
try the following:

**Score — sequence mode**

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "score",
    "pairs": [
      { "ref": "ACGTACGTACGT", "alt": "ACTTACGTACGT" }
    ]
  }'
# {"scores":[{"delta":0.015625,"ref_score":-1.40625,"alt_score":-1.390625,"ref_entropy":null,"alt_entropy":null}]}
```

Multiple samples with the same variant — only 1 ref + 1 alt forward pass regardless of count:

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "score",
    "pairs": [
      { "ref": "ACGTACGTACGT", "alt": "ACTTACGTACGT" },
      { "ref": "ACGTACGTACGT", "alt": "ACTTACGTACGT" },
      { "ref": "ACGTACGTACGT", "alt": "ACTTACGTACGT" }
    ]
  }'
```

**Score with entropy**

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "score",
    "pairs": [
      { "ref": "ACGTACGTACGT", "alt": "ACTTACGTACGT" }
    ],
    "include_entropy": true
  }'
# ref_entropy and alt_entropy will be arrays of length 12
```

**Score — coordinate mode** (requires `EVO2_REF_GENOME_PATH` set in the container)

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "score",
    "variants": [
      { "chrom": "17", "pos": 41244936, "ref": "G", "alt": "A" }
    ],
    "window_size": 2048
  }'
```

**Exon classification**

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "exon",
    "seqs": [
      "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAAC",
      "TCTGAAAGGACAGTTTTATTGTAGGTACACATGGCTGCCATTTCAAATGTAACTCACAGCTTGTCCATCAGT"
    ]
  }'
# {"probabilities":[0.8927,0.0109]}
# First sequence (coding region) scores ~0.89; second (intergenic) scores ~0.01
```

**SAE features**

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "sae",
    "seqs": ["TCTGAAAGGACAGTTTTATTGTAGGTACACATGGCTGCCATTTCAAATGTAACTCACAGCTTGTCCATCAGTCCTTGGAGGTCTTTCTATGAAAGGAGCTTGGTGGCGTCCAAACACCACCCAATGTCCACTTAGAAGTAAGCACCGTGTCTGCCCTGAGCTGACTCCTTTTCCAAGGAAGGGGTTGGATCGCTGAGTGTTTTTCCAGGTGTCTACTTGTTGTTAATTAATAGCAATGACAAAGCAGAAGGTTCATGCGTAGCTCGGCTTTCTGG"]
  }' | python3 -c "
import sys, json
d = json.load(sys.stdin)
feats = d['features'][0]
# extract activation of feature 15680 across positions (tracks coding regions)
f15680 = [next((v for i,v in zip(p['indices'],p['values']) if i==15680), 0.0) for p in feats]
print(f'{len(feats)} positions, {d[\"n_features\"]} features total')
print('feature 15680:', [round(v,1) for v in f15680[:10]], '...')
"
```

**Raw embeddings**

```bash
curl -s -X POST http://localhost:8001/evo2 \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "embed",
    "seqs": ["ATGGTGAGCAAGGGCGAGGAG"],
    "layer_names": ["blocks.26"]
  }' | python3 -c "
import sys, json
d = json.load(sys.stdin)
emb = d['embeddings']['blocks.26']
print(f'{len(emb)} seq(s), {len(emb[0])} positions x {len(emb[0][0])} dims')
"
```

Pretty-print any response by piping through `python3 -m json.tool`.

## Subsequent starts

| Situation | Command |
|---|---|
| Normal restart | `docker compose up -d` |
| After Dockerfile change | `docker compose up --build -d` |
| After source edit (live mount) | `docker compose restart evo2-server` |

## Source layout

```
src/
  server.py    — entry point; creates LitServer
  api.py       — Evo2API; single endpoint, task-based routing
  tasks.py     — batch types and decode/encode logic for all tasks
  scoring.py   — inference primitives (run_forward, scores_from_logits, logits_to_entropies)
  sae.py       — BatchTopKTiedSAE definition and checkpoint loader
  genome.py    — reference genome helpers (window extraction, chrom normalisation)
  schema.py    — Pydantic request/response models
```

## Cloud deployment

See [DEPLOY.md](DEPLOY.md) for notes on Modal, Lightning AI, and RunPod.
