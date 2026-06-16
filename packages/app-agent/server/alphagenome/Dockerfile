# GenomeSpy AlphaGenome Inference Server
#
# Serves AlphaGenome predictions (ATAC, DNase, CAGE, RNA-seq, ChIP, …) from
# 131 072 bp DNA sequences. No reference genome is needed server-side — the
# client (GenomeSpy) supplies sequences directly.
#
# Base image: NVIDIA NGC PyTorch — PyTorch + CUDA + cuDNN pre-compiled for all
# current GPU architectures. Update the tag to the latest NGC release as needed:
#   nvcr.io/nvidia/pytorch:YY.MM-py3
#
# Build:
#   docker build -t genomespy-alphagenome-server .
#
# Run (see docker-compose.yml for the full setup):
#   docker run --gpus all -p 8002:8002 genomespy-alphagenome-server

FROM nvcr.io/nvidia/pytorch:25.06-py3

ENV PYTHONUNBUFFERED=1

# Model and server dependencies — keep this layer stable so Docker cache is reused.
# PyTorch, CUDA, cuDNN are already provided by the base image.
RUN pip install --no-cache-dir \
    alphagenome-pytorch \
    safetensors \
    huggingface_hub \
    fastapi>=0.115.0 \
    "uvicorn[standard]>=0.32.0" \
    pydantic>=2.9.0 \
    numpy>=1.23

# LitServe separate so it can be updated without re-installing the model package.
RUN pip install --no-cache-dir litserve

WORKDIR /app
COPY src/ .

# Model weights are NOT baked into the image.
# Mount ~/.cache/huggingface as a volume so weights persist across restarts.
VOLUME ["/root/.cache/huggingface"]

EXPOSE 8002

CMD ["python", "server.py"]
