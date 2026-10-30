import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("integer input sets retain zero, typed inputs, and series across updates", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
        renderer.context.configure({
            device: renderer.device,
            format: renderer.format,
            alphaMode: "premultiplied",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        renderer.updateGlobals({ width: 128, height: 128, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const groups = new Uint32Array([0, 1, 0]);
        const writes = [];
        let pipelineBuilds = 0;
        const createPipeline = renderer.device.createRenderPipeline.bind(
            renderer.device
        );
        renderer.device.createRenderPipeline = (descriptor) => {
            pipelineBuilds++;
            return createPipeline(descriptor);
        };
        const writeBuffer = renderer.device.queue.writeBuffer.bind(
            renderer.device.queue
        );
        renderer.device.queue.writeBuffer = (buffer, ...args) => {
            writes.push(buffer.label);
            writeBuffer(buffer, ...args);
        };
        const mark = renderer.createMark(pointMark, {
            count: 3,
            inputs: {
                group: { data: groups, type: "u32" },
                alias: { data: groups, type: "u32" },
            },
            channels: {
                x: {
                    data: new Float32Array([24, 64, 104]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                y: {
                    value: 64,
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                size: { value: 196 },
                strokeWidth: { value: 0 },
                fill: {
                    value: [0, 0, 1, 1],
                    conditions: [
                        {
                            when: {
                                selection: "groups",
                                type: "multi",
                                input: "group",
                                empty: false,
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        });
        const read = async () => {
            renderer.render({
                draws: [{ mark }],
                clearColor: { r: 0, g: 0, b: 0, a: 0 },
            });
            const buffer = renderer.device.createBuffer({
                size: 128 * 128 * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = renderer.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: renderer.context.getCurrentTexture() },
                { buffer, bytesPerRow: 512 },
                { width: 128, height: 128 }
            );
            renderer.device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const pixels = new Uint8Array(buffer.getMappedRange());
            const colors = [24, 64, 104].map((x) =>
                Array.from(
                    pixels.slice((64 * 128 + x) * 4, (64 * 128 + x) * 4 + 4)
                )
            );
            buffer.unmap();
            buffer.destroy();
            return colors;
        };
        const empty = await read();
        const initialSeriesWrites = writes.filter((label) =>
            label.endsWith("series")
        ).length;
        writes.length = 0;
        pipelineBuilds = 0;
        mark.selections.groups.set(new Uint32Array([0]));
        const zero = await read();
        mark.selections.groups.set(new Uint32Array([1]));
        const one = await read();
        mark.selections.groups.set(new Uint32Array());
        const cleared = await read();
        const seriesWrites = writes.filter((label) =>
            label.endsWith("series")
        ).length;
        const validation = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return {
            empty,
            zero,
            one,
            cleared,
            initialSeriesWrites,
            pipelineBuilds,
            seriesWrites,
            validation: validation?.message,
        };
    });
    expect(result.validation).toBeUndefined();
    expect(result.empty).toEqual([
        [0, 0, 255, 255],
        [0, 0, 255, 255],
        [0, 0, 255, 255],
    ]);
    expect(result.zero).toEqual([
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        [255, 0, 0, 255],
    ]);
    expect(result.one).toEqual([
        [0, 0, 255, 255],
        [255, 0, 0, 255],
        [0, 0, 255, 255],
    ]);
    expect(result.cleared).toEqual(result.empty);
    expect(result.initialSeriesWrites).toBeGreaterThan(0);
    expect(result.seriesWrites).toBe(0);
    expect(result.pipelineBuilds).toBe(0);
});
