/* global console, URL, document, DOMParser, DOMPoint, WebGL2RenderingContext, requestAnimationFrame */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
    loadPlaywright,
    startDevServer,
    stopServer,
    waitForServer,
} from "./captureScreenshots.mjs";

const spec = JSON.parse(
    await readFile(
        new URL(
            "../../../examples/docs/grammar/parameters/interactive-legend.json",
            import.meta.url
        )
    )
);
const origin = "http://127.0.0.1:4174";
const server = await startDevServer(origin);
try {
    await waitForServer(origin, server);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({
        channel: "chrome",
        args: ["--use-angle=metal"],
    });
    try {
        for (const renderer of ["canvas", "webgl"]) {
            for (const deviceScaleFactor of [1, 2]) {
                const context = await browser.newContext({ deviceScaleFactor });
                try {
                    const page = await context.newPage();
                    await page.route("**/favicon.ico", (route) =>
                        route.fulfill({ status: 204 })
                    );
                    const failures = [];
                    page.on("pageerror", (error) =>
                        failures.push(error.message)
                    );
                    page.on("console", (message) => {
                        if (message.type() === "error")
                            failures.push(message.text());
                    });
                    await page.goto(`${origin}/screenshot.html`);
                    await page.evaluate(
                        async ({ spec, renderer }) => {
                            const { embed } = await import("/index.js");
                            document.body.replaceChildren();
                            document.body.style.cssText =
                                "margin:0;display:block";
                            const host = document.createElement("div");
                            document.body.append(host);
                            globalThis.api = await embed(host, spec, {
                                renderer,
                                bare: true,
                            });
                        },
                        { spec, renderer }
                    );
                    await page.waitForFunction(
                        () =>
                            Math.abs(
                                document
                                    .querySelector("canvas")
                                    .getBoundingClientRect().width -
                                    globalThis.api.getLogicalCanvasSize().width
                            ) < 0.1
                    );
                    const labels = await page.evaluate(async () => {
                        const result = await globalThis.api.imageExport.svg();
                        const svg = document.importNode(
                            new DOMParser().parseFromString(
                                await result.blob.text(),
                                "image/svg+xml"
                            ).documentElement,
                            true
                        );
                        svg.style.cssText =
                            "position:absolute;top:0;left:0;visibility:hidden";
                        document.body.append(svg);
                        const labels = [...svg.querySelectorAll("text")]
                            .filter((text) =>
                                ["Excitatory", "Inhibitory", "Glia"].includes(
                                    text.textContent
                                )
                            )
                            .map((text) => {
                                const bounds = text.getBBox();
                                const point = new DOMPoint(
                                    bounds.x + bounds.width / 2,
                                    bounds.y + bounds.height / 2
                                ).matrixTransform(text.getCTM());
                                return { x: point.x, y: point.y };
                            });
                        svg.remove();
                        const canvas = document
                            .querySelector("canvas")
                            .getBoundingClientRect();
                        return labels.map(({ x, y }) => ({
                            x: x + canvas.x,
                            y: y + canvas.y,
                        }));
                    });
                    assert.equal(labels.length, 3);
                    await page.evaluate(() => {
                        globalThis.uploads = 0;
                        globalThis.allocations = 0;
                        for (const method of ["bufferData", "bufferSubData"]) {
                            const original =
                                WebGL2RenderingContext.prototype[method];
                            WebGL2RenderingContext.prototype[method] =
                                function (...args) {
                                    if (args[0] === this.ARRAY_BUFFER)
                                        globalThis.uploads++;
                                    return original.apply(this, args);
                                };
                        }
                        const create =
                            WebGL2RenderingContext.prototype.createTexture;
                        WebGL2RenderingContext.prototype.createTexture =
                            function () {
                                globalThis.allocations++;
                                return create.call(this);
                            };
                    });
                    const values = () =>
                        page.evaluate(() =>
                            globalThis.api.views
                                .get({ scope: [], view: "left" })
                                .params.get("cell_types")
                                .getValue()
                        );
                    const waitForValues = (/** @type {string[]} */ expected) =>
                        page.waitForFunction(
                            (expected) =>
                                JSON.stringify(
                                    globalThis.api.views
                                        .get({ scope: [], view: "left" })
                                        .params.get("cell_types")
                                        .getValue()
                                ) === JSON.stringify(expected),
                            expected
                        );
                    await page.mouse.click(labels[0].x, labels[0].y);
                    await waitForValues(["Excitatory"]);
                    assert.deepEqual(await values(), ["Excitatory"]);
                    await page.keyboard.down("Shift");
                    await page.mouse.click(labels[1].x, labels[1].y);
                    await page.keyboard.up("Shift");
                    await waitForValues(["Excitatory", "Inhibitory"]);
                    assert.deepEqual(await values(), [
                        "Excitatory",
                        "Inhibitory",
                    ]);
                    const focused = await page.evaluate(async () => {
                        await new Promise(requestAnimationFrame);
                        const result = await globalThis.api.imageExport.svg();
                        const doc = new DOMParser().parseFromString(
                            await result.blob.text(),
                            "image/svg+xml"
                        );
                        return {
                            dimmed: [
                                ...doc.querySelectorAll(
                                    '[data-name="labels"] text[fill-opacity="0.35"]'
                                ),
                            ].length,
                            dimmedPoints: [
                                ...doc.querySelectorAll(
                                    '[fill-opacity="0.12"]'
                                ),
                            ].length,
                            labels: [...doc.querySelectorAll("text")]
                                .filter((node) =>
                                    [
                                        "Excitatory",
                                        "Inhibitory",
                                        "Glia",
                                    ].includes(node.textContent)
                                )
                                .map((node) => node.textContent),
                        };
                    });
                    assert.ok(
                        focused.dimmed > 0,
                        "Unselected legend entries dim"
                    );
                    assert.ok(
                        focused.dimmedPoints > 0,
                        "Unselected points dim"
                    );
                    assert.deepEqual(focused.labels, [
                        "Excitatory",
                        "Inhibitory",
                        "Glia",
                    ]);
                    await page.mouse.dblclick(labels[2].x, labels[2].y);
                    await waitForValues([]);
                    assert.deepEqual(await values(), []);
                    const resources = await page.evaluate(() => ({
                        uploads: globalThis.uploads,
                        allocations: globalThis.allocations,
                    }));
                    if (renderer === "webgl")
                        assert.equal(
                            resources.allocations,
                            0,
                            "Focus reuses existing range textures"
                        );
                    assert.deepEqual(failures, []);
                    console.log(
                        `${renderer} DPR ${deviceScaleFactor}: click, Shift-toggle, clear, SVG appearance and retained range textures passed`
                    );
                    await page.evaluate(() => globalThis.api.finalize());
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await browser.close();
    }
} finally {
    await stopServer(server);
}
