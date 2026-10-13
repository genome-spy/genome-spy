import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("point capture rejects excess storage bindings before allocation and leaves the source usable", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark, createPointLassoSelection },
            { ordinalScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/ordinal.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        const device = renderer.device;
        const limit = device.limits.maxStorageBuffersPerShaderStage;
        // Fit the render layout on this device while exceeding its capture budget.
        const channels = Object.fromEntries(
            ["x", "y", "xOffset", "yOffset"]
                .slice(0, Math.floor((limit - 1) / 2))
                .map((name) => [
                    name,
                    {
                        data: new Uint32Array([7]),
                        type: "u32",
                        scale: ordinalScale({ domain: [7], range: [16] }),
                    },
                ])
        );
        device.pushErrorScope("validation");
        const mark = renderer.createMark(pointMark, {
            channels: {
                ...channels,
                uniqueId: { data: new Uint32Array([7]), type: "u32" },
            },
        });
        const markError = await device.popErrorScope();

        const createBuffer = device.createBuffer.bind(device);
        let allocations = 0;
        device.createBuffer = (...args) => {
            allocations++;
            return createBuffer(...args);
        };
        device.pushErrorScope("validation");
        let message;
        let lasso;
        try {
            lasso = createPointLassoSelection(renderer, mark);
        } catch (error) {
            message = error.message;
        } finally {
            device.createBuffer = createBuffer;
        }
        renderer.render();
        await device.queue.onSubmittedWorkDone();
        const captureError = await device.popErrorScope();
        renderer.destroyMark(mark.markId);
        lasso?.destroy();
        renderer.destroy();
        return {
            message,
            limit,
            allocations,
            markError: markError?.message,
            captureError: captureError?.message,
        };
    });
    expect(result.message).toMatch(
        /^Point lasso requires \d+ compute storage buffers;/
    );
    expect(result.message).toContain(`device limit is ${result.limit}.`);
    expect(result.allocations).toBe(0);
    expect(result.markError).toBeUndefined();
    expect(result.captureError).toBeUndefined();
});

test("point-backed lasso captures nonlinear rendered centers without uploads and survives source updates", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark, createPointLassoSelection },
            { logScale },
            { sqrtScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/log.js"),
            import("/src/scales/sqrt.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        const errors = [];
        renderer.device.addEventListener("uncapturederror", (event) =>
            errors.push(event.error.message)
        );
        renderer.device.pushErrorScope("validation");
        const context = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: renderer.device,
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            alphaMode: "premultiplied",
        });
        const mark = renderer.createMark(pointMark, {
            channels: {
                x: {
                    data: new Float32Array([10, 10, 10]),
                    type: "f32",
                    scale: logScale({ domain: [1, 100], range: [0, 64] }),
                },
                y: {
                    data: new Float32Array([16, 36, 25]),
                    type: "f32",
                    scale: sqrtScale({ domain: [0, 100], range: [64, 0] }),
                },
                uniqueId: { data: new Uint32Array([7, 9, 11]), type: "u32" },
                size: { value: 9 },
                strokeWidth: { value: 0 },
                fill: {
                    value: [0, 0, 1, 1],
                    conditions: [
                        {
                            when: {
                                selection: "lasso",
                                type: "multi",
                                empty: false,
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        });
        const queue = renderer.device.queue;
        const writeBuffer = queue.writeBuffer.bind(queue);
        let uploads = 0;
        queue.writeBuffer = (...args) => {
            uploads++;
            writeBuffer(...args);
        };
        const lasso = createPointLassoSelection(renderer, mark);
        queue.writeBuffer = writeBuffer;
        const polygon = [
            [0, 64],
            [64, 64],
            [0, 0],
        ];
        lasso.update(polygon);
        mark.selections.lasso.setGpuTable(lasso.table, true);
        const texture = context.getCurrentTexture();
        renderer.render();
        const staging = renderer.device.createBuffer({
            size: 64 * 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = renderer.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture },
            { buffer: staging, bytesPerRow: 256 },
            { width: 64, height: 64 }
        );
        renderer.device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const pixels = new Uint8Array(staging.getMappedRange());
        const colors = [38, 26, 32].map((y) => {
            const offset = y * 256 + 32 * 4;
            const pixel = Array.from(pixels.subarray(offset, offset + 4));
            return format.startsWith("bgra")
                ? [pixel[2], pixel[1], pixel[0], pixel[3]]
                : pixel;
        });
        staging.destroy();
        const first = await lasso.readIds();
        mark.scales.x.setDomain([1, 1000]);
        mark.series.replace({
            x: new Float32Array([1, 1, 1]),
            y: new Float32Array([100, 100, 100]),
            uniqueId: new Uint32Array([70, 90, 110]),
        });
        const replacement = createPointLassoSelection(renderer, mark);
        replacement.update(polygon);
        const newer = await replacement.readIds();
        renderer.destroyMark(mark.markId);
        lasso.update(polygon);
        const retained = await lasso.readIds();
        const error = await renderer.device.popErrorScope();
        lasso.destroy();
        replacement.destroy();
        renderer.destroy();
        return {
            first: Array.from(first.ids).sort((a, b) => a - b),
            newer: Array.from(newer.ids).sort((a, b) => a - b),
            retained: Array.from(retained.ids).sort((a, b) => a - b),
            colors,
            uploads,
            error: error?.message,
            errors,
        };
    });
    const { colors, ...state } = result;
    expect(state).toEqual({
        first: [7, 11],
        newer: [70, 90, 110],
        retained: [7, 11],
        uploads: 0,
        error: undefined,
        errors: [],
    });
    for (const index of [0, 2]) {
        expect(colors[index][0]).toBeGreaterThan(240);
        expect(colors[index][2]).toBeLessThan(20);
    }
    expect(colors[1][0]).toBeLessThan(20);
    expect(colors[1][2]).toBeGreaterThan(240);
});

test("GPU input snapshots require valid storage and transfer their lifetime to lasso", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const { LassoSelection } = await import("/src/utils/lassoSelection.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const arrays = [
            new Float32Array([0.2, 0.8]),
            new Float32Array([0.2, 0.8]),
            new Uint32Array([7, 9]),
        ];
        const buffers = arrays.map((array) => {
            const buffer = device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(buffer, 0, array);
            return buffer;
        });
        const data = {
            x: buffers[0],
            y: buffers[1],
            ids: buffers[2],
            count: 2,
        };
        const rejected = [];
        for (const count of [-1, 1.5, 3]) {
            try {
                new LassoSelection(device, { ...data, count });
            } catch (error) {
                rejected.push(error.message);
            }
        }
        device.pushErrorScope("validation");
        const lasso = new LassoSelection(device, data);
        lasso.update([
            [0, 0],
            [0.5, 0],
            [0.5, 0.5],
            [0, 0.5],
        ]);
        const selected = await lasso.readIds();
        const error = await device.popErrorScope();
        lasso.destroy();
        // A successful construction transfers the snapshot, so it cannot be submitted again.
        device.pushErrorScope("validation");
        device.queue.writeBuffer(buffers[0], 0, arrays[0]);
        const destroyed = await device.popErrorScope();
        device.destroy();
        return {
            ids: Array.from(selected.ids),
            rejected: rejected.length,
            error: error?.message,
            destroyed: !!destroyed,
        };
    });
    expect(result).toEqual({
        ids: [7],
        rejected: 3,
        error: undefined,
        destroyed: true,
    });
});

test("point snapshots reject unsupported IDs and placement/position ambiguity and accept empty populations", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark, createPointLassoSelection }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        renderer.device.pushErrorScope("validation");
        const idChannel = { data: new Uint32Array([1]), type: "u32" };
        const configs = [
            { channels: {} },
            {
                channels: {
                    uniqueId: {
                        data: new Uint32Array([0xffffffff]),
                        type: "u32",
                    },
                },
            },
            {
                channels: {
                    uniqueId: idChannel,
                    x: {
                        value: 0,
                        scale: undefined,
                        conditions: [
                            {
                                when: { selection: "picked", type: "single" },
                                value: 1,
                            },
                        ],
                    },
                },
            },
            {
                channels: { uniqueId: idChannel },
                placementIndex: { source: "draw" },
            },
        ];
        const rejected = [];
        for (const config of configs) {
            const mark = renderer.createMark(pointMark, {
                ...config,
                channels: {
                    x: { value: 32, scale: undefined },
                    y: { value: 32, scale: undefined },
                    ...config.channels,
                },
            });
            try {
                createPointLassoSelection(renderer, mark);
            } catch (error) {
                rejected.push(error.message);
            }
            renderer.destroyMark(mark.markId);
        }
        const empty = renderer.createMark(pointMark, {
            count: 0,
            channels: {
                x: { value: 32, scale: undefined },
                y: { value: 32, scale: undefined },
                uniqueId: { data: new Uint32Array(), type: "u32" },
            },
        });
        const lasso = createPointLassoSelection(renderer, empty);
        lasso.update([
            [0, 0],
            [64, 64],
            [0, 64],
        ]);
        const ids = await lasso.readIds();
        renderer.destroyMark(empty.markId);
        lasso.destroy();
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        return { rejected, empty: ids.ids.length, error: error?.message };
    });
    expect(result).toEqual({
        rejected: [
            "Point lasso requires an unscaled u32 ID series excluding 0xffffffff.",
            "Point lasso requires an unscaled u32 ID series excluding 0xffffffff.",
            "Point lasso does not support conditional positions or repeated placements.",
            "Point lasso does not support conditional positions or repeated placements.",
        ],
        empty: 0,
        error: undefined,
    });
});

test("compute lasso builds the renderable hash layout and reads revision snapshots", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const { LassoSelection } = await import("/src/utils/lassoSelection.js");
        const { default: hash, emitHashLookupFunction } =
            await import("/src/wgsl/hashTable.wgsl.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const errors = [];
        device.addEventListener("uncapturederror", (event) =>
            errors.push(event.error.message)
        );
        device.pushErrorScope("validation");
        // Deliberate duplicate identities exercise contention and set deduplication.
        const ids = new Uint32Array([1, 2, 3, 4, 1]);
        const lasso = new LassoSelection(device, {
            x: new Float32Array([0.2, 0.8, 0, 0.5, 0.2]),
            y: new Float32Array([0.2, 0.8, 0.3, 0.5, 0.2]),
            ids,
        });
        const table = lasso.table;
        lasso.update([
            [0, 0],
            [0.5, 0],
            [0.5, 0.5],
            [0, 0.5],
        ]);
        const first = lasso.readIds();
        lasso.update([
            [0.7, 0.7],
            [1, 0.7],
            [1, 1],
            [0.7, 1],
        ]);
        const second = await lasso.readIds();
        const earlier = await first;
        const pairsCorrect = [earlier, second].every((snapshot) =>
            snapshot.ids.every((id, i) => ids[snapshot.indices[i]] === id)
        );
        lasso.update([
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
        ]);
        const empty = await lasso.readIds();
        lasso.clear();
        const cleared = await lasso.readIds();
        lasso.update([
            [0.7, 0.7],
            [1, 0.7],
            [1, 1],
            [0.7, 1],
        ]);
        const stable = table === lasso.takeTable();
        let transferredUpdateRejected = false;
        try {
            lasso.clear();
        } catch {
            transferredUpdateRejected = true;
        }
        // Committed shader membership outlives the captured positions and readback buffers.
        lasso.destroy();
        // Existing render shaders consume exactly this readonly HashEntry layout.
        const output = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const staging = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        const module = device.createShaderModule({
            code:
                hash +
                `
            @group(0) @binding(0) var<storage,read> entries: array<HashEntry>;
            @group(0) @binding(1) var<storage,read_write> output: array<u32>;
            ${emitHashLookupFunction("entries")}
            @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                output[gid.x] = hashLookup_entries(gid.x + 1u, arrayLength(&entries));
            }
        `,
        });
        const pipeline = device.createComputePipeline({
            layout: "auto",
            compute: { module, entryPoint: "main" },
        });
        const group = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: table } },
                { binding: 1, resource: { buffer: output } },
            ],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(1);
        pass.end();
        encoder.copyBufferToBuffer(output, 0, staging, 0, 16);
        device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const lookup = Array.from(new Uint32Array(staging.getMappedRange()));
        staging.destroy();
        output.destroy();
        const error = await device.popErrorScope();
        table.destroy();
        lasso.destroy();
        lasso.destroy();
        device.destroy();
        return {
            first: Array.from(earlier.ids).sort(),
            second: Array.from(second.ids),
            lookup,
            ordered: earlier.revision < second.revision,
            empty: empty.ids.length,
            cleared: cleared.ids.length,
            stable,
            pairsCorrect,
            transferredUpdateRejected,
            error: error?.message,
            errors,
        };
    });
    expect(result).toEqual({
        first: [1, 3, 4],
        second: [2],
        lookup: [0xffffffff, 1, 0xffffffff, 0xffffffff],
        ordered: true,
        empty: 0,
        cleared: 0,
        stable: true,
        pairsCorrect: true,
        transferredUpdateRejected: true,
        error: undefined,
        errors: [],
    });
});

test("fully selected population exercises hash collisions and multidimensional dispatch", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const { LassoSelection } = await import("/src/utils/lassoSelection.js");
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        device.pushErrorScope("validation");
        // Force small 2D dispatches while keeping real GPU pipelines and buffers.
        const computeDevice = new Proxy(device, {
            get(target, key) {
                if (key === "limits")
                    return {
                        maxBufferSize: target.limits.maxBufferSize,
                        maxStorageBufferBindingSize:
                            target.limits.maxStorageBufferBindingSize,
                        maxComputeWorkgroupsPerDimension: 64,
                    };
                const value = Reflect.get(target, key, target);
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        const count = 10000;
        const ids = Uint32Array.from({ length: count }, (_, i) => i * 1009 + 1);
        const lasso = new LassoSelection(computeDevice, {
            x: new Float32Array(count).fill(0.5),
            y: new Float32Array(count).fill(0.5),
            ids,
        });
        lasso.update([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ]);
        const selected = await lasso.readIds();
        const equal =
            selected.ids.length === ids.length &&
            selected.ids.sort().every((id, i) => id === ids[i]);
        const error = await device.popErrorScope();
        lasso.destroy();
        device.destroy();
        return { equal, error: error?.message };
    });
    expect(result).toEqual({ equal: true, error: undefined });
});

test("borrowed compute table drives conditional point color and remains caller-owned", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { linearScale },
            { LassoSelection },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/linear.js"),
            import("/src/utils/lassoSelection.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        const context = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: renderer.device,
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        renderer.updateGlobals({ width: 64, height: 64, dpr: 1 });
        const x = new Float32Array([0.25, 0.75]);
        const y = new Float32Array([0.25, 0.75]);
        const ids = new Uint32Array([1, 2]);
        const lasso = new LassoSelection(renderer.device, { x, y, ids });
        const mark = renderer.createMark(pointMark, {
            channels: {
                x: {
                    data: x,
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                y: {
                    data: y,
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                uniqueId: { data: ids, type: "u32" },
                size: { value: 100 },
                fill: {
                    value: [0, 0, 1, 1],
                    conditions: [
                        {
                            when: {
                                selection: "lasso",
                                type: "multi",
                                empty: false,
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        });
        renderer.device.pushErrorScope("validation");
        lasso.update([
            [0, 0],
            [0.5, 0],
            [0.5, 0.5],
            [0, 0.5],
        ]);
        mark.selections.lasso.setGpuTable(lasso.table, true);
        const texture = context.getCurrentTexture();
        renderer.render();
        const read = renderer.device.createBuffer({
            size: 64 * 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = renderer.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture },
            { buffer: read, bytesPerRow: 256 },
            { width: 64, height: 64 }
        );
        renderer.device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(read.getMappedRange());
        const pixel = (x, y) => {
            const offset = y * 256 + x * 4;
            const p = Array.from(bytes.subarray(offset, offset + 4));
            return format.startsWith("bgra") ? [p[2], p[1], p[0], p[3]] : p;
        };
        const red = pixel(16, 16);
        const blue = pixel(48, 48);
        read.destroy();
        renderer.destroyMark(mark.markId);
        // Recompute after mark destruction: readback alone would not exercise the hash buffer.
        lasso.update([
            [0, 0],
            [0.5, 0],
            [0.5, 0.5],
            [0, 0.5],
        ]);
        const selected = await lasso.readIds();
        const error = await renderer.device.popErrorScope();
        lasso.destroy();
        renderer.destroy();
        return {
            red,
            blue,
            ids: Array.from(selected.ids),
            error: error?.message,
        };
    });
    expect(result).toEqual({
        red: [255, 0, 0, 255],
        blue: [0, 0, 255, 255],
        ids: [1],
        error: undefined,
    });
});
