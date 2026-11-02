/* global document, location, requestAnimationFrame, DOMParser, fetch, URL, AbortSignal, createImageBitmap, GPUQueue */
import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers([{ deviceScaleFactor: 1 }], async (page, renderer) => {
    await page.evaluate(async (renderer) => {
        const { embed } = await import("/index.js");
        const vertical = renderer === "webgpu";
        document.body.replaceChildren();
        const host = document.createElement("div");
        host.style.cssText = "width:800px;height:440px";
        document.body.append(host);
        const api = await embed(
            host,
            {
                name: "cells",
                params: [
                    {
                        name: "range",
                        select: { type: "interval", encodings: ["color"] },
                        bind: "legend",
                    },
                ],
                data: {
                    values: [
                        { x: 1, y: 1, score: 0 },
                        { x: 2, y: 2, score: 0.3 },
                        { x: 3, y: 1, score: 0.6 },
                        { x: 4, y: 2, score: 1 },
                        { x: 5, y: 1, score: 1.2 },
                    ],
                },
                mark: { type: "point", filled: true, size: 150 },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    color: {
                        field: "score",
                        type: "quantitative",
                        scale: { domain: [0, 1] },
                        legend: {
                            orient: vertical ? "right" : "bottom",
                            direction: vertical ? "vertical" : "horizontal",
                            gradientLength: 300,
                        },
                    },
                    opacity: {
                        condition: { param: "range", value: 1 },
                        value: 0.15,
                    },
                },
            },
            { renderer, onError: (error) => console.error(error.stack) }
        );
        const frame = () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
        await frame();
        await Promise.all(
            host.getAnimations({ subtree: true }).map((a) => a.finished)
        );
        const unit = api.debug
            .getViewRoot()
            .getDescendants()
            .find((v) => v.name === "cells");
        const controller = unit.paramRuntime.getSelectionController("range");
        const at = (fraction) => {
            const r = controller.host.getProjectionCoords("color");
            const canvas = host.querySelector("canvas").getBoundingClientRect();
            return {
                x: canvas.x + r.x + r.width * (vertical ? 0.5 : fraction),
                y: canvas.y + r.y + r.height * (vertical ? 1 - fraction : 0.5),
            };
        };
        const selected = api.params.getSelection("range");
        const commits = [];
        selected.subscribe((value) => commits.push(value), {
            delivery: "commit",
        });
        globalThis.__gradient = {
            api,
            at,
            selected,
            commits,
            frame,
            host,
            unit,
            vertical,
        };
    }, renderer);
    const move = async (fraction) => {
        const p = await page.evaluate(
            (f) => globalThis.__gradient.at(f),
            fraction
        );
        await page.mouse.move(p.x, p.y);
    };
    await move(0.1);
    await page.waitForFunction(
        () =>
            globalThis.__gradient.host.querySelector("canvas").style.cursor ===
            (globalThis.__gradient.vertical ? "vertical-text" : "text")
    );
    await page.mouse.down();
    await move(0.5);
    assert.equal(
        await page.evaluate(() => globalThis.__gradient.commits.length),
        0,
        renderer + ": intermediate commit"
    );
    await page.mouse.up();
    const finite = await page.evaluate(
        () => globalThis.__gradient.selected.getValue().intervals.color
    );
    assert.ok(
        Math.abs(finite[0] - 0.1) < 0.01 && Math.abs(finite[1] - 0.5) < 0.01,
        renderer + ": numeric drag bounds"
    );
    await page.evaluate(() => globalThis.__gradient.selected.clear());
    await move(0.3);
    await page.mouse.down();
    await move(1);
    await page.mouse.up();
    assert.equal(
        await page.evaluate(
            () =>
                globalThis.__gradient.selected.getValue().intervals.color[1] ===
                Infinity
        ),
        true,
        renderer + ": open edge"
    );
    const pixels = await page.evaluate(async () => {
        const { api, unit, frame } = globalThis.__gradient;
        await frame();
        const { blob } = await api.imageExport.raster({
            background: null,
            pixelRatio: 1,
        });
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const rows = Array.from(unit.getCollector().getData());
        const points = rows.map((row) =>
            unit.coords.denormalizePoint(
                unit.mark.encoders.x(row),
                unit.mark.encoders.y(row),
                true
            )
        );
        const alphas = points.map(
            (p) =>
                context.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1)
                    .data[3]
        );
        let picked;
        for (let attempt = 0; attempt < 5; attempt++) {
            await frame();
            picked = await api.views
                .get({ scope: [], view: "cells" })
                .marks.pick(points[3]);
            if (picked.status !== "invalidated") break;
        }
        return {
            alphas,
            picked: picked.status === "hit" && picked.hit.datum.score === 1,
        };
    });
    assert.ok(
        pixels.alphas[0] < 80 &&
            pixels.alphas.slice(1).every((alpha) => alpha > 200),
        renderer + ": actual range pixels " + JSON.stringify(pixels)
    );
    assert.equal(pixels.picked, true, renderer + ": selected point picking");
    const exported = await page.evaluate(async () => {
        const { blob } = await globalThis.__gradient.api.imageExport.svg();
        const svg = new DOMParser().parseFromString(
            await blob.text(),
            "image/svg+xml"
        );
        return {
            label: svg.documentElement.textContent,
            brush: !!svg.querySelector('[data-name="gradientBrush"] rect'),
            ramps: svg.querySelectorAll(
                'linearGradient[id^="legend-gradient-"]'
            ).length,
        };
    });
    assert.ok(
        exported.label.includes(">= 0.3") &&
            exported.brush &&
            exported.ramps === 1,
        renderer + ": exported feedback"
    );
    await page.evaluate(() => globalThis.__gradient.frame());
    await move(0.6);
    await page.evaluate(() => globalThis.__gradient.frame());
    await page.waitForFunction(
        () =>
            globalThis.__gradient.host.querySelector("canvas").style.cursor ===
            "move"
    );
    await page.mouse.down();
    await move(0.4);
    await page.waitForFunction(
        () =>
            globalThis.__gradient.host.querySelector("canvas").style.cursor ===
            "grabbing"
    );
    await page.mouse.up();
    assert.ok(
        await page.evaluate(() =>
            Number.isFinite(
                globalThis.__gradient.selected.getValue().intervals.color[1]
            )
        ),
        renderer + ": translation restores finite edge"
    );
    await move(0.4);
    await page.mouse.wheel(0, -120);
    await page.evaluate(() => globalThis.__gradient.frame());
    const resized = await page.evaluate(
        () => globalThis.__gradient.selected.getValue().intervals.color
    );
    assert.ok(
        resized[1] - resized[0] < 0.7,
        renderer + ": wheel resizes range"
    );
    const clearPoint = await page.evaluate(() => globalThis.__gradient.at(0.9));
    await page.mouse.dblclick(clearPoint.x, clearPoint.y);
    assert.equal(
        await page.evaluate(
            () => globalThis.__gradient.selected.getValue().active
        ),
        false,
        renderer + ": ramp double-click clears"
    );
    await page.evaluate(() => globalThis.__gradient.selected.clear());
    await move(0.1);
    await page.mouse.down();
    await move(0.4);
    await page.evaluate(async () => {
        const { intervalSelection } = await import("/index.js");
        globalThis.__gradient.api.params
            .get("range")
            .setValue(intervalSelection({ color: [0.6, Infinity] }));
    });
    await move(0.8);
    await page.mouse.up();
    assert.equal(
        await page.evaluate(
            () => globalThis.__gradient.selected.getValue().intervals.color[0]
        ),
        0.6,
        renderer + ": stale drag restoration"
    );
    await page.evaluate(async (renderer) => {
        const { api: previous, host, frame } = globalThis.__gradient;
        previous.finalize();
        host.style.height = "600px";
        const { embed } = await import("/index.js");
        const spec = await (
            await fetch(
                "/examples/docs/grammar/legend/interactive-gradient-legend.json"
            )
        ).json();
        spec.baseUrl = new URL("/examples/", location.href).href;
        const api = await embed(host, spec, { renderer });
        await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
        await frame();
        await Promise.all(
            host.getAnimations({ subtree: true }).map((a) => a.finished)
        );
        const root = api.debug.getViewRoot();
        const unit = root
            .getDescendants()
            .find((v) => v.name === "immune_cells");
        const controller =
            unit.paramRuntime.getSelectionController("activation");
        const at = (fraction) => {
            const r = controller.host.getProjectionCoords("color");
            const c = host.querySelector("canvas").getBoundingClientRect();
            return {
                x: c.x + r.x + r.width * fraction,
                y: c.y + r.y + r.height / 2,
            };
        };
        const entries = root.getDescendants().find((v) => v.name === "entries");
        const row = Array.from(entries.getCollector().getData()).find(
            (row) => row.label === "T cell"
        );
        const canvas = host.querySelector("canvas").getBoundingClientRect();
        globalThis.__gradient = {
            api,
            unit,
            spec,
            host,
            frame,
            at,
            selected: api.params.getSelection("activation"),
            categoryPoint: {
                x: canvas.x + entries.coords.x + row.labelX + 2,
                y: canvas.y + entries.coords.y + row.labelY,
            },
        };
    }, renderer);
    const categoryPoint = await page.evaluate(
        () => globalThis.__gradient.categoryPoint
    );
    await page.mouse.move(categoryPoint.x, categoryPoint.y);
    await page.evaluate(() => globalThis.__gradient.frame());
    await page.mouse.click(categoryPoint.x, categoryPoint.y);
    await page.waitForFunction(
        () =>
            globalThis.__gradient.api.params
                .getSelection("cell_types")
                .getValue().active
    );
    await move(0.75);
    await page.mouse.down();
    await move(1);
    await page.mouse.up();
    await page.evaluate(() => globalThis.__gradient.frame());
    await page.waitForFunction(
        () => globalThis.__gradient.selected.getValue().active
    );
    const selectedCells = await page.evaluate(() => {
        const { unit } = globalThis.__gradient;
        return Array.from(unit.getCollector().getData())
            .filter((row) => unit.mark.encoders.fillOpacity(row) === 1)
            .map((row) => row.id);
    });
    assert.deepEqual(
        selectedCells,
        ["T7", "T8", "T9"],
        renderer + ": biological example predicate intersection"
    );
    if (renderer === "webgl")
        await page.screenshot({ path: "/tmp/interactive-gradient-legend.png" });
    const retained = await page.evaluate(async (renderer) => {
        const {
            api: previous,
            spec,
            host,
            frame,
            unit: previousUnit,
        } = globalThis.__gradient;
        const rows = Array.from(previousUnit.getCollector().getData());
        previous.finalize();
        if (renderer === "canvas") return null;
        const { embed, intervalSelection } = await import("/index.js");
        const { default: WebGlMark } =
            await import("/rendering/webgl/marks/webGlMark.js");
        const api = await embed(
            host,
            {
                ...spec,
                params: [
                    ...spec.params,
                    { name: "picked", select: "point" },
                    {
                        name: "spatial",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                data: {
                    values: Array.from({ length: 100000 }, (_, i) => ({
                        ...rows[i % rows.length],
                        id: "cell" + i,
                        sampling: i / 100000,
                    })),
                },
                mark: { ...spec.mark, semanticZoomFraction: 0.1 },
                encoding: {
                    ...spec.encoding,
                    key: { field: "id" },
                    semanticScore: { field: "sampling", type: "quantitative" },
                    opacity: {
                        condition: {
                            test: {
                                or: [
                                    spec.encoding.opacity.condition.test,
                                    { param: "picked", empty: false },
                                    { param: "spatial", empty: false },
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
        const unit = api.debug
            .getViewRoot()
            .getDescendants()
            .find((v) => v.name === "immune_cells");
        const mark = unit.mark;
        const picked = api.params.getSelection("picked");
        picked.setValue([["cell0"]]);
        api.params.get("spatial").setValue(intervalSelection({ x: [1, 2] }));
        api.params
            .get("activation")
            .setValue(intervalSelection({ color: [0.2, 0.7] }));
        await frame();
        const sample = mark.sampledSemanticScores,
            threshold = mark.getSemanticThreshold();
        const otherSelections = JSON.stringify([
            picked.getValue(),
            api.params.getSelection("spatial").getValue(),
        ]);
        const ramp = api.debug
            .getViewRoot()
            .getDescendants()
            .find((v) => v.name === "gradientRamp");
        const metrics = {
            chartCompletions: 0,
            rampCompletions: 0,
            uploads: 0,
            extraction: 0,
        };
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
        wrap(unit.getCollector(), "complete", () => metrics.chartCompletions++);
        wrap(ramp.getCollector(), "complete", () => metrics.rampCompletions++);
        wrap(mark, "initializeData", () => metrics.extraction++);
        if (renderer === "webgl")
            wrap(WebGlMark.prototype, "updateBufferInfo", function () {
                if (this.mark === mark) metrics.uploads++;
            });
        else
            wrap(GPUQueue.prototype, "writeBuffer", (args) => {
                if (
                    args[0].label.includes("immune_cells [point]") &&
                    args[0].label.endsWith(": series")
                )
                    metrics.uploads++;
            });
        try {
            for (let i = 0; i < 12; i++) {
                api.params.get("activation").setValue(
                    intervalSelection({
                        color: [i / 20, i % 2 ? Infinity : 0.9],
                    })
                );
                await frame();
            }
            return {
                ...metrics,
                sameSample:
                    mark.sampledSemanticScores === sample &&
                    mark.getSemanticThreshold() === threshold,
                sameSelections:
                    JSON.stringify([
                        picked.getValue(),
                        api.params.getSelection("spatial").getValue(),
                    ]) === otherSelections,
                domain: unit.getScaleResolution("color").getDomain(),
            };
        } finally {
            for (const restore of restores) restore();
            api.finalize();
        }
    }, renderer);
    if (retained)
        assert.deepEqual(
            retained,
            {
                chartCompletions: 0,
                rampCompletions: 0,
                uploads: 0,
                extraction: 0,
                sameSample: true,
                sameSelections: true,
                domain: [0, 1],
            },
            renderer + ": retained 100,000-row range updates"
        );

    console.log(
        renderer + ": gradient gestures, cursor, cancellation and SVG passed"
    );
});
