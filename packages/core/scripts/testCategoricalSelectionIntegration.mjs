/* global document, location, requestAnimationFrame, AbortSignal, createImageBitmap, DOMParser, WebGL2RenderingContext, GPUQueue, GPUDevice, console, fetch, URL */
import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers([{ deviceScaleFactor: 1 }], async (page, renderer) => {
    const composed = await page.evaluate(async (renderer) => {
        const { embed, intervalSelection } = await import("/index.js");
        const frame = () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
        document.body.replaceChildren();
        const host = document.createElement("div");
        host.style.cssText = "width:340px;height:140px";
        document.body.append(host);
        const read = async (api, positions) => {
            await frame();
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
            return positions.map(
                ([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]
            );
        };
        const x = {
            field: "x",
            type: "quantitative",
            scale: { domain: [0, 1] },
            axis: null,
        };
        const api = await embed(
            host,
            {
                width: 340,
                height: 140,
                padding: 0,
                params: [
                    { name: "colorDomain", value: ["A", "B"] },
                    { name: "shapeDomain", value: ["B", "A"] },
                    {
                        name: "focus",
                        select: { type: "point", encodings: ["color"] },
                    },
                ],
                datasets: {
                    first: [
                        { x: 0.25, state: "A" },
                        { x: 0.75, state: "B" },
                    ],
                    second: [
                        { x: 0.25, activation: "B" },
                        { x: 0.75, activation: "A" },
                    ],
                },
                layer: [
                    {
                        data: { name: "first" },
                        mark: "point",
                        encoding: {
                            x,
                            y: { value: 0.75 },
                            size: { value: 200 },
                            color: {
                                field: "state",
                                type: "ordinal",
                                legend: null,
                                scale: {
                                    domain: { expr: "colorDomain" },
                                    range: ["red"],
                                },
                            },
                            opacity: {
                                condition: { param: "focus", value: 1 },
                                value: 0.15,
                            },
                        },
                    },
                    {
                        data: { name: "second" },
                        mark: { type: "point", color: "red" },
                        encoding: {
                            x,
                            y: { value: 0.25 },
                            size: { value: 200 },
                            shape: {
                                field: "activation",
                                type: "ordinal",
                                legend: null,
                                scale: {
                                    domain: { expr: "shapeDomain" },
                                    range: ["circle"],
                                },
                            },
                            opacity: {
                                condition: {
                                    param: "focus",
                                    project: { color: "shape" },
                                    value: 1,
                                },
                                value: 0.15,
                            },
                        },
                    },
                ],
            },
            { renderer }
        );
        await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
        const focus = api.params.getSelection("focus");
        const positions = [
            [85, 35],
            [255, 35],
            [85, 105],
            [255, 105],
        ];
        focus.setValue([["A"]]);
        const a = await read(api, positions);
        focus.setValue([["B"]]);
        const b = await read(api, positions);
        focus.setValue([["later"]]);
        const unknown = await read(api, positions);
        api.params.get("colorDomain").setValue(["A", "B", "later"]);
        api.params.get("shapeDomain").setValue(["B", "A", "later"]);
        await api.datasets.set("first", [
            { x: 0.25, state: "later" },
            { x: 0.75, state: "B" },
        ]);
        await api.datasets.set("second", [
            { x: 0.25, activation: "later" },
            { x: 0.75, activation: "B" },
        ]);
        const arrival = await read(api, positions);
        api.finalize();

        // No record selection or tooltip requires a picking identifier here.
        const brushApi = await embed(
            host,
            {
                width: 340,
                height: 140,
                padding: 0,
                params: [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                data: {
                    values: [0.25, 0.5, 0.75].map((x) => ({ x, score: 0 })),
                },
                mark: { type: "point", tooltip: null, semanticZoomFraction: 0 },
                encoding: {
                    x,
                    y: { value: 0.5 },
                    size: { value: 200 },
                    semanticScore: { field: "score", type: "quantitative" },
                    opacity: {
                        condition: { param: "brush", value: 1 },
                        value: 0.2,
                    },
                },
            },
            { renderer }
        );
        brushApi.params
            .get("brush")
            .setValue(intervalSelection({ x: [0.45, 0.55] }));
        const brush = await read(brushApi, [
            [85, 70],
            [170, 70],
            [255, 70],
        ]);
        brushApi.finalize();
        return { a, b, unknown, arrival, brush };
    }, renderer);
    assert.deepEqual(
        composed,
        {
            a: [255, 38, 38, 255],
            b: [38, 255, 255, 38],
            unknown: [38, 38, 38, 38],
            arrival: [255, 38, 255, 38],
            brush: [0, 255, 0],
        },
        `${renderer}: independent color-to-shape mappings, unknown arrivals, and interval-only sampling`
    );

    if (renderer !== "canvas") {
        const performance = await page.evaluate(async (renderer) => {
            const { embed } = await import("/index.js");
            const { startPerformanceProfiler } =
                await import("/debug/performanceProfiler.js");
            const { default: Collector } = await import("/data/collector.js");
            const profiler = startPerformanceProfiler();
            const frame = () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
            const restores = [];
            const metrics = {
                uploads: 0,
                completions: 0,
                resources: 0,
                membershipBytes: 0,
            };
            const wrap = (owner, name, inspect) => {
                const original = owner[name];
                owner[name] = function (...args) {
                    inspect.call(this, args);
                    return original.apply(this, args);
                };
                restores.push(() => {
                    owner[name] = original;
                });
            };
            wrap(Collector.prototype, "complete", () => metrics.completions++);
            if (renderer === "webgl") {
                for (const method of ["bufferData", "bufferSubData"])
                    wrap(
                        WebGL2RenderingContext.prototype,
                        method,
                        function (args) {
                            if (args[0] === this.ARRAY_BUFFER)
                                metrics.uploads++;
                        }
                    );
                for (const method of [
                    "createBuffer",
                    "createTexture",
                    "createProgram",
                ])
                    wrap(
                        WebGL2RenderingContext.prototype,
                        method,
                        () => metrics.resources++
                    );
                for (const method of ["texImage2D", "texSubImage2D"])
                    wrap(WebGL2RenderingContext.prototype, method, (args) => {
                        const data = args.at(-1);
                        if (data instanceof Uint32Array)
                            metrics.membershipBytes += data.byteLength;
                    });
            } else {
                wrap(GPUQueue.prototype, "writeBuffer", (args) => {
                    if (args[0].label.endsWith(": series")) metrics.uploads++;
                    if (args[0].label.includes("selection "))
                        metrics.membershipBytes += args[2].byteLength;
                });
                for (const method of ["createBuffer", "createRenderPipeline"])
                    wrap(
                        GPUDevice.prototype,
                        method,
                        () => metrics.resources++
                    );
            }
            document.body.replaceChildren();
            const host = document.createElement("div");
            host.style.cssText = "width:500px;height:400px";
            document.body.append(host);
            const domain = Array.from(
                { length: 128 },
                (_, i) => "category " + i
            );
            const spec = {
                width: 500,
                height: 400,
                params: [
                    {
                        name: "focus",
                        select: { type: "point", encodings: ["color"] },
                    },
                ],
                data: {
                    values: Array.from({ length: 100000 }, (_, i) => ({
                        x: (i % 500) / 500,
                        y: Math.floor(i / 500) / 200,
                        category: domain[i % domain.length],
                        score: ((i * 7919) % 100000) / 100000,
                    })),
                },
                mark: {
                    type: "point",
                    tooltip: null,
                    semanticZoomFraction: 0.05,
                    size: 2,
                },
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                    y: { field: "y", type: "quantitative", axis: null },
                    color: {
                        field: "category",
                        type: "ordinal",
                        scale: { domain },
                        legend: null,
                    },
                    semanticScore: { field: "score", type: "quantitative" },
                    opacity: {
                        condition: { param: "focus", value: 1 },
                        value: 0.2,
                    },
                },
            };
            const reset = () => {
                for (const key of Object.keys(metrics)) metrics[key] = 0;
                profiler.reset();
            };
            try {
                const api = await embed(host, spec, { renderer });
                const focus = api.params.getSelection("focus");
                focus.setValue([[domain[0]]]);
                await frame();
                reset();
                for (const category of domain.slice(1, 13)) {
                    focus.setValue([[category]]);
                    await frame();
                }
                const membership = {
                    ...metrics,
                    extraction: Object.keys(
                        profiler.snapshot().phaseTotals
                    ).filter((key) => key.startsWith("seriesExtraction.")),
                };
                api.finalize();
                const filteredApi = await embed(
                    host,
                    {
                        ...spec,
                        transform: [
                            {
                                type: "filter",
                                param: "focus",
                                fields: { color: "category" },
                            },
                        ],
                    },
                    { renderer }
                );
                filteredApi.params
                    .getSelection("focus")
                    .setValue([[domain[0]]]);
                await frame();
                reset();
                filteredApi.params
                    .getSelection("focus")
                    .setValue([[domain[1]]]);
                await frame();
                const filter = { ...metrics };
                filteredApi.finalize();
                return { membership, filter };
            } finally {
                for (const restore of restores.reverse()) restore();
                delete globalThis[
                    Symbol.for("genome-spy.performance-profiler")
                ];
            }
        }, renderer);
        assert.equal(
            performance.membership.uploads,
            0,
            `${renderer}: no series uploads`
        );
        assert.equal(
            performance.membership.completions,
            0,
            `${renderer}: no dataflow replay`
        );
        assert.equal(
            performance.membership.resources,
            0,
            `${renderer}: no geometry resources or pipeline rebuilds`
        );
        assert.deepEqual(
            performance.membership.extraction,
            [],
            `${renderer}: no series extraction`
        );
        assert.ok(
            performance.membership.membershipBytes > 0 &&
                performance.membership.membershipBytes < 4096,
            `${renderer}: small membership writes`
        );
        assert.ok(
            performance.filter.completions > 0 &&
                performance.filter.uploads > 0,
            `${renderer}: explicit filtering replays dataflow`
        );
        console.log(
            `${renderer}: 100,000 rows, 128 categories, 12 membership changes: ${JSON.stringify(performance)}`
        );
    }

    const points = await page.evaluate(async (renderer) => {
        const { embed } = await import("/index.js");
        document.body.replaceChildren();
        const host = document.createElement("div");
        host.style.cssText = "width:800px;height:440px";
        document.body.append(host);
        const spec = await (
            await fetch(
                "/examples/docs/grammar/parameters/categorical-point-selection.json"
            )
        ).json();
        spec.baseUrl = new URL("/examples/", location.href).href;
        const api = await embed(host, spec, { renderer });
        await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
        await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        const focus = api.params.getSelection("focus");
        focus.setValue([["resting"]]);
        const snapshot = async () => {
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
            const { blob } = await api.imageExport.svg();
            const svg = new DOMParser().parseFromString(
                await blob.text(),
                "image/svg+xml"
            );
            return ["activation-source", "activation-reader"].map(
                (name) =>
                    Array.from(
                        svg.querySelectorAll(
                            `[data-name="${name}"] [data-mark-type="point"] > *`
                        )
                    ).filter(
                        (node) =>
                            Number(node.getAttribute("fill-opacity") ?? 1) === 1
                    ).length
            );
        };
        const point = (view) => {
            const bounds = api.views.getLayoutBounds({ scope: [], view });
            const canvas = host.querySelector("canvas").getBoundingClientRect();
            return {
                x: canvas.x + bounds.x + (3.5 / 9) * bounds.width,
                y: canvas.y + bounds.y + (1 - 2.8 / 7) * bounds.height,
            };
        };
        globalThis.__categoryDemo = { api, snapshot, focus, point };

        return { initial: await snapshot() };
    }, renderer);
    assert.deepEqual(points.initial, [6, 6]);
    const clickView = async (view) => {
        const point = await page.evaluate(
            (view) => globalThis.__categoryDemo.point(view),
            view
        );
        await page.mouse.move(point.x, point.y);
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                )
        );
        await page.mouse.click(point.x, point.y);
    };
    await clickView("activation-reader");
    assert.deepEqual(
        await page.evaluate(
            () => globalThis.__categoryDemo.focus.getValue().values
        ),
        [["resting"]],
        `${renderer}: read-only consumer`
    );
    await clickView("activation-source");
    await page.waitForFunction(
        () =>
            globalThis.__categoryDemo.focus.getValue().values[0]?.[0] ===
            "activated"
    );
    assert.deepEqual(
        await page.evaluate(() => globalThis.__categoryDemo.snapshot()),
        [6, 6]
    );
    await page.keyboard.down("Shift");
    await clickView("activation-source");
    await page.keyboard.up("Shift");
    await page.waitForFunction(
        () => !globalThis.__categoryDemo.focus.getValue().active
    );
    assert.deepEqual(
        await page.evaluate(() => globalThis.__categoryDemo.snapshot()),
        [18, 18]
    );
    await page.evaluate(() =>
        globalThis.__categoryDemo.focus.setValue([["activated"]])
    );
    const sourcePoint = await page.evaluate(() =>
        globalThis.__categoryDemo.point("activation-source")
    );
    await page.mouse.dblclick(sourcePoint.x, sourcePoint.y);
    await page.waitForFunction(
        () => !globalThis.__categoryDemo.focus.getValue().active
    );
    await page.evaluate(() => {
        globalThis.__categoryDemo.api.finalize();
        delete globalThis.__categoryDemo;
    });
    console.log(
        `${renderer}: linked demo gestures, asynchronous picking, and SVG parity passed.`
    );
});
