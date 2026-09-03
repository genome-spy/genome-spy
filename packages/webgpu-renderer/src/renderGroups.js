import { gpuLabel, RENDERER_GPU_OWNER } from "./utils/gpuLabel.js";

const COMPOSITE_SHADER = /* wgsl */ `
struct CompositeParams {
    opacity: f32,
}

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var source: texture_2d<f32>;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
    let positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0)
    );
    let uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(1.0, 0.0)
    );
    var out: VertexOut;
    out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    out.uv = uvs[vertexIndex];
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let dimensions = textureDimensions(source);
    let pixel = min(
        vec2<i32>(in.uv * vec2<f32>(dimensions)),
        vec2<i32>(dimensions) - vec2<i32>(1)
    );
    return textureLoad(source, pixel, 0) * params.opacity;
}
`;

const TEXTURE_IDLE_TIMEOUT_MS = 5_000;

/** Renderer-owned pool for short-lived color attachments. */
export class TransientTexturePool {
    /** @param {GPUDevice} device @param {GPUTextureFormat} format */
    constructor(device, format) {
        this.device = device;
        this.format = format;
        /** @type {TransientTexture[]} */
        this.free = [];
        /** @type {Set<TransientTexture>} */
        this.all = new Set();
        this.generation = 0;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        this.idleTimer = undefined;
    }

    beginFrame() {
        this.generation++;
        this.#cancelIdleCleanup();
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {1 | 4} sampleCount
     * @returns {TransientTexture}
     */
    acquire(width, height, sampleCount) {
        const key = `${width}x${height}:${sampleCount}`;
        const freeIndex = this.free.findLastIndex((entry) => entry.key === key);
        if (freeIndex >= 0) {
            const pooled = this.free.splice(freeIndex, 1)[0];
            pooled.generation = this.generation;
            return pooled;
        }

        const texture = this.device.createTexture({
            label: gpuLabel(
                RENDERER_GPU_OWNER,
                `transient ${width}x${height} ${sampleCount}x color`
            ),
            size: { width, height },
            format: this.format,
            sampleCount,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                (sampleCount === 1 ? GPUTextureUsage.TEXTURE_BINDING : 0),
        });
        const entry = /** @type {TransientTexture} */ ({
            key,
            texture,
            view: texture.createView({
                label: gpuLabel(RENDERER_GPU_OWNER, "transient color view"),
            }),
            generation: this.generation,
            compositeBinding: null,
        });
        this.all.add(entry);
        return entry;
    }

    /** @param {TransientTexture} entry */
    release(entry) {
        this.free.push(entry);
    }

    endFrame() {
        for (let i = this.free.length - 1; i >= 0; i--) {
            const entry = this.free[i];
            if (entry.generation !== this.generation) {
                this.free.splice(i, 1);
                this.#destroyEntry(entry);
            }
        }
        this.#scheduleIdleCleanup();
    }

    destroy() {
        this.#cancelIdleCleanup();
        for (const entry of this.all) {
            entry.texture.destroy();
        }
        this.all.clear();
        this.free.length = 0;
    }

    /** @param {TransientTexture} entry */
    #destroyEntry(entry) {
        this.all.delete(entry);
        entry.texture.destroy();
    }

    #scheduleIdleCleanup() {
        this.#cancelIdleCleanup();
        if (this.free.length === 0) {
            return;
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            for (const entry of this.free) {
                this.#destroyEntry(entry);
            }
            this.free.length = 0;
        }, TEXTURE_IDLE_TIMEOUT_MS);
    }

    #cancelIdleCleanup() {
        if (this.idleTimer !== undefined) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }
}

/** Encodes premultiplied-alpha texture composition. */
export class TextureCompositor {
    /** @param {GPUDevice} device @param {GPUTextureFormat} format */
    constructor(device, format) {
        this.device = device;
        this.stride = Math.max(
            16,
            device.limits.minUniformBufferOffsetAlignment
        );
        this.capacity = 1;
        this.buffer = this.#createBuffer(this.capacity);
        this.staging = new Float32Array((this.capacity * this.stride) / 4);
        this.count = 0;

        const module = device.createShaderModule({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite shader"),
            code: COMPOSITE_SHADER,
        });
        this.layout = device.createBindGroupLayout({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite bind group layout"),
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                        hasDynamicOffset: true,
                        minBindingSize: 16,
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d",
                        multisampled: false,
                    },
                },
            ],
        });
        this.pipeline = device.createRenderPipeline({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite pipeline"),
            layout: device.createPipelineLayout({
                label: gpuLabel(
                    RENDERER_GPU_OWNER,
                    "composite pipeline layout"
                ),
                bindGroupLayouts: [this.layout],
            }),
            vertex: { module, entryPoint: "vs_main" },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [
                    {
                        format,
                        blend: {
                            color: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { topology: "triangle-list" },
        });
    }

    /** @param {number} capacity */
    prepare(capacity) {
        if (capacity > this.capacity) {
            let next = this.capacity;
            while (next < capacity) {
                next *= 2;
            }
            const old = this.buffer;
            this.capacity = next;
            this.buffer = this.#createBuffer(next);
            this.staging = new Float32Array((next * this.stride) / 4);
            old.destroy();
        }
        this.count = 0;
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {TransientTexture} source
     * @param {number} opacity
     */
    bind(pass, source, opacity) {
        const index = this.count++;
        this.staging[(index * this.stride) / 4] = opacity;
        let binding = source.compositeBinding;
        if (binding === null || binding.buffer !== this.buffer) {
            binding = {
                buffer: this.buffer,
                bindGroup: this.device.createBindGroup({
                    label: gpuLabel(RENDERER_GPU_OWNER, "composite bind group"),
                    layout: this.layout,
                    entries: [
                        {
                            binding: 0,
                            resource: {
                                buffer: this.buffer,
                                size: 16,
                            },
                        },
                        { binding: 1, resource: source.view },
                    ],
                }),
            };
            source.compositeBinding = binding;
        }
        pass.setBindGroup(0, binding.bindGroup, [index * this.stride]);
    }

    flush() {
        if (this.count) {
            this.device.queue.writeBuffer(
                this.buffer,
                0,
                this.staging.buffer,
                0,
                this.count * this.stride
            );
        }
    }

    destroy() {
        this.buffer.destroy();
    }

    /** @param {number} capacity */
    #createBuffer(capacity) {
        return this.device.createBuffer({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite uniforms"),
            size: capacity * this.stride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
}

/**
 * @typedef {object} TransientTexture
 * @property {string} key
 * @property {GPUTexture} texture
 * @property {GPUTextureView} view
 * @property {number} generation Last frame in which the texture was acquired.
 * @property {{buffer: GPUBuffer, bindGroup: GPUBindGroup} | null} compositeBinding
 */
