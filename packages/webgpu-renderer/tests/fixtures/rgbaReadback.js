import { createRenderer } from "../../src/index.js";

/** @param {number} size */
export async function createReadbackRenderer(size) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    document.body.appendChild(canvas);
    const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
    const { device } = renderer;
    renderer.context.configure({
        device,
        format: renderer.format,
        alphaMode: "premultiplied",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    renderer.updateGlobals({ width: size, height: size, dpr: 1 });
    device.pushErrorScope("validation");

    return {
        renderer,
        /**
         * @param {import("../../src/index.js").MarkHandle<any, any>} mark
         * @param {Array<[number, number]>} points
         */
        async renderPixels(mark, points) {
            renderer.render({
                draws: [{ mark }],
                clearColor: { r: 0, g: 0, b: 0, a: 0 },
            });
            const buffer = device.createBuffer({
                size: points.length * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = device.createCommandEncoder();
            const texture = renderer.context.getCurrentTexture();
            for (const [i, origin] of points.entries()) {
                encoder.copyTextureToBuffer(
                    { texture, origin },
                    { buffer, offset: i * 4 },
                    [1, 1]
                );
            }
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(buffer.getMappedRange());
            const pixels = points.map((_, i) =>
                Array.from(bytes.subarray(i * 4, (i + 1) * 4))
            );
            buffer.destroy();
            return pixels;
        },
        async finish() {
            const error = await device.popErrorScope();
            renderer.destroy();
            canvas.remove();
            return error?.message;
        },
    };
}
