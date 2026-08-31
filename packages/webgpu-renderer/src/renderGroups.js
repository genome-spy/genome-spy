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

const MAX_FREE_TEXTURES = 8;
const MAX_FREE_SAMPLE_PIXELS = 16_777_216;

/** Renderer-owned pool for short-lived color attachments. */
export class TransientTexturePool {
    /** @param {GPUDevice} device @param {GPUTextureFormat} format */
    constructor(device, format) {
        this.device = device;
        this.format = format;
        /** @type {TransientTexture[]} */
        this.free = [];
        this.freeCost = 0;
        /** @type {Set<TransientTexture>} */
        this.all = new Set();
        /** @type {TransientTexture[]} */
        this.pendingDestroy = [];
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {1 | 4} sampleCount
     * @param {GPUTextureUsageFlags} usage
     * @returns {TransientTexture}
     */
    acquire(width, height, sampleCount, usage) {
        const key = `${width}x${height}:${sampleCount}:${usage}`;
        const freeIndex = this.free.findLastIndex((entry) => entry.key === key);
        if (freeIndex >= 0) {
            const pooled = this.free.splice(freeIndex, 1)[0];
            this.freeCost -= pooled.cost;
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
            usage,
        });
        const entry = {
            key,
            texture,
            view: texture.createView({
                label: gpuLabel(RENDERER_GPU_OWNER, "transient color view"),
            }),
            cost: width * height * sampleCount,
        };
        this.all.add(entry);
        return entry;
    }

    /** @param {TransientTexture} entry */
    release(entry) {
        if (entry.cost > MAX_FREE_SAMPLE_PIXELS) {
            this.#evict(entry);
            return;
        }
        this.free.push(entry);
        this.freeCost += entry.cost;
        while (
            this.free.length > MAX_FREE_TEXTURES ||
            this.freeCost > MAX_FREE_SAMPLE_PIXELS
        ) {
            const evicted = this.free.shift();
            this.freeCost -= evicted.cost;
            this.#evict(evicted);
        }
    }

    /** Destroys textures that have been removed from the reuse pool. */
    destroyEvicted() {
        for (const entry of this.pendingDestroy) {
            entry.texture.destroy();
        }
        this.pendingDestroy.length = 0;
    }

    destroy() {
        for (const entry of this.all) {
            entry.texture.destroy();
        }
        this.all.clear();
        this.free.length = 0;
        this.freeCost = 0;
        this.destroyEvicted();
    }

    /** @param {TransientTexture} entry */
    #evict(entry) {
        this.all.delete(entry);
        this.pendingDestroy.push(entry);
    }
}

/** Encodes premultiplied-alpha texture composition. */
export class TextureCompositor {
    /** @param {GPUDevice} device @param {GPUTextureFormat} format */
    constructor(device, format) {
        this.device = device;
        this.stride = Math.max(
            16,
            device.limits?.minUniformBufferOffsetAlignment ?? 256
        );
        this.capacity = 1;
        this.buffer = this.#createBuffer(this.capacity);
        this.staging = new Float32Array((this.capacity * this.stride) / 4);
        this.count = 0;

        this.layout = device.createBindGroupLayout({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite bind group layout"),
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
            ],
        });
        const module = device.createShaderModule({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite shader"),
            code: COMPOSITE_SHADER,
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
     * @param {GPUTextureView} view
     * @param {number} opacity
     * @returns {GPUBindGroup}
     */
    createBinding(view, opacity) {
        const index = this.count++;
        this.staging[(index * this.stride) / 4] = opacity;
        return this.device.createBindGroup({
            label: gpuLabel(RENDERER_GPU_OWNER, "composite bind group"),
            layout: this.layout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.buffer,
                        offset: index * this.stride,
                        size: 16,
                    },
                },
                { binding: 1, resource: view },
            ],
        });
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
 * Rounds logical bounds outward to complete physical pixels.
 *
 * @param {import("./index.d.ts").DrawRect} bounds
 * @param {import("./index.d.ts").GlobalUniforms} globals
 */
export function normalizeGroupBounds(bounds, globals) {
    const x = Math.max(0, Math.floor(bounds.x * globals.dpr));
    const y = Math.max(0, Math.floor(bounds.y * globals.dpr));
    const right = Math.min(
        Math.ceil(globals.width * globals.dpr),
        Math.ceil((bounds.x + bounds.width) * globals.dpr)
    );
    const bottom = Math.min(
        Math.ceil(globals.height * globals.dpr),
        Math.ceil((bounds.y + bounds.height) * globals.dpr)
    );
    return {
        width: Math.max(0, right - x),
        height: Math.max(0, bottom - y),
        logicalX: x / globals.dpr,
        logicalY: y / globals.dpr,
    };
}

/**
 * @typedef {object} TransientTexture
 * @property {string} key
 * @property {GPUTexture} texture
 * @property {GPUTextureView} view
 * @property {number} cost
 */
