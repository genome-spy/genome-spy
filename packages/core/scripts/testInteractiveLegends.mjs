/* global document, location, requestAnimationFrame, DOMParser, fetch, URL, console, AbortSignal, createImageBitmap, WebGL2RenderingContext, GPUQueue, GPUDevice */
import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, { deviceScaleFactor }) => {
        await page.evaluate(async (renderer) => {
            const { embed } = await import("/index.js");
            document.body.replaceChildren();
            const host = document.createElement("div");
            host.style.cssText = "width:720px;height:400px";
            document.body.append(host);
            const spec = await (
                await fetch(
                    "/examples/docs/grammar/legend/interactive-legend.json"
                )
            ).json();
            spec.name = "cells";
            spec.baseUrl = new URL("/examples/", location.href).href;
            const api = await embed(host, spec, { renderer });
            await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
            const frame = () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
            const svg = async () => {
                await frame();
                const { blob } = await api.imageExport.svg();
                return new DOMParser().parseFromString(
                    await blob.text(),
                    "image/svg+xml"
                ).documentElement;
            };
            await svg();
            const entries = () =>
                api.debug
                    .getViewRoot()
                    .getDescendants()
                    .filter((view) => view.name === "entries");
            const find = (label) => {
                for (const view of entries()) {
                    const row = Array.from(view.getCollector().getData()).find(
                        (row) => row.label === label
                    );
                    if (row) return { view, row };
                }
                throw new Error("Missing legend entry: " + label);
            };
            const point = (label, area = "label") => {
                const { view, row } = find(label);
                const canvas = host
                    .querySelector("canvas")
                    .getBoundingClientRect();
                const x =
                    area === "symbol"
                        ? (row.symbolX + row.symbolX2) / 2
                        : area === "whitespace"
                          ? (row.symbolX2 + row.labelX) / 2
                          : row.labelX + 2;
                return {
                    x: canvas.x + view.coords.x + x,
                    y: canvas.y + view.coords.y + row.labelY,
                };
            };
            const labelAlpha = async (label) => {
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
                const { view, row } = find(label);
                const pixels = ctx.getImageData(
                    Math.floor(view.coords.x + row.labelX),
                    Math.floor(view.coords.y + row.labelY - 8),
                    Math.ceil(row._legendLabelWidth),
                    16
                ).data;
                let alpha = 0;
                for (let i = 3; i < pixels.length; i += 4)
                    alpha = Math.max(alpha, pixels[i]);
                return alpha;
            };
            const selected = async () => {
                const root = await svg();
                return Array.from(
                    root.querySelectorAll(
                        '[data-name="cells"] [data-mark-type="point"] > *'
                    )
                ).filter(
                    (node) =>
                        Number(
                            node.getAttribute("stroke-opacity") ??
                                node.getAttribute("fill-opacity") ??
                                1
                        ) === 1
                ).length;
            };
            const types = api.params.getSelection("cell_types");
            const states = api.params.getSelection("activation_states");
            const inertPoints = () => {
                const canvas = host
                    .querySelector("canvas")
                    .getBoundingClientRect();
                const plot = api.views.getLayoutBounds({
                    scope: [],
                    view: "cells",
                });
                const legend = find("T cell")
                    .view.getLayoutAncestors()
                    .find((view) => "legendProps" in view);
                return [
                    {
                        x: canvas.x + plot.x + plot.width / 2,
                        y: canvas.y + plot.y + plot.height / 2,
                    },
                    {
                        x: canvas.x + legend.coords.x + 2,
                        y: canvas.y + legend.coords.y + 2,
                    },
                ];
            };
            globalThis.__legendTest = {
                api,
                types,
                states,
                selected,
                frame,
                point,
                labelAlpha,
                spec,
                host,
                inertPoints,
            };
        }, renderer);
        const click = async (label, shift = false, area = "label") => {
            const point = await page.evaluate(
                ({ label, area }) => globalThis.__legendTest.point(label, area),
                { label, area }
            );
            if (shift) await page.keyboard.down("Shift");
            await page.mouse.click(point.x, point.y);
            if (shift) await page.keyboard.up("Shift");
        };
        await click("T cell", false, "symbol");
        await page.waitForFunction(
            () =>
                globalThis.__legendTest.types.getValue().values[0]?.[0] ===
                "T cell"
        );
        const alpha = await page.evaluate(async () => [
            await globalThis.__legendTest.labelAlpha("T cell"),
            await globalThis.__legendTest.labelAlpha("B cell"),
        ]);
        assert.ok(
            alpha[0] > 200 && alpha[1] > 50 && alpha[1] < 110,
            `${renderer}: native label opacity ${alpha}`
        );
        for (const point of await page.evaluate(() =>
            globalThis.__legendTest.inertPoints()
        )) {
            await page.mouse.dblclick(point.x, point.y);
            await page.evaluate(() => globalThis.__legendTest.frame());
            assert.deepEqual(
                await page.evaluate(
                    () => globalThis.__legendTest.types.getValue().values
                ),
                [["T cell"]]
            );
        }
        await click("activated");
        await page.waitForFunction(
            () =>
                globalThis.__legendTest.states.getValue().values[0]?.[0] ===
                "activated"
        );
        assert.equal(
            await page.evaluate(() => globalThis.__legendTest.selected()),
            3
        );
        await click("B cell", true, "whitespace");
        await page.waitForFunction(
            () => globalThis.__legendTest.types.getValue().values.length === 2
        );
        assert.equal(
            await page.evaluate(() => globalThis.__legendTest.selected()),
            6
        );
        const clear = await page.evaluate(() =>
            globalThis.__legendTest.point("B cell")
        );
        await page.mouse.dblclick(clear.x, clear.y);
        await page.waitForFunction(
            () => !globalThis.__legendTest.types.getValue().active
        );
        assert.deepEqual(
            await page.evaluate(
                () => globalThis.__legendTest.states.getValue().values
            ),
            [["activated"]]
        );
        const retained = await page.evaluate(async (renderer) => {
            const {
                api: previous,
                spec,
                host,
                frame,
            } = globalThis.__legendTest;
            previous.finalize();
            if (renderer === "canvas" || globalThis.devicePixelRatio !== 1) {
                delete globalThis.__legendTest;
                return null;
            }
            const { embed, intervalSelection } = await import("/index.js");
            const { default: Collector } = await import("/data/collector.js");
            const { startPerformanceProfiler } =
                await import("/debug/performanceProfiler.js");
            const profiler = startPerformanceProfiler();
            const api = await embed(
                host,
                {
                    ...spec,
                    params: [
                        ...spec.params,
                        { name: "picked", select: "point" },
                        {
                            name: "brush",
                            select: { type: "interval", encodings: ["x"] },
                        },
                    ],
                    data: {
                        values: Array.from({ length: 100000 }, (_, i) => ({
                            id: "cell" + i,
                            x: i % 2 ? 6 : 2,
                            y: (i % 7) + 0.5,
                            cell_type: i % 2 ? "B cell" : "T cell",
                            activation_state: "activated",
                            score: (i % 10000) / 10000,
                        })),
                    },
                    mark: { ...spec.mark, semanticZoomFraction: 0.1 },
                    encoding: {
                        ...spec.encoding,
                        key: { field: "id" },
                        semanticScore: { field: "score", type: "quantitative" },
                        opacity: {
                            condition: {
                                test: {
                                    or: [
                                        spec.encoding.opacity.condition.test,
                                        { param: "picked", empty: false },
                                        { param: "brush", empty: false },
                                    ],
                                },
                                value: 1,
                            },
                            value: 0.12,
                        },
                    },
                },
                { renderer }
            );
            const types = api.params.getSelection("cell_types");
            const picked = api.params.getSelection("picked");
            const brush = api.params.get("brush");
            picked.setValue([["cell0"]]);
            brush.setValue(intervalSelection({ x: [0, 4] }));
            types.setValue([["T cell"]]);
            await frame();
            const mark = api.debug
                .getViewRoot()
                .getDescendants()
                .find((view) => view.name === "cells").mark;
            const selection = JSON.stringify([
                picked.getValue(),
                brush.getValue(),
            ]);
            const threshold = mark.getSemanticThreshold();
            const samples = mark.sampledSemanticScores;
            const metrics = { uploads: 0, completions: 0, pipelines: 0 };
            const restores = [];
            const wrap = (owner, name, count) => {
                const original = owner[name];
                owner[name] = function (...args) {
                    count.call(this, args);
                    return original.apply(this, args);
                };
                restores.push(() => {
                    owner[name] = original;
                });
            };
            wrap(Collector.prototype, "complete", () => metrics.completions++);
            if (renderer === "webgl") {
                for (const name of ["bufferData", "bufferSubData"])
                    wrap(
                        WebGL2RenderingContext.prototype,
                        name,
                        function (args) {
                            if (args[0] === this.ARRAY_BUFFER)
                                metrics.uploads++;
                        }
                    );
                wrap(
                    WebGL2RenderingContext.prototype,
                    "createProgram",
                    () => metrics.pipelines++
                );
            } else {
                wrap(GPUQueue.prototype, "writeBuffer", (args) => {
                    if (args[0].label.endsWith(": series")) metrics.uploads++;
                });
                wrap(
                    GPUDevice.prototype,
                    "createRenderPipeline",
                    () => metrics.pipelines++
                );
            }
            profiler.reset();
            try {
                for (let i = 0; i < 12; i++) {
                    types.setValue([[i % 2 ? "T cell" : "B cell"]]);
                    await frame();
                }
                return {
                    ...metrics,
                    sameSelections:
                        JSON.stringify([
                            picked.getValue(),
                            brush.getValue(),
                        ]) === selection,
                    sameSample:
                        samples === mark.sampledSemanticScores &&
                        threshold === mark.getSemanticThreshold(),
                    extraction: Object.keys(
                        profiler.snapshot().phaseTotals
                    ).filter((key) => key.startsWith("seriesExtraction.")),
                };
            } finally {
                for (const restore of restores) restore();
                api.finalize();
                delete globalThis.__legendTest;
                delete globalThis[
                    Symbol.for("genome-spy.performance-profiler")
                ];
            }
        }, renderer);
        if (retained)
            assert.deepEqual(
                retained,
                {
                    uploads: 0,
                    completions: 0,
                    pipelines: 0,
                    sameSelections: true,
                    sameSample: true,
                    extraction: [],
                },
                `${renderer}: 100,000-row retained updates and brush/record coexistence`
            );
        console.log(
            `${renderer} DPR ${deviceScaleFactor}: native legend input, independent membership, and feedback passed.`
        );
    }
);
