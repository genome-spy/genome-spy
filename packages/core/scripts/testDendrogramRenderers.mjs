import { URL } from "node:url";
/* global console, structuredClone, document, requestAnimationFrame, DOMParser, AbortSignal, createImageBitmap, MouseEvent, setTimeout, clearTimeout */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testRenderers } from "./testRenderers.mjs";

const fixture = JSON.parse(
    await readFile(
        new URL(
            "../../../examples/core/marks/link/dendrogram-gaps.json",
            import.meta.url
        ),
        "utf8"
    )
);

await testRenderers(
    [
        { deviceScaleFactor: 2, reverse: false },
        { deviceScaleFactor: 2, reverse: true },
    ],
    async (page, renderer, { reverse }) => {
        const result = await page.evaluate(
            async ({ fixture, renderer, reverse }) => {
                const { embed } = await import("/index.js");
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "600px";
                host.style.height = "300px";
                document.body.append(host);
                delete fixture.height;
                fixture.padding = 0;
                // Keep the test host free of bound controls.
                delete fixture.params[0].bind;
                Object.assign(fixture.scales.y, {
                    name: "rows",
                    reverse,
                });
                const tree = fixture.hconcat[0];
                tree.params = [
                    {
                        name: "picked",
                        select: {
                            type: "point",
                            on: "click",
                            toggle: false,
                        },
                    },
                ];
                Object.assign(tree.mark, {
                    tooltip: false,
                    minPickingSize: 8,
                });
                tree.encoding.color = {
                    condition: {
                        param: "picked",
                        empty: false,
                        value: "red",
                    },
                    value: "#34495e",
                };
                tree.encoding.order = {
                    condition: {
                        param: "picked",
                        empty: false,
                        value: 1,
                    },
                    value: 0,
                };
                fixture.hconcat[1].params = [
                    {
                        name: "brush",
                        select: {
                            type: "interval",
                            encodings: ["y"],
                        },
                    },
                ];
                for (const child of fixture.hconcat) {
                    child.encoding.x.axis = null;
                    child.encoding.y.axis = null;
                }
                const errors = [];
                const api = await embed(host, fixture, {
                    renderer,
                    onError: (error) => errors.push(error.message),
                });
                await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                errors.push(
                    ...api.dataLoading
                        .getSnapshot()
                        .filter((entry) => entry.status == "error")
                        .map((entry) => entry.error)
                );
                const frame = () =>
                    new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        )
                    );
                await frame();
                const treeView = api.views.get({
                    scope: [],
                    view: "dendrogram",
                });
                const heatmapView = api.views.get({
                    scope: [],
                    view: "heatmap",
                });
                const states = [];
                for (const navigate of [false, true]) {
                    if (navigate) {
                        await api
                            .getScaleResolutionByName("rows")
                            .zoomTo([0.2, 2.8]);
                        host.style.height = "420px";
                        await frame();
                    }
                    const exported = await api.imageExport.svg();
                    const svg = new DOMParser().parseFromString(
                        await exported.blob.text(),
                        "image/svg+xml"
                    );
                    const paths = Array.from(
                        svg.querySelectorAll('[data-mark-type="link"] path')
                    );
                    const points = paths.map((path) =>
                        path
                            .getAttribute("d")
                            .match(/-?\d+(?:\.\d+)?/g)
                            .map(Number)
                    );
                    const rects = Array.from(
                        svg.querySelectorAll('[data-mark-type="rect"] rect')
                    );
                    const leafErrors = points.slice(0, 4).map((point, i) => {
                        const cell = rects[i * 4];
                        return Math.abs(
                            point[5] -
                                (+cell.getAttribute("y") +
                                    +cell.getAttribute("height") / 2)
                        );
                    });
                    const [sx, sy, ex, ey, tx, ty] = points.at(-1);
                    const probes = [
                        [sx + 0.5, (sy + ey) / 2],
                        [(ex + tx) / 2, ty],
                        [ex + 1, ey],
                    ];
                    const picks = [];
                    for (const [x, y] of probes) {
                        const pick = await treeView.marks.pick({
                            x,
                            y,
                        });
                        picks.push(
                            pick.status == "hit"
                                ? pick.hit.datum.targetId
                                : pick.status
                        );
                    }
                    const raster = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 2,
                    });
                    const bitmap = await createImageBitmap(raster.blob);
                    const canvas = document.createElement("canvas");
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    const alpha = probes.map(
                        ([x, y]) =>
                            ctx.getImageData(
                                Math.floor(x * 2),
                                Math.floor(y * 2),
                                1,
                                1
                            ).data[3]
                    );
                    states.push({
                        leafErrors,
                        picks,
                        alpha,
                        paths: paths.length,
                        rasterBytes: raster.blob.size,
                        warnings: exported.warnings,
                    });
                }
                // The heatmap still accepts ordinary integer-row interval selections.
                heatmapView.params.get("brush").setValue({
                    type: "interval",
                    intervals: { y: [0, 2] },
                });
                const brush = heatmapView.params
                    .getSelection("brush")
                    .getValue();
                const bounds = api.views.getLayoutBounds(treeView);
                const svgBefore = await api.imageExport.svg();
                const parsed = new DOMParser().parseFromString(
                    await svgBefore.blob.text(),
                    "image/svg+xml"
                );
                const last = Array.from(
                    parsed.querySelectorAll('[data-mark-type="link"] path')
                )
                    .at(-1)
                    .getAttribute("d")
                    .match(/-?\d+(?:\.\d+)?/g)
                    .map(Number);
                await frame();
                const selectionApi = treeView.params.getSelection("picked");
                const selectionChanged = new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        unsubscribe();
                        reject(
                            new Error("Timed out waiting for edge selection")
                        );
                    }, 5000);
                    const unsubscribe = selectionApi.subscribe((snapshot) => {
                        if (snapshot.active) {
                            clearTimeout(timer);
                            unsubscribe();
                            resolve(snapshot);
                        }
                    });
                });
                const canvas = host.querySelector("canvas");
                const canvasBounds = canvas.getBoundingClientRect();
                canvas.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        clientX: canvasBounds.left + (last[2] + last[4]) / 2,
                        clientY: canvasBounds.top + last[5],
                    })
                );
                await frame();
                const selected = await selectionChanged;
                api.params.get("shape").setValue("diagonal");
                await frame();
                const curved = await api.imageExport.svg();
                const curves =
                    (await curved.blob.text()).match(/ d="M [^"]* C /g)
                        ?.length ?? 0;
                api.params.get("shape").setValue("orthogonal");
                api.views.root().datasets.set("tree", []);
                await frame();
                const empty = await api.imageExport.svg();
                const emptyPaths = new DOMParser()
                    .parseFromString(await empty.blob.text(), "image/svg+xml")
                    .querySelectorAll('[data-mark-type="link"] path').length;
                api.views.root().datasets.set(
                    "tree",
                    fixture.datasets.tree.map((node) => ({
                        ...node,
                        height: node.height * 0.8,
                    }))
                );
                await frame();
                const restored = await api.imageExport.svg();
                const restoredPaths = new DOMParser()
                    .parseFromString(
                        await restored.blob.text(),
                        "image/svg+xml"
                    )
                    .querySelectorAll('[data-mark-type="link"] path').length;
                api.finalize();
                return {
                    states,
                    errors,
                    brush,
                    selected,
                    curves,
                    emptyPaths,
                    restoredPaths,
                    bounds,
                };
            },
            { fixture: structuredClone(fixture), renderer, reverse }
        );
        assert.deepEqual(result.errors, [], `${renderer}: loading errors`);
        for (const state of result.states) {
            assert.equal(state.paths, 6);
            assert.ok(
                state.leafErrors.every((error) => error < 0.11),
                `${renderer}: leaf alignment`
            );
            assert.ok(
                state.picks.every((id) =>
                    ["A", "B", "C", "D", "AB", "ABC"].includes(id)
                ),
                `${renderer}: picking ${JSON.stringify(state.picks)}`
            );
            assert.ok(
                state.alpha.every((alpha) => alpha > 0),
                `${renderer}: raster coverage ${state.alpha}`
            );
            assert.ok(state.rasterBytes > 100);
            assert.deepEqual(state.warnings, []);
        }
        assert.equal(result.brush.active, true);
        assert.equal(
            result.selected.active,
            true,
            `${renderer}: click selects an edge`
        );
        assert.equal(result.curves, 6);
        assert.equal(result.emptyPaths, 0);
        assert.equal(result.restoredPaths, 6);
        console.log(
            `${renderer}, reverse=${reverse}: shared rows, navigation, picking, selections, updates, and exports passed.`
        );
    }
);
