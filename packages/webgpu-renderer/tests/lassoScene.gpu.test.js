import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test.beforeEach(async ({ page }) => {
    await ensureWebGPU(page);
    for (const file of ["lassoScene.js"])
        await page.route("**/examples/" + file, async (route) => {
            await route.fulfill({
                contentType: "text/javascript",
                body: await readFile(
                    new URL("../examples/" + file, import.meta.url),
                    "utf8"
                ),
            });
        });
});

test("live lasso keeps the outline responsive and processes only the latest polygon", async ({
    page,
}) => {
    const result = await page.evaluate(async () => {
        const { default: runLassoScene } =
            await import("/examples/lassoScene.js");
        const { LassoSelection } = await import("/src/utils/lassoSelection.js");
        const polygons = [];
        let reads = 0;
        const { default: PointProgram } =
            await import("/src/marks/programs/pointProgram.js");
        let pointDraws = 0;
        const draw = PointProgram.prototype.draw;
        PointProgram.prototype.draw = function (pass, options) {
            pointDraws++;
            return draw.call(this, pass, options);
        };
        const update = LassoSelection.prototype.update;
        LassoSelection.prototype.update = function (polygon) {
            polygons.push(polygon?.map((point) => point.slice()) ?? []);
            return update.call(this, polygon);
        };
        const readIds = LassoSelection.prototype.readIds;
        LassoSelection.prototype.readIds = function () {
            reads++;
            return readIds.call(this);
        };
        // Hold completion notifications to simulate a GPU slower than pointer input.
        const done = GPUQueue.prototype.onSubmittedWorkDone;
        let release;
        const parent = document.createElement("div");
        parent.style.cssText = "width:400px;height:400px";
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;height:100%";
        parent.append(canvas);
        document.body.append(parent);
        let status = "";
        const dispose = await runLassoScene(canvas, {
            count: 1000,
            onStatus: (value) => {
                status = value;
            },
        });
        GPUQueue.prototype.onSubmittedWorkDone = function () {
            const completion = done.call(this);
            return new Promise((resolve, reject) => {
                release = () => completion.then(resolve, reject);
            });
        };
        const initialPointDraws = pointDraws;
        polygons.length = 0;
        // Synthetic events avoid depending on actual pointer capture in this scheduling test.
        canvas.setPointerCapture = () => {};
        const rect = canvas.getBoundingClientRect();
        function pointer(type, x, y) {
            canvas.dispatchEvent(
                new PointerEvent(type, {
                    button: 0,
                    pointerId: 1,
                    clientX: rect.left + x,
                    clientY: rect.top + y,
                })
            );
        }
        const frame = () =>
            new Promise((resolve) => requestAnimationFrame(resolve));
        async function tick() {
            await frame();
            await frame();
        }
        pointer("pointerdown", 20, 20);
        await tick();
        const initialOutline = parent.querySelector("path").getAttribute("d");
        pointer("pointermove", 350, 20);
        await tick();
        pointer("pointermove", 350, 350);
        await tick();
        const responsive =
            parent.querySelector("path").getAttribute("d") !== initialOutline;
        const batchesWhileBlocked = polygons.length;
        pointer("pointerup", 20, 350);
        release();
        await tick();
        const finalPolygon = polygons.at(-1);
        const batchesAfterRelease = polygons.length;
        release();
        for (let i = 0; i < 100 && !status.startsWith("Selected"); i++)
            await tick();
        const committed = status.startsWith("Selected");
        const committedReads = reads;
        const drawsAfterSelection = pointDraws;
        parent.style.width = "200px";
        window.dispatchEvent(new Event("resize"));
        await tick();
        release();
        await tick();
        const drawsAfterResize = pointDraws;
        const readsAfterResize = reads;

        pointer("pointerdown", 40, 40);
        await tick();
        pointer("pointermove", 300, 40);
        pointer("pointermove", 300, 300);
        await tick();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        release();
        await tick();
        const cleared =
            polygons.at(-1).length === 0 &&
            parent.querySelector("path").getAttribute("d") === "";
        const beforeDispose = polygons.length;
        dispose();
        release();
        await tick();
        return {
            initialPointDraws,
            drawsAfterSelection,
            drawsAfterResize,
            readsAfterResize,
            responsive,
            batchesWhileBlocked,
            batchesAfterRelease,
            finalPolygon,
            committed,
            committedReads,
            cleared,
            readsAfterCancel: reads,
            batchesAfterDispose: polygons.length,
            beforeDispose,
        };
    });
    expect(result.responsive).toBe(true);
    expect(result.drawsAfterSelection).toBe(result.initialPointDraws);
    expect(result.drawsAfterResize).toBe(result.initialPointDraws + 1);
    expect(result.readsAfterResize).toBe(1);
    expect(result.batchesWhileBlocked).toBe(1);
    expect(result.batchesAfterRelease).toBe(2);
    expect(result.finalPolygon).toEqual([
        [0.05, 0.95],
        [0.875, 0.95],
        [0.875, 0.125],
        [0.05, 0.125],
    ]);
    expect(result.committed).toBe(true);
    expect(result.committedReads).toBe(1);
    expect(result.cleared).toBe(true);
    expect(result.readsAfterCancel).toBe(1);
    expect(result.batchesAfterDispose).toBe(result.beforeDispose);
});

test("supplied projected points produce released IDs and a captured polygon", async ({
    page,
}) => {
    const result = await page.evaluate(async () => {
        const { default: runLassoScene } =
            await import("/examples/lassoScene.js");
        const parent = document.createElement("div");
        parent.style.cssText = "width:400px;height:400px";
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;height:100%";
        parent.append(canvas);
        document.body.append(parent);
        let resolve;
        const committed = new Promise((r) => {
            resolve = r;
        });
        // These positions come from the log/sqrt fixture; C is on the slanted edge.
        const dispose = await runLassoScene(canvas, {
            data: {
                x: new Float32Array([0, 0.5, 0.5, 0.5, 1]),
                y: new Float32Array([0, 1 / 3, 5 / 9, 0.5, 1]),
                ids: new Uint32Array([1, 2, 3, 4, 5]),
            },
            onSelection: resolve,
        });
        canvas.setPointerCapture = () => {};
        const rect = canvas.getBoundingClientRect();
        for (const [type, x, y] of [
            ["pointerdown", 0, 400],
            ["pointermove", 400, 400],
            ["pointermove", 0, 0],
            ["pointerup", 0, 400],
        ])
            canvas.dispatchEvent(
                new PointerEvent(type, {
                    button: 0,
                    pointerId: 1,
                    clientX: rect.left + x,
                    clientY: rect.top + y,
                })
            );
        const selection = await committed;
        const ids = Array.from(selection.ids).sort((a, b) => a - b);
        dispose();
        parent.remove();
        return { ids, polygon: selection.polygon };
    });
    expect(result.ids).toEqual([1, 2, 4]);
    expect(result.polygon).toEqual([
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
    ]);
});

test("zoom anchors at the pointer and lasso stays in the original projection", async ({
    page,
}) => {
    const result = await page.evaluate(async () => {
        const { default: runLassoScene } =
            await import("/examples/lassoScene.js");
        const parent = document.createElement("div");
        parent.style.cssText = "width:400px;height:400px";
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;height:100%";
        parent.append(canvas);
        document.body.append(parent);
        const selections = [];
        const dispose = await runLassoScene(canvas, {
            data: {
                x: new Float32Array([0.25, 0.75]),
                y: new Float32Array([0.75, 0.25]),
                ids: new Uint32Array([1, 2]),
            },
            onSelection: (selection) => selections.push(selection),
        });
        canvas.setPointerCapture = () => {};
        const rect = canvas.getBoundingClientRect();
        function pointer(type, x, y) {
            canvas.dispatchEvent(
                new PointerEvent(type, {
                    button: 0,
                    pointerId: 1,
                    clientX: rect.left + x,
                    clientY: rect.top + y,
                })
            );
        }
        const frame = () =>
            new Promise((resolve) => requestAnimationFrame(resolve));
        canvas.dispatchEvent(
            new WheelEvent("wheel", {
                deltaY: -500,
                cancelable: true,
                clientX: rect.left + 100,
                clientY: rect.top + 100,
            })
        );
        await frame();
        await frame();
        for (const [type, x, y] of [
            ["pointerdown", 80, 80],
            ["pointermove", 120, 80],
            ["pointermove", 120, 120],
            ["pointermove", 80, 120],
            ["pointerup", 80, 80],
        ])
            pointer(type, x, y);
        for (let i = 0; i < 100 && !selections.length; i++) await frame();
        const selection = selections[0];
        const zoomedOutline = parent.querySelector("path").getAttribute("d");
        canvas.dispatchEvent(
            new MouseEvent("contextmenu", { cancelable: true })
        );
        await frame();
        await frame();
        const resetOutline = parent.querySelector("path").getAttribute("d");
        const callbacksAfterReset = selections.length;
        dispose();
        parent.remove();
        return {
            ids: Array.from(selection.ids),
            polygon: selection.polygon,
            zoomedOutline,
            resetOutline,
            callbacksAfterReset,
        };
    });
    expect(result.ids).toEqual([1]);
    const expected = [
        [0.225, 0.775],
        [0.275, 0.775],
        [0.275, 0.725],
        [0.225, 0.725],
        [0.225, 0.775],
    ];
    result.polygon.forEach((point, i) =>
        point.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j]))
    );
    const coordinates = (outline) => outline.match(/[\d.]+/g).map(Number);
    coordinates(result.zoomedOutline).forEach((value, i) =>
        expect(value).toBeCloseTo(
            [80, 80, 120, 80, 120, 120, 80, 120, 80, 80][i]
        )
    );
    coordinates(result.resetOutline).forEach((value, i) =>
        expect(value).toBeCloseTo(
            [90, 90, 110, 90, 110, 110, 90, 110, 90, 90][i]
        )
    );
    expect(result.callbacksAfterReset).toBe(1);
});
