const SHADER = /* wgsl */ `
@group(0) @binding(0) var base: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> total: array<u32>;
@group(0) @binding(2) var<storage, read> selected: array<u32>;
struct Appearance { neutral: vec4<f32>, highlight: vec4<f32>, viewport: vec4<f32> };
@group(0) @binding(3) var<uniform> appearance: Appearance;

@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(p[i], 0.0, 1.0);
}
@fragment fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(base));
    let pixel = vec2<i32>(position.xy);
    let original = textureLoad(base, pixel, 0);
    let local = pixel - vec2<i32>(appearance.viewport.xy);
    let grid = vec2<i32>(appearance.viewport.zw);
    if (any(local < vec2<i32>(0)) || any(local >= grid)) { return original; }
    var counts = vec2<f32>(0.0);
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let p = local + vec2<i32>(x, y);
            if (all(p >= vec2<i32>(0)) && all(p < grid)) {
                let i = u32(p.y * grid.x + p.x);
                let weight = f32((2 - abs(x)) * (2 - abs(y)));
                counts += vec2<f32>(f32(total[i]), f32(selected[i])) * weight;
            }
        }
    }
    if (counts.y == 0.0) { return original; }
    let fraction = clamp(counts.y / counts.x, 0.0, 1.0);
    let contrast = vec3<f32>(1.0) - appearance.neutral.rgb;
    let coverage = clamp(dot(vec3<f32>(1.0) - original.rgb, contrast) / dot(contrast, contrast), 0.0, 1.0);
    let color = mix(appearance.neutral.rgb, appearance.highlight.rgb, fraction);
    return vec4<f32>(mix(vec3<f32>(1.0), color, coverage), original.a);
}
`;

/** Image-only density preview for uniform-color points on opaque white. */
export class LassoImage {
    /** @param {HTMLCanvasElement} canvas @param {import("./lassoSelection.js").LassoSelection} lasso
     * @param {{neutral?: readonly number[], highlight?: readonly number[], alphaMode?: GPUCanvasAlphaMode, format?: GPUTextureFormat}} [options] */
    constructor(
        canvas,
        lasso,
        {
            neutral = [0.4, 0.46, 0.55],
            highlight = [1, 0.35, 0.05],
            alphaMode = "premultiplied",
            format = navigator.gpu.getPreferredCanvasFormat(),
        } = {}
    ) {
        if (
            neutral.length < 3 ||
            highlight.length < 3 ||
            ![...neutral, ...highlight].every(
                (v) => Number.isFinite(v) && v >= 0 && v <= 1
            ) ||
            neutral.slice(0, 3).every((value) => value === 1)
        )
            throw new Error(
                "Density colors require finite RGB components and a neutral fill different from white."
            );
        this.canvas = canvas;
        this.lasso = lasso;
        this.device = lasso.device;
        this.context = canvas.getContext("webgpu");
        this.format = format;
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this.appearance = this.device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            this.appearance,
            0,
            new Float32Array([
                ...neutral.slice(0, 3),
                1,
                ...highlight.slice(0, 3),
                1,
            ])
        );
        const module = this.device.createShaderModule({ code: SHADER });
        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: { module, entryPoint: "vertex" },
            fragment: {
                module,
                entryPoint: "fragment",
                targets: [{ format: this.format }],
            },
        });
    }

    /** @type {GPUTexture | undefined} */
    base;

    /** @type {GPUBindGroup} */
    binding;

    /**
     * Capture immediately after drawing; the host owns scene invalidation.
     * @param {() => void} draw
     * @param {readonly [number,number,number,number]} [view]
     * @param {readonly [number,number,number,number]} [viewport] Physical canvas rectangle.
     * @param {readonly [number,number,number,number]} [bounds] Eligible point centers.
     */
    capture(
        draw,
        view,
        viewport = [0, 0, this.canvas.width, this.canvas.height],
        bounds
    ) {
        const { width, height } = this.canvas;
        if (
            width > this.device.limits.maxTextureDimension2D ||
            height > this.device.limits.maxTextureDimension2D
        )
            throw new Error("Lasso image exceeds device texture limits.");
        if (
            viewport.some((v) => !Number.isSafeInteger(v)) ||
            viewport[0] < 0 ||
            viewport[1] < 0 ||
            viewport[0] + viewport[2] > width ||
            viewport[1] + viewport[3] > height
        )
            throw new Error("Density viewport must be inside the canvas.");
        const density = this.lasso.setDensityGrid(
            viewport[2],
            viewport[3],
            view,
            bounds
        );
        this.device.queue.writeBuffer(
            this.appearance,
            32,
            new Float32Array(viewport)
        );
        this.base?.destroy();
        this.base = this.device.createTexture({
            size: [width, height],
            format: this.format,
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.binding = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.base.createView() },
                { binding: 1, resource: { buffer: density.total } },
                { binding: 2, resource: { buffer: density.selected } },
                { binding: 3, resource: { buffer: this.appearance } },
            ],
        });
        draw();
        const encoder = this.device.createCommandEncoder();
        encoder.copyTextureToTexture(
            { texture: this.context.getCurrentTexture() },
            { texture: this.base },
            [width, height]
        );
        this.device.queue.submit([encoder.finish()]);
    }

    render() {
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            label: "lasso image",
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.binding);
        pass.draw(3);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    destroy() {
        this.base?.destroy();
        this.appearance.destroy();
    }
}
