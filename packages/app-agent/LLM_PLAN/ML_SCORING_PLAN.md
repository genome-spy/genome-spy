# ML Scoring Integration Plan

Integration of the Evo2 and AlphaGenome inference servers into the GenomeSpy
TCGA-BRCA visualization, allowing users to score variants from a brush selection
through a right-click dialog.

---

## Visualization structure

The TCGA-BRCA spec has this layout:

```
vconcat
└── "samples" view — stacks N per-sample rows vertically
    └── "genomic-data" spec — shared content for every sample row
        params:
          brush — x-interval selection (shared x-axis → same interval across ALL rows)
        layer:
          ├── "cnv"       — rect marks (segments.tsv: Chromosome, Start, End, Sample, Segment_Mean)
          └── "mutations" — point marks (mutations.tsv: see columns below)
```

**mutations.tsv key columns:**

| Column | Role |
|--------|------|
| `Chromosome` | chromosome (no "chr" prefix) |
| `Start_Position` | 1-based genomic position |
| `Reference_Allele` | REF base |
| `Tumor_Seq_Allele2` | ALT base (the somatic mutation) |
| `Variant_Type` | `SNP`, `INS`, `DEL`, … |
| `Sample` | sample ID (matches segments.tsv and samples.tsv) |
| `Variant_Classification` | Missense_Mutation, Splice_Site, Silent, … |
| `CADD_PHRED` | deleteriousness score (used for mark size) |

---

## User-facing UX flow

```
1. Brush
   User shift-drags horizontally across the visualization.
   The brush param stores a genomic interval [start, end] that spans the
   same region across ALL sample rows simultaneously.

2. Right-click within the brushed region
   User right-clicks anywhere inside the green brush rectangle.
   Context menu appears:

     ──────────────────────────────────────
     Score variants in selected region
       › with Evo2
       › with AlphaGenome
     ──────────────────────────────────────

   The menu item is only shown when a brush is active AND the click
   x-coordinate falls inside the brush interval.

3. Dialog
   ┌──────────────────────────────────────────────┐
   │ AlphaGenome: score variants in region        │
   │                                              │
   │ Region:   chr17:35,012,000 – 36,480,000      │
   │ Variants: 31 unique SNPs across 12 samples   │
   │ (47 total sample-variant rows, deduplicated) │
   │                                              │
   │ ── AlphaGenome options ────────────────────  │
   │ Heads   ☑ atac  ☑ cage  ☐ rna_seq  ☐ chip_tf│
   │ Scorer  ● window  ○ splice                   │
   │                                              │
   │ ── Evo2 options ───────────────────────────  │
   │ Window size  [2048] bp                       │
   │ ☐ RC averaging   ☐ include entropy           │
   │                                              │
   │ Estimated time: ~47s  (31 variants × 1.5s)  │
   │                                              │
   │                [ Cancel ]  [ Run ]           │
   └──────────────────────────────────────────────┘

4. Progress
   Spinner with "Scoring variant 8 / 31…" while the server runs.
   Cancellable.

5. Results
   New metadata columns appear in the sample sidebar, e.g.:
     ag_atac_max — max |alt − ref| across ATAC tracks for variants
                   belonging to this sample in the brushed region
     ag_cage_max — same for CAGE
     evo2_delta  — max |delta log-likelihood| across brushed variants
   
   Samples can now be sorted / grouped by these columns.
   The mutation marks are NOT recolored (they already encode classification
   and CADD); scores live as sample-level metadata instead.
```

---

## Architecture overview

```
Browser (GenomeSpy app)
  └── app-agent plugin (packages/app-agent/src/)
        ├── mlContextMenu.js       — SampleView context-menu augmentation for brushed variants
        ├── MlScoringDialog.js     — BaseDialog subclass
        ├── mlVariantCollector.js  — reads brush + mutations data, deduplicates
        ├── mlSequenceFetcher.js   — fetches one reference window via indexedFasta
        └── mlApiClient.js         — POSTs to relay proxy, handles progress
              ↓ POST /v1/evo2 or /v1/alphagenome
Python relay (packages/app-agent/server/app/main.py)
  └── two new proxy endpoints
              ↓ forwards to
ML servers (DGX Spark, Tailscale)
  ├── Evo2        http://100.117.128.70:8001/evo2
  └── AlphaGenome http://100.117.128.70:8002/alphagenome
```

---

## Data flow: browser → server → result columns

### Step 1 — Collect variants from brush

```js
// resolve the mutations layer
const view = agentApi.resolveViewSelector({ scope: ["samples", "genomic-data"], view: "mutations" });
const data  = view.getCollector().getData();
const xAccessor = view.getDataAccessor("x");

// brush interval from provenance param state
const brushInterval = provenanceState.brush?.intervals?.x;  // [start, end]

// walk items that overlap the brush
const allRows = [];
visitIntervalFeatures(data, xAccessor, null, "intersects",
    brushInterval[0], brushInterval[1],
    datum => {
        if (datum.Variant_Type === "SNP") allRows.push(datum);
    });
```

### Step 2 — Deduplicate by unique variant

```js
const uniqueVariants = new Map();  // key: "chr:pos:ref:alt"
for (const row of allRows) {
    const key = `${row.Chromosome}:${row.Start_Position}:${row.Reference_Allele}:${row.Tumor_Seq_Allele2}`;
    if (!uniqueVariants.has(key)) uniqueVariants.set(key, row);
}
// M unique variants, N total rows (N ≥ M)
```

### Step 3 — Fetch one reference window

```js
// center on the midpoint of all unique variant positions
const positions = [...uniqueVariants.values()].map(v => v.Start_Position);
const windowCenter = Math.round((Math.min(...positions) + Math.max(...positions)) / 2);
const HALF = 65536;   // AlphaGenome; use 1024 for Evo2

const chrom = "chr" + [...uniqueVariants.values()][0].Chromosome;
const refSeq = await indexedFasta.getSequence(chrom, windowCenter - HALF, windowCenter + HALF);
// one HTTP range request, ~131 KB
```

Edge case: if variants span more than 131 K bp (wider than one AlphaGenome window),
split into chunks and score each chunk separately. Evo2 windows are 2 K so chunking
happens at a much lower threshold.

### Step 4 — Build and send request

```js
const snvs = [...uniqueVariants.values()].map(v => ({
    offset: v.Start_Position - (windowCenter - HALF),  // 0-based offset into refSeq
    ref_base: v.Reference_Allele,
    alt_base: v.Tumor_Seq_Allele2,
}));

const response = await fetch("/v1/alphagenome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        task: "score",
        seq: refSeq,
        snvs,
        heads: ["atac", "cage"],
        scorer: "window",
    }),
});
// returns { scores: [ { atac: [floats], cage: [floats] }, ... ] }
// scores[i] corresponds to snvs[i]
```

### Step 5 — Map scores to per-sample metadata

```js
// reduce per-variant per-head scores to one scalar (max |value|)
const variantScores = new Map();  // key → { ag_atac_max, ag_cage_max }
for (const [i, [key]] of [...uniqueVariants.entries()].entries()) {
    const s = response.scores[i];
    variantScores.set(key, {
        ag_atac_max: Math.max(...s.atac.map(Math.abs)),
        ag_cage_max: Math.max(...s.cage.map(Math.abs)),
    });
}

// aggregate to sample level: max across all variants belonging to each sample
const sampleScores = {};
for (const row of allRows) {
    const key = `${row.Chromosome}:${row.Start_Position}:${row.Reference_Allele}:${row.Tumor_Seq_Allele2}`;
    const vs = variantScores.get(key);
    if (!vs) continue;
    const s = sampleScores[row.Sample] ??= { ag_atac_max: 0, ag_cage_max: 0 };
    s.ag_atac_max = Math.max(s.ag_atac_max, vs.ag_atac_max);
    s.ag_cage_max = Math.max(s.ag_cage_max, vs.ag_cage_max);
}

// register as new metadata columns
await agentApi.submitIntentActions([
    {
        type: "sampleView/deriveMetadata",
        payload: {
            attribute: "ag_atac_max",
            values: Object.fromEntries(Object.entries(sampleScores).map(([k, v]) => [k, v.ag_atac_max])),
        },
    },
    {
        type: "sampleView/deriveMetadata",
        payload: {
            attribute: "ag_cage_max",
            values: Object.fromEntries(Object.entries(sampleScores).map(([k, v]) => [k, v.ag_cage_max])),
        },
    },
]);
```

---

## Server changes

### 1. AlphaGenome — new `seq + snvs` input mode

`schema.py` — extend `ScoreRequest` to accept either `pairs` or `seq + snvs`:

```python
class SNV(BaseModel):
    """A single-nucleotide substitution described as an offset within a reference window."""
    offset: int       # 0-based offset into seq
    ref_base: str     # must match seq[offset]
    alt_base: str     # the alternate base

class ScoreRequest(BaseModel):
    task: Literal["score"] = "score"
    # Existing mode: client sends full 131K ref and alt sequences
    pairs: list[SeqPair] | None = None
    # New mode: client sends one reference window + SNV descriptors
    seq: str | None = None
    snvs: list[SNV] | None = None
    # Shared options
    organism: Literal["human", "mouse"] = "human"
    heads: list[str] = ["atac", "dnase", "cage"]
    resolution: Literal[1, 128] = 128
    window_size: int = 501
    scorer: Literal["window", "splice"] = "window"

    @model_validator(mode="after")
    def _require_one_mode(self) -> "ScoreRequest":
        if (self.pairs is None) == (self.seq is None):
            raise ValueError("Provide either 'pairs' or 'seq + snvs', not both.")
        if self.seq is not None and not self.snvs:
            raise ValueError("'snvs' is required when 'seq' is provided.")
        return self
```

`tasks.py` — `decode_score` builds pairs from `seq + snvs`:

```python
def _build_pairs_from_snvs(seq: str, snvs: list[SNV]) -> list[SeqPair]:
    pairs = []
    for snv in snvs:
        alt = seq[:snv.offset] + snv.alt_base + seq[snv.offset + 1:]
        pairs.append(SeqPair.model_construct(ref=seq, alt=alt))
    return pairs
```

No changes needed to `scoring.py`, `api.py`, or `server.py` — the pairs mode is
unchanged downstream.

### 2. Relay — two new proxy endpoints

`config.py`:
```python
evo2_base_url: str = "http://100.117.128.70:8001"
alphagenome_base_url: str = "http://100.117.128.70:8002"
```

`main.py`:
```python
@app.post("/v1/evo2")
async def proxy_evo2(request: Request, settings: Settings = Depends(get_settings)):
    body = await request.body()
    async with httpx.AsyncClient(timeout=600) as client:
        r = await client.post(f"{settings.evo2_base_url}/evo2", content=body,
                              headers={"Content-Type": "application/json"})
    return Response(content=r.content, media_type="application/json", status_code=r.status_code)

@app.post("/v1/alphagenome")
async def proxy_alphagenome(request: Request, settings: Settings = Depends(get_settings)):
    body = await request.body()
    async with httpx.AsyncClient(timeout=600) as client:
        r = await client.post(f"{settings.alphagenome_base_url}/alphagenome", content=body,
                              headers={"Content-Type": "application/json"})
    return Response(content=r.content, media_type="application/json", status_code=r.status_code)
```

Timeout 600s covers worst-case Evo2 batches. AlphaGenome single requests are ≤2s
but batches can run longer.

---

## Browser plugin changes (packages/app-agent/src/)

### New files

| File | Purpose |
|------|---------|
| `ml/mlContextMenu.js` | Appends ML scoring entries to the built-in SampleView context menu when a brushed interval contains SNVs |
| `ml/MlScoringDialog.js` | `BaseDialog` subclass: model selector, options, estimated time, progress |
| `ml/mlVariantCollector.js` | Reads mutations from brush interval; deduplicates; filters SNP only |
| `ml/mlSequenceFetcher.js` | Wraps `@gmod/indexedfasta`; computes window center; handles chunking |
| `ml/mlApiClient.js` | `scoreWithEvo2()`, `scoreWithAlphaGenome()` — thin fetch wrappers |
| `ml/mlResultMapper.js` | variant scores → per-sample metadata values → `deriveMetadata` actions |

### Integration point in `appAgent.js`

```js
import { registerMlContextMenu } from "./ml/mlContextMenu.js";

export function appAgent(options) {
    return {
        name: "@genome-spy/app-agent",
        async install(app) {
            const agentApi = await app.getAgentApi();
            // ... existing chat panel setup ...
            const cleanup = registerMlContextMenu(agentApi, options);
            return () => { cleanup(); /* existing cleanup */ };
        },
    };
}
```

### Plugin options (for the TCGA-BRCA app entry point)

```js
appAgent({
    // existing options ...
    ml: {
        referenceUrl: "/data/hg19.fa.gz",
        referenceIndexUrl: "/data/hg19.fa.gz.fai",
        // optional: override ML server URLs (useful for local dev without Tailscale)
        // evo2BaseUrl: "http://localhost:8001",
        // alphagenomeBaseUrl: "http://localhost:8002",
    }
})
```

---

## Spec changes (TCGA-BRCA)

1. The `"genomic-data"` view already has `name: "genomic-data"` — good.
2. The `"mutations"` layer already has `name: "mutations"` — good.
3. No spec changes needed, but confirm the view selector path:
   `{ scope: ["samples", "genomic-data"], view: "mutations" }`
   (exact scope chain depends on how GenomeSpy resolves nested view names — verify at runtime).

---

## CNV handling

CNVs (segments.tsv rows) are **not sent to the ML servers**. The models score
sequence-based effects; copy number changes the dosage, not the nucleotide sequence.

- SNPs in CNV-amplified regions: score normally in reference-sequence context.
  The CNV background is visible in the segments track; the agent can reason about
  the combination in its answer.
- CNV events themselves: outside the scope of Evo2/AlphaGenome. Would require
  dosage-aware models (not available here).
- Filter: `Variant_Type === "SNP"` before collecting, which naturally excludes
  `INS` and `DEL` as well.

---

## Build order

| # | Task | Location | Dependency |
|---|------|----------|------------|
| 1 | `SNV` model + `seq+snvs` input mode on `ScoreRequest` | AlphaGenome server | — |
| 2 | `decode_score` builds pairs from `seq+snvs` | AlphaGenome server | 1 |
| 3 | Relay proxy `/v1/evo2` + `/v1/alphagenome` | relay `main.py` + `config.py` | — |
| 4 | `mlApiClient.js` | browser plugin | 3 |
| 5 | `mlVariantCollector.js` | browser plugin | — |
| 6 | `mlSequenceFetcher.js` | browser plugin | — |
| 7 | `MlScoringDialog.js` | browser plugin | — |
| 8 | `mlContextMenu.js` | browser plugin | 4, 5, 6, 7 |
| 9 | `mlResultMapper.js` | browser plugin | 4 |
| 10 | Wire into `appAgent.js` + plugin options | browser plugin | 8, 9 |
| 11 | Verify view selector path at runtime | — | 10 |

Items 1–2 and 3 are independent and can start in parallel.

---

## Open questions

- **View selector scope**: The exact `scope` array for resolving the `"mutations"`
  layer inside `"samples" → "genomic-data"` needs to be verified against the running app.
  May require reading the GenomeSpy source for how import-scoped names are resolved.

- **indexedFasta availability**: `@gmod/indexedfasta` is already a dependency of
  `packages/core`. Need to confirm it can be imported directly in `app-agent/src/`
  or if it must go through a GenomeSpy-provided API.

- **Chunking strategy**: If the brush spans > 131 K bp (unlikely for gene-level
  brushes but possible for chromosomal-scale views), variants must be grouped into
  windows and scored separately. The current plan centers one window on the midpoint;
  chunking logic is deferred.

- **Progress streaming**: AlphaGenome processes sequences sequentially (~1.5s each).
  The current API returns the full response only when all variants are done. For large
  batches, adding a streaming/progress endpoint would improve UX. Deferred.

- **Evo2 coordinate vs sequence mode**: Evo2 already has a `variants` mode where
  the server extracts windows from its own genome file. If the Evo2 server on the DGX
  has hg19 mounted, this avoids the browser needing to fetch the reference at all for
  Evo2. AlphaGenome would still use the browser-side fetch + `seq+snvs` path.
