/* global document, location, requestAnimationFrame, DOMParser */
import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers([{ deviceScaleFactor: 1 }], async (page, renderer) => {
    await page.evaluate(async (renderer) => {
        const { embed } = await import("/index.js");
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
                            orient: "bottom",
                            direction: "horizontal",
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
        await Promise.race([
            Promise.all(
                host.getAnimations({ subtree: true }).map((a) => a.finished)
            ),
            new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
        const unit = api.debug
            .getViewRoot()
            .getDescendants()
            .find((v) => v.name === "cells");
        const controller = unit.paramRuntime.getSelectionController("range");
        const at = (fraction) => {
            const r = controller.host.getProjectionCoords("color");
            const canvas = host.querySelector("canvas").getBoundingClientRect();
            return {
                x: canvas.x + r.x + r.width * fraction,
                y: canvas.y + r.y + r.height / 2,
            };
        };
        const selected = api.params.getSelection("range");
        const commits = [];
        selected.subscribe((value) => commits.push(value), {
            delivery: "commit",
        });
        globalThis.__gradient = { api, at, selected, commits, frame, host };
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
            "text"
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
        exported.label.includes("≥ 0.3") &&
            exported.brush &&
            exported.ramps === 1,
        renderer + ": exported feedback"
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
    await page.evaluate(() => globalThis.__gradient.api.finalize());
    console.log(
        renderer + ": gradient gestures, cursor, cancellation and SVG passed"
    );
});
