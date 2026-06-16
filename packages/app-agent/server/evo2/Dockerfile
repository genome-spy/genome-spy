# EVO2 Variant Effect Prediction Server
#
# Targets the evo2_7b model (no TransformerEngine / FP8 required).
# For 20B or 40B models, switch to a full TransformerEngine install; see README.
#
# Base image: NVIDIA NGC PyTorch — includes PyTorch + CUDA + flash-attn compiled
# for all current GPU architectures including Blackwell (GB10, sm_121).
# Update the tag to the latest NGC release as needed: nvcr.io/nvidia/pytorch:YY.MM-py3
#
# Build:
#   docker build -t genomespy-evo2-server .
#
# Run (see docker-compose.yml for the full demo setup):
#   docker run --gpus all \
#     -p 8001:8001 \
#     -v ~/.cache/huggingface:/root/.cache/huggingface \
#     -v /path/to/hg19.fa:/data/ref/hg19.fa \
#     -e EVO2_MODEL_NAME=evo2_7b \
#     genomespy-evo2-server

FROM nvcr.io/nvidia/pytorch:25.06-py3

ENV PYTHONUNBUFFERED=1

# EVO2 and pipeline dependencies — keep this layer stable so Docker cache is reused.
# PyTorch, CUDA, cuDNN, and flash-attn are already provided by the base image.
RUN pip install --no-cache-dir \
    evo2 \
    "transformers>=4.40.0,<5.0.0" \
    fastapi>=0.115.0 \
    "uvicorn[standard]>=0.32.0" \
    pydantic>=2.9.0 \
    numpy>=1.23 \
    pyfaidx>=0.8.0 \
    pandas \
    matplotlib \
    seaborn \
    tqdm

# Server framework — separate layer so it can be updated without re-installing evo2.
RUN pip install --no-cache-dir litserve

WORKDIR /app
COPY src/ .

# HuggingFace model weights are NOT baked into the image.
# Mount ~/.cache/huggingface as a volume so weights persist across restarts.
VOLUME ["/root/.cache/huggingface", "/data/ref"]

EXPOSE 8001

CMD ["python", "server.py"]
