/* global document, requestAnimationFrame, AbortSignal, createImageBitmap, DOMParser, WebGL2RenderingContext, GPUQueue, console */
import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer) => {
        for (const component of ["color", "fill", "stroke", "shape"]) {
            const result = await page.evaluate(
                async ({ renderer, component }) => {
                    const { embed } = await import("/index.js");
                    document.body.replaceChildren();
                    const host = document.createElement("div");
                    host.style.width = "340px";
                    host.style.height = "140px";
                    document.body.append(host);
                    let uploads = 0;
                    if (renderer === "webgl") {
                        for (const method of ["bufferData", "bufferSubData"]) {
                            const original =
                                WebGL2RenderingContext.prototype[method];
                            WebGL2RenderingContext.prototype[method] =
                                function (...args) {
                                    if (args[0] === this.ARRAY_BUFFER)
                                        uploads++;
                                    return original.apply(this, args);
                                };
                        }
                    } else if (renderer === "webgpu") {
                        const original = GPUQueue.prototype.writeBuffer;
                        GPUQueue.prototype.writeBuffer = function (
                            buffer,
                            ...args
                        ) {
                            if (buffer.label.endsWith(": series")) uploads++;
                            return original.call(this, buffer, ...args);
                        };
                    }
                    const rows = [1, "1", false, 1].map((category, index) => ({
                        category,
                        x: (index + 1) / 5,
                    }));
                    const errors = [];
                    const api = await embed(
                        host,
                        {
                            width: 340,
                            height: 140,
                            padding: 0,
                            params: [
                                { name: "domain", value: [1, "1", false] },
                                {
                                    name: "focus",
                                    select: {
                                        type: "point",
                                        encodings: [component],
                                    },
                                },
                            ],
                            datasets: { rows },
                            data: { name: "rows" },
                            mark: {
                                type: "point",
                                filled: true,
                                color: "#ff0000",
                                strokeWidth: component === "stroke" ? 4 : 0,
                            },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: null,
                                    axis: null,
                                },
                                y: { value: 0.5 },
                                [component]: {
                                    field: "category",
                                    type: "ordinal",
                                    legend: null,
                                    scale: {
                                        domain: { expr: "domain" },
                                        range:
                                            component === "shape"
                                                ? ["circle"]
                                                : ["#ff0000"],
                                    },
                                },
                                size: { value: 400 },
                                opacity: {
                                    condition: { param: "focus", value: 1 },
                                    value: 0.15,
                                },
                                order: {
                                    condition: { param: "focus", value: 1 },
                                    value: 0,
                                },
                            },
                        },
                        {
                            renderer,
                            onError: (error) => errors.push(error.message),
                        }
                    );
                    await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                    const selection = api.params.getSelection("focus");
                    const frame = () =>
                        new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve)
                            )
                        );
                    const read = async () => {
                        await frame();
                        const raster = await api.imageExport.raster({
                            background: null,
                            pixelRatio: 1,
                        });
                        const bitmap = await createImageBitmap(raster.blob);
                        const canvas = document.createElement("canvas");
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(bitmap, 0, 0);
                        bitmap.close();
                        return rows.map(
                            (row) =>
                                ctx.getImageData(
                                    Math.round(row.x * 340),
                                    70,
                                    1,
                                    1
                                ).data[3]
                        );
                    };
                    const baseline = await read();
                    const before = uploads;
                    const states = [];
                    for (const value of [1, "1", false]) {
                        selection.setValue([[value]]);
                        await frame();
                        const afterMembership = uploads;
                        states.push({
                            value,
                            alpha: await read(),
                            uploads: afterMembership - before,
                        });
                    }
                    selection.clear();
                    const cleared = await read();
                    selection.setValue([[1]]);
                    api.params.get("domain").setValue([false, "1", 1]);
                    const reordered = await read();
                    const svg = await api.imageExport.svg();
                    const dom = new DOMParser().parseFromString(
                        await svg.blob.text(),
                        "image/svg+xml"
                    );
                    const svgOpacity = Array.from(
                        dom.querySelectorAll('[data-mark-type="point"] circle')
                    ).map((circle) =>
                        Number(circle.getAttribute("fill-opacity") ?? 1)
                    );
                    await api.datasets.set("rows", [{ category: "1", x: 0.4 }]);
                    const absent = selection.getValue();
                    await api.datasets.set("rows", rows);
                    const restored = await read();
                    const rect = host
                        .querySelector("canvas")
                        .getBoundingClientRect();
                    globalThis.__categorySelectionTest = { api, read, frame };
                    return {
                        errors,
                        baseline,
                        states,
                        cleared,
                        reordered,
                        svgOpacity,
                        absent,
                        restored,
                        x: rect.x,
                        y: rect.y,
                    };
                },
                { renderer, component }
            );
            const label = `${renderer}/${component}`;
            assert.deepEqual(result.errors, [], label);
            assert.deepEqual(
                result.baseline,
                [255, 255, 255, 255],
                `${label}: empty defaults`
            );
            for (const { value, alpha, uploads } of result.states) {
                assert.deepEqual(
                    alpha.map((a) => Math.round((a / 255) * 100)),
                    [1, "1", false, 1].map((v) => (v === value ? 100 : 15)),
                    `${label}: typed membership`
                );
                assert.equal(uploads, 0, `${label}: retained inputs`);
            }
            assert.deepEqual(
                result.cleared,
                result.baseline,
                `${label}: clear`
            );
            assert.deepEqual(
                result.reordered,
                result.restored,
                `${label}: source/domain lifecycle`
            );
            assert.deepEqual(
                result.absent.values,
                [[1]],
                `${label}: detached absent membership`
            );
            assert.equal(
                result.absent.active,
                true,
                `${label}: absent values remain active`
            );
            assert.deepEqual(
                result.svgOpacity.sort(),
                [0.15, 0.15, 1, 1],
                `${label}: SVG output`
            );

            // Actual pointer gestures include asynchronous picking on WebGPU.
            await page.mouse.move(result.x + 68, result.y + 70);
            await page.waitForTimeout(80);
            await page.mouse.click(result.x + 68, result.y + 70);
            await page.waitForFunction(
                () =>
                    JSON.stringify(
                        globalThis.__categorySelectionTest.api.params
                            .getSelection("focus")
                            .getValue().values
                    ) === "[[1]]"
            );
            await page.keyboard.down("Shift");
            await page.mouse.click(result.x + 68, result.y + 70);
            await page.keyboard.up("Shift");
            await page.waitForFunction(
                () =>
                    !globalThis.__categorySelectionTest.api.params
                        .getSelection("focus")
                        .getValue().active
            );
            await page.evaluate(() =>
                globalThis.__categorySelectionTest.api.finalize()
            );
            console.log(
                `${label}: typed membership, retained updates, lifecycle, SVG, and gestures passed.`
            );
        }

        const sampling = await page.evaluate(async (renderer) => {
            const { embed } = await import("/index.js");
            const { intervalSelection } = await import("/selection/index.js");
            document.body.replaceChildren();
            const host = document.createElement("div");
            host.style.width = "340px";
            host.style.height = "140px";
            document.body.append(host);
            const api = await embed(
                host,
                {
                    width: 340,
                    height: 140,
                    padding: 0,
                    params: [
                        {
                            name: "focus",
                            select: { type: "point", encodings: ["color"] },
                        },
                        { name: "picked", select: "point" },
                        {
                            name: "brush",
                            select: { type: "interval", encodings: ["x"] },
                        },
                    ],
                    data: {
                        values: ["A", "B", "C"].map((id, i) => ({
                            id,
                            x: (i + 1) / 4,
                            score: 0,
                        })),
                    },
                    mark: { type: "point", semanticZoomFraction: 0 },
                    encoding: {
                        key: { field: "id" },
                        x: {
                            field: "x",
                            type: "quantitative",
                            axis: null,
                            scale: { domain: [0, 1] },
                        },
                        y: { value: 0.5 },
                        size: { value: 400 },
                        semanticScore: { field: "score", type: "quantitative" },
                        color: {
                            field: "id",
                            type: "ordinal",
                            legend: null,
                            scale: { domain: ["A", "B", "C"] },
                        },
                        opacity: {
                            condition: {
                                test: {
                                    not: {
                                        and: [
                                            { param: "picked" },
                                            { param: "focus" },
                                            { param: "brush" },
                                        ],
                                    },
                                },
                                value: 1,
                            },
                            value: 0.2,
                        },
                    },
                },
                { renderer }
            );
            await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
            const read = async () => {
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
                const { blob } = await api.imageExport.raster({
                    background: null,
                    pixelRatio: 1,
                });
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bitmap, 0, 0);
                bitmap.close();
                return [85, 170, 255].map(
                    (x) => ctx.getImageData(x, 70, 1, 1).data[3] > 128
                );
            };
            api.params.getSelection("focus").setValue([["A"]]);
            const category = await read();
            api.params.getSelection("picked").setValue([["C"]]);
            const record = await read();
            api.params
                .get("brush")
                .setValue(intervalSelection({ x: [0.45, 0.55] }));
            const combined = await read();
            api.params.getSelection("focus").setValue([["absent"]]);
            const absentCategory = await read();
            api.params.getSelection("picked").clear();
            const brush = await read();
            api.finalize();
            return { category, record, combined, absentCategory, brush };
        }, renderer);
        assert.deepEqual(
            sampling,
            {
                category: [false, false, false],
                record: [false, false, true],
                combined: [false, true, true],
                absentCategory: [false, true, true],
                brush: [false, true, false],
            },
            `${renderer}: category focus and independent record/brush sampling`
        );
        console.log(`${renderer}: compound sampling parity passed.`);
        const marks = await page.evaluate(async (renderer) => {
            const { embed } = await import("/index.js");
            const results = [];
            for (const type of ["rect", "rule", "link", "arrow", "text"]) {
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "340px";
                host.style.height = "140px";
                document.body.append(host);
                const api = await embed(
                    host,
                    {
                        width: 340,
                        height: 140,
                        padding: 0,
                        params: [
                            {
                                name: "focus",
                                select: { type: "point", encodings: ["color"] },
                            },
                        ],
                        data: {
                            values: [
                                { category: "A", x: 0.2, x2: 0.4 },
                                { category: "B", x: 0.6, x2: 0.8 },
                            ],
                        },
                        mark: { type, tooltip: null },
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                scale: null,
                                axis: null,
                            },
                            x2: { field: "x2" },
                            y: { value: 0.3 },
                            y2: { value: 0.7 },
                            size: { value: type === "text" ? 30 : 6 },
                            text: { value: "X" },
                            color: {
                                field: "category",
                                type: "ordinal",
                                legend: null,
                                scale: { domain: ["A", "B"], range: ["red"] },
                            },
                            opacity: {
                                condition: { param: "focus", value: 1 },
                                value: 0.15,
                            },
                        },
                    },
                    { renderer }
                );
                await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                api.params.getSelection("focus").setValue([["A"]]);
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
                const { blob } = await api.imageExport.raster({
                    background: null,
                    pixelRatio: 1,
                });
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bitmap, 0, 0);
                bitmap.close();
                const pixels = ctx.getImageData(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                ).data;
                const alpha = [0, 0];
                for (let y = 0; y < canvas.height; y++)
                    for (let x = 0; x < canvas.width; x++) {
                        const half = x < canvas.width / 2 ? 0 : 1;
                        alpha[half] = Math.max(
                            alpha[half],
                            pixels[(y * canvas.width + x) * 4 + 3]
                        );
                    }
                results.push({ type, alpha });
                api.finalize();
            }
            return results;
        }, renderer);
        for (const { type, alpha } of marks) {
            assert.ok(alpha[0] > 200, `${renderer}/${type}: selected paint`);
            assert.ok(
                alpha[1] > 0 && alpha[1] < 45,
                `${renderer}/${type}: unselected paint`
            );
        }
        console.log(
            `${renderer}: categorical predicates on neighboring mark families passed.`
        );
    }
);
