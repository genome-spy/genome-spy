# GenomeSpy AlphaGenome Inference Server

HTTP inference server for [AlphaGenome](https://www.nature.com/articles/s41586-025-10014-0)
(PyTorch port: [alphagenome-pytorch](https://github.com/genomicsxai/alphagenome-pytorch)),
Google DeepMind's DNA sequence model that predicts hundreds of genomic tracks at single
base-pair resolution. Intended for use with the GenomeSpy visual analytics interface.

## What it does

The server loads AlphaGenome (`alphagenome_pytorch`, weights from
[gtca/alphagenome_pytorch](https://huggingface.co/gtca/alphagenome_pytorch)) once and
exposes a single endpoint, `POST /alphagenome`. The `task` field selects the operation.

**`predict`** — Given a 131 072 bp DNA sequence, returns track predictions for the
requested output heads at 1 bp or 128 bp resolution. Useful for visualising the regulatory
landscape over a genomic window.

**`score`** — Given ref/alt sequence pairs (both 131 072 bp, centered on the variant),
returns the alt − ref difference summed over a center window for each track. This is the
primary variant effect prediction use case: GenomeSpy extracts a 131 K window around each
variant client-side and sends both alleles to the server.

**`embed`** — Returns 128 bp trunk embeddings (shape 1024 × 3072) for a sequence. Useful
for custom downstream analysis without running the prediction heads.

## Model outputs

| Head | Real tracks (human) | Padded dim | Resolutions |
|---|---|---|---|
| `atac` | 167 | 256 | 1 bp, 128 bp |
| `dnase` | 305 | 384 | 1 bp, 128 bp |
| `procap` | 12 | 128 | 1 bp, 128 bp |
| `cage` | 546 | 640 | 1 bp, 128 bp |
| `rna_seq` | 667 | 768 | 1 bp, 128 bp |
| `chip_tf` | 1617 | 1664 | 128 bp only |
| `chip_histone` | 1116 | 1152 | 128 bp only |
| `contact_maps` | 28 | 28 | pair (64×64) |
| `splice_sites` | 5 | 5 | 1 bp |
| `splice_site_usage` | 734 | 734 | 1 bp |
| `splice_junctions` | 734 | 734 | pairwise |

Real tracks come first in each tensor; padding channels are zero. Default resolution is
128 bp — requesting 1 bp produces 128× more data per head.

## Performance on DGX Spark (GB10)

| Context | Forward pass | VRAM |
|---|---|---|
| 128K bp (standard) | ~1.5 s | 8.8 GB |
| 256K bp | ~2.9 s | 12.7 GB |
| 512K bp | ~7.1 s | 20.4 GB |
| 1024K bp | ~21 s | 36.0 GB |

128K bp is the fixed input size for this server. Attention is O(L²) so longer contexts
scale poorly for interactive use.

## API

All requests go to `POST /alphagenome`. The input sequence must be exactly **131 072 bp**
of uppercase DNA (`ACGTN`). `N` bases are encoded as all-zeros (matching the JAX
reference).

### predict

```json
{
  "task": "predict",
  "seq": "ACGT...",
  "organism": "human",
  "heads": ["atac", "dnase"],
  "resolution": 128
}
```

```json
{
  "tracks": {
    "atac": [[[0.147, -0.032, ...], ...]],
    "dnase": [[[3.293, 1.105, ...], ...]]
  }
}
```

`tracks[head][seq_idx]` is a `(positions, n_tracks)` matrix. At 128 bp resolution,
`atac` is 1024 × 256 — about 1 MB of JSON per head. At 1 bp it is 131 072 × 256.

Valid heads: `atac`, `dnase`, `procap`, `cage`, `rna_seq`, `chip_tf`, `chip_histone`,
`contact_maps`, `splice_sites`, `splice_site_usage`, `splice_junctions`.

### score

```json
{
  "task": "score",
  "pairs": [
    { "ref": "ACGT...", "alt": "ACGT..." }
  ],
  "organism": "human",
  "heads": ["atac", "cage"],
  "resolution": 128,
  "window_size": 501
}
```

```json
{
  "scores": [
    {
      "atac": [0.005, -0.002, ...],
      "cage": [0.880, 0.450, ...]
    }
  ]
}
```

`scores[pair_idx][head]` is usually a list of floats, one per track channel
(including padding). Matrix-valued heads such as `contact_maps` return a nested
list instead.
`window_size` controls how many bp around the center of the sequence are summed when
computing the alt − ref delta. Default 501 bp matches the AlphaGenome paper's
`CenterMaskScorer`.

The variant should be placed at the center of the 131 072 bp window (position 65 536).
GenomeSpy extracts this window client-side from the reference genome.

### embed

```json
{
  "task": "embed",
  "seq": "ACGT...",
  "organism": "human"
}
```

```json
{
  "embeddings_128bp": [[...3072 values...], ...]
}
```

`embeddings_128bp` is a `(1024, 3072)` matrix — the trunk representation at 128 bp
resolution before the prediction heads.

## Setup

**Prerequisites**

- NVIDIA GPU (GB10 / Blackwell or Ampere sm_80+; ~10 GB VRAM for 128K context)
- NVIDIA Container Toolkit
- Docker Compose v2
- HuggingFace account (model weights are public but require acceptance of the
  [AlphaGenome model terms](https://deepmind.google.com/science/alphagenome/model-terms))

**First run**

```bash
cp .env.example .env
# Edit .env: set HF_TOKEN
docker compose up --build -d
docker compose logs -f alphagenome-server   # wait for "Uvicorn running on..."
```

Model weights (`model_all_folds.safetensors`, ~5 GB) are downloaded from HuggingFace on
first run and cached in a named Docker volume (`genomespy-alphagenome-hf-cache`).

**Health check**

```bash
curl http://localhost:8002/health
```

## Quick test

Sequences are 131 072 bp — too long for shell arguments. Write requests to a file:

**Generate a test request**

```bash
python3 -c "
import json
seq = 'A' * 131072
json.dump({'task': 'predict', 'seq': seq, 'heads': ['atac', 'dnase'], 'resolution': 128},
          open('/tmp/ag_req.json', 'w'))
"
```

**Predict**

```bash
curl -s -X POST http://localhost:8002/alphagenome \
  -H 'Content-Type: application/json' \
  -d @/tmp/ag_req.json \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k, v in d['tracks'].items():
    print(f'{k}: {len(v[0])} positions x {len(v[0][0])} tracks')
"
# atac: 1024 positions x 256 tracks
# dnase: 1024 positions x 384 tracks
```

**Score a variant (A→C at center)**

```bash
python3 -c "
import json
ref = 'A' * 131072
alt = ref[:65536] + 'C' + ref[65537:]
json.dump({'task': 'score',
           'pairs': [{'ref': ref, 'alt': alt}],
           'heads': ['atac', 'cage']},
          open('/tmp/ag_score.json', 'w'))
"
curl -s -X POST http://localhost:8002/alphagenome \
  -H 'Content-Type: application/json' \
  -d @/tmp/ag_score.json \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for head, vals in d['scores'][0].items():
    top = sorted(enumerate(vals), key=lambda x: abs(x[1]), reverse=True)[:3]
    print(f'{head}: top deltas = {[(i, round(v,4)) for i,v in top]}')
"
# atac: top deltas = [(127, 0.0046), (99, 0.004), (34, 0.0037)]
# cage: top deltas = [(294, 0.8799), (506, 0.4499), (21, 0.3426)]
```

**Embed**

```bash
python3 -c "
import json
json.dump({'task': 'embed', 'seq': 'A' * 131072}, open('/tmp/ag_embed.json', 'w'))
"
curl -s -X POST http://localhost:8002/alphagenome \
  -H 'Content-Type: application/json' \
  -d @/tmp/ag_embed.json \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
e = d['embeddings_128bp']
print(f'{len(e)} positions x {len(e[0])} dims')
"
# 1024 positions x 3072 dims
```

## Subsequent starts

| Situation | Command |
|---|---|
| Normal restart | `docker compose up -d` |
| After Dockerfile change | `docker compose up --build -d` |
| After source edit (live mount) | `docker compose restart alphagenome-server` |

## Source layout

```
src/
  server.py    — entry point; creates LitServer on port 8002
  api.py       — AlphaGenomeAPI; single endpoint, task-based routing
  tasks.py     — batch dataclass and decode/encode functions for all tasks
  scoring.py   — inference primitives (forward pass, center-window scoring, embeddings)
  schema.py    — Pydantic request/response models
```
