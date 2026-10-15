/* global console, document, AbortSignal, createImageBitmap, requestAnimationFrame */

import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, { deviceScaleFactor }) => {
        const results = await page.evaluate(
            async ({ renderer }) => {
                const { embed } = await import("/index.js");
                const cases = [];
                for (const orient of ["horizontal", "vertical"]) {
                    for (const reverse of [false, true]) {
                        for (const [
                            label,
                            target,
                            inside,
                            outside,
                            source = [50, 50],
                            hasInk = !!inside,
                        ] of [
                            ["short first", [75, 49], [53, 50], [46, 53]],
                            ["short second", [51, 25], [50, 27], [54, 21]],
                            ["both short", [51, 49], [50, 49], [54, 46]],
                            ["collapsed first", [75, 50], [53, 50], [49, 53]],
                            ["collapsed second", [50, 25], [50, 27], [53, 24]],
                            [
                                "offscreen picking",
                                [-6, 75],
                                [2, 60],
                                [5, 60],
                                [-6, 50],
                                false,
                            ],
                            ["coincident", [50, 50], null, [50, 50]],
                        ]) {
                            const project = (point) => {
                                if (!point) return null;
                                const [x, y] =
                                    orient == "horizontal"
                                        ? point
                                        : [point[1], point[0]];
                                return reverse ? [100 - x, 100 - y] : [x, y];
                            };
                            cases.push({
                                label,
                                orient,
                                reverse,
                                source: project(source),
                                hasInk,
                                target: project(target),
                                inside: project(inside),
                                outside: project(outside),
                            });
                        }
                    }
                }
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "780px";
                host.style.height = "440px";
                document.body.append(host);
                const errors = [];
                const api = await embed(
                    host,
                    {
                        padding: 0,
                        columns: 7,
                        spacing: 6,
                        concat: cases.map((item, i) => ({
                            name: "case" + i,
                            width: 100,
                            height: 100,
                            data: { values: [{ id: i }] },
                            mark: {
                                type: "link",
                                linkShape: "orthogonal",
                                orient: item.orient,
                                size: 10,
                                opacity: 0.5,
                                minPickingSize: 20,
                                clip: true,
                                tooltip: false,
                            },
                            encoding: {
                                x: { value: item.source[0] / 100 },
                                y: {
                                    value: 1 - item.source[1] / 100,
                                },
                                x2: { value: item.target[0] / 100 },
                                y2: {
                                    value: 1 - item.target[1] / 100,
                                },
                                color: { value: "red" },
                            },
                        })),
                    },
                    {
                        renderer,
                        onError: (error) => errors.push(error.message),
                    }
                );
                await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
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
                const results = [];
                for (const [i, item] of cases.entries()) {
                    const view = api.views.get({
                        scope: [],
                        view: "case" + i,
                    });
                    const bounds = api.views.getLayoutBounds(view);
                    const point = (p) => ({
                        x: bounds.x + p[0],
                        y: bounds.y + p[1],
                    });
                    let maximumAlpha = 0;
                    const pixels = ctx.getImageData(
                        Math.round(bounds.x * 2),
                        Math.round(bounds.y * 2),
                        200,
                        200
                    ).data;
                    for (let j = 3; j < pixels.length; j += 4)
                        maximumAlpha = Math.max(maximumAlpha, pixels[j]);
                    const outside = await view.marks.pick(point(item.outside));
                    let inside = null;
                    if (item.inside) {
                        const pick = await view.marks.pick(point(item.inside));
                        inside =
                            pick.status == "hit"
                                ? pick.hit.datum.id
                                : pick.status;
                    }
                    results.push({
                        label: `${item.label} ${item.orient} reverse=${item.reverse}`,
                        i,
                        maximumAlpha,
                        inside,
                        outside: outside.status,
                        coincident: !item.inside,
                        hasInk: item.hasInk,
                    });
                }
                api.finalize();
                return { results, errors };
            },
            { renderer }
        );
        assert.deepEqual(results.errors, []);
        for (const result of results.results) {
            const label = `${renderer}, DPR ${deviceScaleFactor}, ${result.label}`;
            assert.equal(
                result.outside,
                "empty",
                `${label}: butt cap/corner picking`
            );
            assert.ok(
                result.maximumAlpha <= 130,
                `${label}: overlapping ink (alpha ${result.maximumAlpha})`
            );
            if (!result.hasInk) {
                assert.equal(result.maximumAlpha, 0, label);
            } else {
                assert.ok(result.maximumAlpha >= 125, `${label}: missing ink`);
            }
            if (!result.coincident) {
                assert.equal(result.inside, result.i, `${label}: picking`);
            }
        }
        console.log(
            `${renderer}, DPR ${deviceScaleFactor}: short legs, reversal, collapsed legs, opacity, and picking passed.`
        );
    }
);
