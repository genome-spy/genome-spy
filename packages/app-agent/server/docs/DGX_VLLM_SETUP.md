# DGX Spark + vLLM Setup

This guide covers only the DGX-side setup:

- prepare DGX Spark for vLLM
- use `spark-vllm-docker`
- download models onto the DGX
- launch `vllm serve`
- verify that the model server is healthy

It does not cover local relay development or SSH tunneling. Those live in
[`DGX_VLLM_REMOTE_DEV.md`](./DGX_VLLM_REMOTE_DEV.md).

## What We Have Been Running

The main models used so far are:

- `Qwen3.6-35B-A3B` with DFlash
- `Qwen3.6-27B` with DFlash

In our use, the 35B MoE model has been significantly faster in throughput than
the 27B dense model, peaking around `50 tokens/s`.

## Use `spark-vllm-docker`

We have been using the upstream repository
[`eugr/spark-vllm-docker`](https://github.com/eugr/spark-vllm-docker) to set up
vLLM on DGX Spark.

Its README describes the recommended single-node flow as:

- clone the repo
- build the container with `./build-and-copy.sh`
- launch in solo mode with `./launch-cluster.sh --solo exec ...`

The same README also notes that the repository downloads prebuilt nightly vLLM
and FlashInfer wheels by default unless you explicitly request a source build.
Source: [`spark-vllm-docker` README](https://github.com/eugr/spark-vllm-docker)

## Clone and Build

On the DGX:

```bash
git clone https://github.com/eugr/spark-vllm-docker.git
cd spark-vllm-docker
./build-and-copy.sh
```

## Download Models Locally on the DGX

We have been downloading the checkpoints onto the DGX first and then mounting
those local directories into the container.

Example environment:

```bash
export HF_TOKEN=<hf_token>
```

In our setup, the mounted model directory has been:

```text
$HOME/vllm_venv/models
```

Example `hf` download commands for the main model checkpoints:

```bash
hf download Qwen/Qwen3.6-35B-A3B-FP8 \
  --local-dir ./models/Qwen3.6-35B-A3B-FP8

hf download Qwen/Qwen3.6-35B-A3B-NVFP4 \
  --local-dir ./models/Qwen3.6-35B-A3B-NVFP4

hf download Qwen/Qwen3.6-27B-FP8 \
  --local-dir ./models/Qwen3.6-27B-FP8
```

Example `hf` download commands for the DFlash drafters:

```bash
hf download z-lab/Qwen3.6-35B-A3B-DFlash \
  --local-dir ./models/Qwen3.6-35B-A3B-DFlash

hf download z-lab/Qwen3.6-27B-DFlash \
  --local-dir ./models/Qwen3.6-27B-DFlash
```

The main checkpoint and the DFlash drafter are downloaded separately. For the
speculative-decoding runs above, both directories must exist locally because
the launch command mounts one as the served model and the other inside
`--speculative-config`. If you are not using speculative decoding, only the
main model checkpoint is needed.

For tuned configs, we have also mounted:

```text
$HOME/vllm_venv/tuned_configs
```

These tuned configs are not model weights and they are not GenomeSpy relay
configuration. They are vLLM runtime tuning files for specific hardware and
model shapes, typically used to select or override low-level kernel settings
such as block shapes for a given device, dtype, or expert layout.

In practice, we use them because some DGX Spark model setups run better with
explicit tuned kernels than with generic defaults. When a matching tuned config
is available, vLLM can pick a faster or more stable execution path for that
exact model and hardware combination. That matters most for the larger Qwen
3.6 checkpoints and speculative decoding setups where throughput is sensitive
to kernel choice.

That is why the FP8 MoE command mounts:

- `$HOME/vllm_venv/tuned_configs:/tuned_configs`
- `VLLM_TUNED_CONFIG_FOLDER=/tuned_configs`

If you do not have tuned configs for your model or device, you can omit that
mount and environment variable and start with the generic vLLM defaults.

## Start vLLM on the DGX

The commands below are the ones we have actually used.

### 35B MoE FP8 + DFlash

```bash
VLLM_SPARK_EXTRA_DOCKER_ARGS="-e VLLM_MARLIN_USE_ATOMIC_ADD=1 -e HF_HUB_OFFLINE=1 -e VLLM_TUNED_CONFIG_FOLDER=/tuned_configs -v $HOME/vllm_venv/models:/models -v $HOME/vllm_venv/tuned_configs:/tuned_configs" \
./launch-cluster.sh --solo \
    --apply-mod mods/fix-qwen3.6-chat-template \
    exec vllm serve /models/Qwen3.6-35B-A3B-FP8 \
        --served-model-name Qwen3.6-35B-A3B \
        --host 0.0.0.0 \
        --port 8000 \
        --language-model-only \
        --max-model-len 262144 \
        --gpu-memory-utilization 0.8 \
        --reasoning-parser qwen3 \
        --enable-auto-tool-choice \
        --tool-call-parser qwen3_coder \
        --default-chat-template-kwargs '{"enable_thinking":false,"preserve_thinking":false}' \
        --attention-backend flash_attn \
        --max-num-batched-tokens 16384 \
        --max-num-seqs 1 \
        --stream-interval 5 \
        --max-cudagraph-capture-size 160 \
        --mamba-ssm-cache-dtype float16 \
        --enable-chunked-prefill \
        --enable-prefix-caching \
        --override-generation-config '{"temperature":0.0,"top_p":0.9,"top_k":20,"presence_penalty":1.5,"repetition_penalty":1.0}' \
        --speculative-config '{"method":"dflash","model":"/models/Qwen3.6-35B-A3B-DFlash","num_speculative_tokens":10}'
```

### 35B MoE NVFP4 + DFlash

```bash
VLLM_SPARK_EXTRA_DOCKER_ARGS="-e VLLM_MARLIN_USE_ATOMIC_ADD=1 -e HF_HUB_OFFLINE=1 -v $HOME/vllm_venv/models:/models" \
./launch-cluster.sh --solo \
    --apply-mod mods/fix-qwen3.6-chat-template \
    exec vllm serve /models/Qwen3.6-35B-A3B-NVFP4 \
        --served-model-name Qwen3.6-35B-A3B \
        --host 0.0.0.0 \
        --port 8000 \
        --language-model-only \
        --max-model-len 262144 \
        --gpu-memory-utilization 0.8 \
        --reasoning-parser qwen3 \
        --enable-auto-tool-choice \
        --tool-call-parser qwen3_coder \
        --default-chat-template-kwargs '{"enable_thinking":false,"preserve_thinking":false}' \
        --attention-backend flash_attn \
        --max-num-batched-tokens 16384 \
        --max-num-seqs 2 \
        --stream-interval 5 \
        --max-cudagraph-capture-size 160 \
        --mamba-ssm-cache-dtype float16 \
        --enable-chunked-prefill \
        --enable-prefix-caching \
        --override-generation-config '{"temperature":0.0,"top_p":0.9,"top_k":20,"presence_penalty":1.5,"repetition_penalty":1.0}' \
        --speculative-config '{"method":"dflash","model":"/models/Qwen3.6-35B-A3B-DFlash","num_speculative_tokens":10}'
```

### 27B dense FP8 + DFlash

```bash
VLLM_SPARK_EXTRA_DOCKER_ARGS="-e VLLM_MARLIN_USE_ATOMIC_ADD=1 -e HF_HUB_OFFLINE=1 -v $HOME/vllm_venv/models:/models" \
./launch-cluster.sh --solo \
    --apply-mod mods/fix-qwen3.6-chat-template \
    exec vllm serve /models/Qwen3.6-27B-FP8 \
        --served-model-name Qwen3.6-27B \
        --host 0.0.0.0 \
        --port 8000 \
        --language-model-only \
        --max-model-len 262144 \
        --gpu-memory-utilization 0.8 \
        --reasoning-parser qwen3 \
        --enable-auto-tool-choice \
        --tool-call-parser qwen3_coder \
        --default-chat-template-kwargs '{"enable_thinking":false,"preserve_thinking":false}' \
        --attention-backend flash_attn \
        --max-num-batched-tokens 16384 \
        --max-num-seqs 8 \
        --stream-interval 5 \
        --max-cudagraph-capture-size 160 \
        --mamba-ssm-cache-dtype float16 \
        --enable-chunked-prefill \
        --enable-prefix-caching \
        --override-generation-config '{"temperature":0.0,"top_p":1.0,"top_k":20,"presence_penalty":1.5,"repetition_penalty":1.0}' \
        --speculative-config '{"method":"dflash","model":"/models/Qwen3.6-27B-DFlash","num_speculative_tokens":10}'
```

## Inspect the Running Container

If you need to inspect the runtime environment:

```bash
docker exec -it vllm_node bash
```

## Verify vLLM

From the DGX shell:

```bash
curl -s http://127.0.0.1:8000/v1/models
```

For metrics:

```bash
curl -s http://127.0.0.1:8000/metrics | rg '^vllm:'
```

## Troubleshooting

- `Free memory on device ... is less than desired GPU memory utilization`
  - vLLM wants more VRAM than is currently available.
  - Fix: lower `--gpu-memory-utilization`, for example from `0.8` to `0.75`.

- `vllm: command not found`
  - The binary is not available in that shell inside the DGX container or host.
  - Fix: confirm you are using the `spark-vllm-docker` launcher flow or open a
    shell inside the running container with `docker exec -it vllm_node bash`.

- `Failed to infer device type`
  - vLLM cannot see a usable CUDA runtime from that shell.
  - Fix: launch through the known-working DGX container flow instead of trying
    to run a mismatched host-side installation.

- Tool use is malformed or missing
  - Tool parsing and chat-template behavior may vary by model build.
  - Fix: keep the Qwen chat-template mod and the explicit tool parser settings
    aligned with the launch commands above.

## Next Step

Once the DGX-side model server is running, continue with
[`DGX_VLLM_REMOTE_DEV.md`](./DGX_VLLM_REMOTE_DEV.md) for:

- SSH access from another machine
- local relay configuration
- local GenomeSpy app setup
- end-to-end remote development workflow
