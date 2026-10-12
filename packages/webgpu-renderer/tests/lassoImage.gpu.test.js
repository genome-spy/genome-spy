import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("density counts geometric rows, preserves IDs and recolors a cached image", async ({
    page,
}) => {
    await ensureWebGPU(page);
    await page.route("**/src/utils/lassoImage.js", async (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: await readFile(
                new URL("../src/utils/lassoImage.js", import.meta.url),
                "utf8"
            ),
        })
    );
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { linearScale },
            { LassoSelection },
            { LassoImage },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/linear.js"),
            import("/src/utils/lassoSelection.js"),
            import("/src/utils/lassoImage.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 4;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 4, height: 4, dpr: 1 });
        // Two coincident rows and one unselected row share a bin; NaN/offscreen do not.
        const x = new Float32Array([0.1, 0.1, 0.2, 1, -0.1, NaN]);
        const y = new Float32Array([0.1, 0.1, 0.2, 1, 0.1, 0.1]);
        const lasso = new LassoSelection(renderer.device, {
            x,
            y,
            ids: new Uint32Array([1, 1, 2, 3, 4, 5]),
        });
        const mark = renderer.createMark(pointMark, {
            channels: {
                x: {
                    data: x,
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 4] }),
                },
                y: {
                    data: y,
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [4, 0] }),
                },
                size: { value: 2 },
                strokeWidth: { value: 0 },
                fill: { value: [0.4, 0.46, 0.55, 0.15] },
            },
        });
        const image = new LassoImage(canvas, lasso);
        renderer.device.pushErrorScope("validation");
        let draws = 0;
        image.capture(() => {
            draws++;
            renderer.render({
                draws: [{ mark, firstInstance: 0, instanceCount: 4 }],
            });
        });
        async function read(buffer) {
            const staging = renderer.device.createBuffer({
                size: buffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = renderer.device.createCommandEncoder();
            encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size);
            renderer.device.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const values = Array.from(
                new Uint32Array(staging.getMappedRange())
            );
            staging.destroy();
            return values;
        }
        async function pixels() {
            image.render();
            const staging = renderer.device.createBuffer({
                size: 1024,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = renderer.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: canvas.getContext("webgpu").getCurrentTexture() },
                { buffer: staging, bytesPerRow: 256 },
                [4, 4]
            );
            renderer.device.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const values = Array.from(new Uint8Array(staging.getMappedRange()));
            staging.destroy();
            return values;
        }
        const neutral = await pixels();
        lasso.update([
            [0, 0],
            [0.15, 0],
            [0.15, 0.15],
            [0, 0.15],
        ]);
        const selected = await read(lasso.density[1]);
        const total = await read(lasso.density[0]);
        const ids = Array.from((await lasso.readIds()).ids);
        const highlighted = await pixels();
        lasso.update([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ]);
        const full = await pixels();
        const redChannel = renderer.format.startsWith("bgra") ? 2 : 0;
        const offset = 3 * 256 + redChannel;
        const red = [neutral[offset], highlighted[offset], full[offset]];
        lasso.clear();
        const cleared = await pixels();
        const clearCounts = await read(lasso.density[1]);
        lasso.update([
            [0.8, 0],
            [0.9, 0],
            [0.9, 0.1],
            [0.8, 0.1],
        ]);
        const zero = await pixels();
        // Resize rebuilds total counts; selected counts start empty, without stale rows.
        const resized = lasso.setDensityGrid(2, 2);
        const resizedTotal = await read(resized.total);
        const resizedSelected = await read(resized.selected);
        const zoomed = lasso.setDensityGrid(2, 2, [0, 0, 0.15, 0.15]);
        const zoomedTotal = await read(zoomed.total);
        lasso.update([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ]);
        const zoomedSelected = await read(zoomed.selected);
        const zoomedIds = Array.from((await lasso.readIds()).ids).sort(
            (a, b) => a - b
        );
        let invalidViewRejected = false;
        try {
            lasso.setDensityGrid(2, 2, [0, 0, 0, 1]);
        } catch {
            invalidViewRejected = true;
        }
        const error = await renderer.device.popErrorScope();
        image.destroy();
        renderer.destroy();
        lasso.destroy();
        canvas.remove();
        return {
            total,
            red,
            selected,
            ids,
            changed: JSON.stringify(neutral) !== JSON.stringify(highlighted),
            restored: JSON.stringify(neutral) === JSON.stringify(cleared),
            zero: JSON.stringify(neutral) === JSON.stringify(zero),
            clearCounts,
            resizedTotal,
            resizedSelected,
            zoomedTotal,
            zoomedSelected,
            zoomedIds,
            invalidViewRejected,
            draws,
            error: error?.message,
        };
    });
    expect(result.total.reduce((a, b) => a + b)).toBe(4);
    expect(result.total[12]).toBe(3);
    expect(result.total[3]).toBe(1);
    expect(result.selected[12]).toBe(2);
    expect(result.selected.reduce((a, b) => a + b)).toBe(2);
    expect(result.ids).toEqual([1]);
    expect(result.changed).toBe(true);
    expect(result.red[0]).toBeLessThan(result.red[1]);
    expect(result.red[1]).toBeLessThan(result.red[2]);
    expect(result.restored).toBe(true);
    expect(result.zero).toBe(true);
    expect(result.clearCounts.every((value) => value === 0)).toBe(true);
    expect(result.resizedTotal).toEqual([0, 1, 3, 0]);
    expect(result.resizedSelected).toEqual([0, 0, 0, 0]);
    expect(result.zoomedTotal).toEqual([0, 2, 0, 0]);
    expect(result.zoomedSelected).toEqual(result.zoomedTotal);
    expect(result.zoomedIds).toEqual([1, 2, 3]);
    expect(result.invalidViewRejected).toBe(true);
    expect(result.draws).toBe(1);
    expect(result.error).toBeUndefined();
});
