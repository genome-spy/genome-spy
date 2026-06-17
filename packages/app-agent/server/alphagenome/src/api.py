"""AlphaGenome LitServe API."""

from __future__ import annotations

import litserve as ls

from schema import EmbedRequest, ISMRequest, PredictRequest, ScoreRequest
from scoring import extract_embeddings, run_forward
from tasks import (
    AlphaGenomeBatch,
    decode_embed,
    decode_ism,
    decode_predict,
    decode_score,
    encode_embed,
    encode_ism,
    encode_predict,
    encode_score,
)

_WEIGHTS_REPO = "gtca/alphagenome_pytorch"
_WEIGHTS_FILE = "model_all_folds.safetensors"


class AlphaGenomeAPI(ls.LitAPI):
    """LitServe API for AlphaGenome genomic track prediction."""

    def setup(self, device: str) -> None:
        """Download weights on first run and load the model onto device."""
        from alphagenome_pytorch import AlphaGenome
        from huggingface_hub import hf_hub_download

        weights_path = hf_hub_download(
            repo_id=_WEIGHTS_REPO,
            filename=_WEIGHTS_FILE,
            repo_type="model",
        )
        self.model = AlphaGenome.from_pretrained(weights_path, device=device)
        self.model.eval()
        self.device = device

    def decode_request(self, request: dict) -> AlphaGenomeBatch:
        """Validate the incoming request and build a batch descriptor."""
        task = request.get("task", "predict")
        if task == "predict":
            return decode_predict(PredictRequest.model_validate(request))
        elif task == "score":
            return decode_score(ScoreRequest.model_validate(request))
        elif task == "embed":
            return decode_embed(EmbedRequest.model_validate(request))
        elif task == "ism":
            return decode_ism(ISMRequest.model_validate(request))
        else:
            raise ValueError(
                f"Unknown task: {task!r}. Valid: predict, score, embed, ism."
            )

    def predict(self, batch: AlphaGenomeBatch) -> tuple:
        """Run the model forward pass(es) and return (raw_output, batch).

        All model inference happens here — encode_response is pure CPU tensor ops.

        For ISM, the reference sequence is run once and all alternate sequences
        are run in a single loop, so the ref forward pass is never duplicated
        regardless of how many ISM positions are requested.
        """
        if batch.task == "embed":
            emb = extract_embeddings(self.model, self.device, batch.seqs[0], batch.organism)
            return emb, batch
        elif batch.task == "ism":
            # seqs[0] is ref; seqs[1:] are the 3×window_length alternates.
            ref_out = run_forward(self.model, self.device, [batch.seqs[0]], batch.organism)[0]
            alt_outs = run_forward(self.model, self.device, batch.seqs[1:], batch.organism)
            return (ref_out, alt_outs), batch
        elif batch.snvs_mode:
            # seq+snvs: run the shared reference once, then all alts, and
            # assemble [ref, alt0, ref, alt1, …] so encode_score works unchanged.
            ref_out = run_forward(self.model, self.device, [batch.seqs[0]], batch.organism)[0]
            alt_outs = run_forward(self.model, self.device, batch.seqs[1:], batch.organism)
            outputs_list = [item for alt in alt_outs for item in (ref_out, alt)]
            return outputs_list, batch
        else:
            outputs_list = run_forward(self.model, self.device, batch.seqs, batch.organism)
            return outputs_list, batch

    def encode_response(self, output: tuple) -> object:
        """Convert raw model outputs to the appropriate response model."""
        result, meta = output
        if meta.task == "predict":
            return encode_predict(result, meta)
        elif meta.task == "score":
            return encode_score(result, meta)
        elif meta.task == "ism":
            return encode_ism(result, meta)
        elif meta.task == "embed":
            return encode_embed(result, meta)
        else:
            raise ValueError(f"Unknown task: {meta.task!r}.")
