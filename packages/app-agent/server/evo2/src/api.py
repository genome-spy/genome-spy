"""LitAPI — single endpoint routing all Evo2 tasks via request["task"]."""

import logging
import os

import litserve as ls
from pyfaidx import Fasta

from sae import BatchTopKTiedSAE, load_sae
from schema import EmbedRequest, ExonRequest, SaeRequest, ScoreRequest
from scoring import run_forward
from tasks import (
    EmbedBatch,
    Evo2Batch,
    decode_embed,
    decode_exon,
    decode_sae,
    decode_score,
    encode_embed,
    encode_exon,
    encode_sae,
    encode_score,
)

logger = logging.getLogger(__name__)

_MODEL_NAME = os.environ.get("EVO2_MODEL_NAME", "evo2_7b")
_REF_GENOME_PATH = os.environ.get("EVO2_REF_GENOME_PATH", "")


class Evo2API(ls.LitAPI):
    """Single LitAPI for all Evo2 tasks — one model load, one endpoint.

    Routing is done via request["task"]. predict() runs a single forward pass
    over all sequences (including RC when rc_averaging); encode_response()
    handles task-specific reduction and optional entropy.
    """

    def setup(self, device: str) -> None:
        from evo2.models import Evo2
        from huggingface_hub import hf_hub_download
        from transformers import AutoModel

        logger.info("Loading Evo2 model '%s'", _MODEL_NAME)
        evo2 = Evo2(_MODEL_NAME)
        self.model = evo2.model
        self.tokenizer = evo2.tokenizer
        self.device = device

        logger.info("Loading exon classifier")
        self.exon_classifier = AutoModel.from_pretrained(
            "schmojo/evo2-exon-classifier",
            trust_remote_code=True,
        ).to(device)
        self.exon_classifier.eval()

        logger.info("Loading sparse autoencoder")
        sae_path = hf_hub_download(
            repo_id="Goodfire/Evo-2-Layer-26-Mixed",
            filename="sae-layer26-mixed-expansion_8-k_64.pt",
            repo_type="model",
        )
        self.sae: BatchTopKTiedSAE = load_sae(sae_path, device)

        self.ref: Fasta | None = None
        self.chrom_keys: set[str] = set()
        if _REF_GENOME_PATH and os.path.exists(_REF_GENOME_PATH):
            logger.info("Loading reference genome from %s", _REF_GENOME_PATH)
            fasta = Fasta(_REF_GENOME_PATH)
            self.ref = fasta
            self.chrom_keys = set(fasta.keys())
        else:
            logger.info(
                "No reference genome configured — coordinate mode unavailable. "
                "Set EVO2_REF_GENOME_PATH to enable it."
            )

        logger.info("Setup complete on %s", device)

    def decode_request(self, request: dict) -> Evo2Batch | EmbedBatch:
        task = request.get("task", "score")
        if task == "score":
            return decode_score(
                ScoreRequest.model_validate(request),
                ref=self.ref,
                chrom_keys=self.chrom_keys,
            )
        elif task == "embed":
            return decode_embed(EmbedRequest.model_validate(request))
        elif task == "exon":
            return decode_exon(ExonRequest.model_validate(request))
        elif task == "sae":
            return decode_sae(SaeRequest.model_validate(request))
        raise ValueError(f"Unknown task: {task!r}.")

    def predict(self, x: Evo2Batch | EmbedBatch) -> tuple:
        layer_names = x.layer_names if isinstance(x, EmbedBatch) else []
        logits, seq_lengths, input_ids, embeddings = run_forward(
            self.model, self.tokenizer, self.device, x.seqs, layer_names=layer_names
        )
        return (logits, seq_lengths, input_ids, embeddings), x

    def encode_response(self, output: tuple) -> object:
        (logits, seq_lengths, input_ids, embeddings), meta = output
        if meta.task == "score":
            return encode_score(logits, seq_lengths, input_ids, meta)
        elif meta.task == "embed":
            return encode_embed(embeddings, seq_lengths, meta)
        elif meta.task == "exon":
            return encode_exon(embeddings, seq_lengths, meta, self.exon_classifier)
        elif meta.task == "sae":
            return encode_sae(embeddings, seq_lengths, meta, self.sae)
        else:
            raise ValueError(f"Unknown task: {meta.task!r}.")
