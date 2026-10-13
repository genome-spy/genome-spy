import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("lasso density counts rows and borrowed IDs after table transfer with default device limits", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ LassoSelection }, { buildHashTableSet }] = await Promise.all([
            import("/src/utils/lassoSelection.js"),
            import("/src/utils/hashTable.js"),
        ]);
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        device.pushErrorScope("validation");
        const lasso = new LassoSelection(device, {
            x: new Float32Array([0.1, 0.1, 0.9]),
            y: new Float32Array([0.1, 0.1, 0.9]),
            ids: new Uint32Array([1, 2, 3]),
        });
        lasso.setDensityGrid(4, 4);
        const read = async (buffer) => {
            const staging = device.createBuffer({
                size: buffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = device.createCommandEncoder();
            encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size);
            device.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const counts = Array.from(
                new Uint32Array(staging.getMappedRange())
            );
            staging.destroy();
            return counts;
        };
        lasso.update([
            [0, 0],
            [0.5, 0],
            [0.5, 0.5],
            [0, 0.5],
        ]);
        const live = await read(lasso.density[1]);
        const total = await read(lasso.density[0]);
        const membership = await lasso.readIds();
        const { table } = buildHashTableSet([3]);
        const source = device.createBuffer({
            size: table.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(source, 0, table);
        lasso.updateDensity(source);
        const committed = await read(lasso.density[1]);
        lasso.clear();
        const cleared = await read(lasso.density[1]);
        const unchangedTotal = await read(lasso.density[0]);
        // Cached density must not bind the former table after its owner releases it.
        lasso.takeTable().destroy();
        lasso.updateDensity(source);
        const transferred = await read(lasso.density[1]);
        lasso.destroy();
        source.destroy();
        await device.queue.onSubmittedWorkDone();
        const error = await device.popErrorScope();
        device.destroy();
        return {
            live,
            total,
            committed,
            cleared,
            unchangedTotal,
            ids: Array.from(membership.ids),
            transferred,
            error: error?.message,
        };
    });
    expect(result.live.reduce((a, b) => a + b)).toBe(2);
    expect(result.total.reduce((a, b) => a + b)).toBe(3);
    expect(result.committed.reduce((a, b) => a + b)).toBe(1);
    expect(result.committed[3]).toBe(1);
    expect(result.cleared.every((count) => count === 0)).toBe(true);
    expect(result.unchangedTotal).toEqual(result.total);
    expect(result.ids.sort()).toEqual([1, 2]);
    expect(result.transferred).toEqual(result.committed);
    expect(result.error).toBeUndefined();
});
