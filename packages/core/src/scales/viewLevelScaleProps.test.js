// @ts-nocheck

import { describe, expect, test } from "vitest";

import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";
import {
    attachViewLevelScaleProps,
    mapViewLevelScaleProps,
} from "./viewLevelScaleProps.js";

describe("view-level scale property mapping", () => {
    test("typed declarations support an empty container and preserve zoom across track mutations", async () => {
        const { view } = await createHeadlessEngine({
            resolve: { scale: { x: "shared" } },
            scales: {
                x: {
                    type: "locus",
                    assembly: {
                        name: "test",
                        contigs: [{ name: "chr1", size: 1000 }],
                    },
                },
            },
            vconcat: [],
        });
        const resolution = view.getScaleResolution("x");
        expect(resolution.getScale().domain()).toEqual([0, 1000]);
        // Navigate before any track exists, then retain that viewport through replacement.
        await resolution.zoomTo([100, 199]);
        const spec = {
            data: { values: [{ start: 20 }] },
            mark: "point",
            encoding: { x: { field: "start", type: "locus" } },
        };
        try {
            for (let i = 0; i < 2; i++) {
                const child = await view.addChildSpec(spec);
                expect(child.getScaleResolution("x")).toBe(resolution);
                expect(resolution.getScale().domain()).toEqual([100, 200]);
                await view.removeChildAt(0);
                expect(view.getScaleResolution("x")).toBe(resolution);
                expect(resolution.getScale().domain()).toEqual([100, 200]);
            }
        } finally {
            view.disposeSubtree();
        }
    });

    test("an initially populated typed shared scale survives removal of its last track", async () => {
        const { view } = await createHeadlessEngine({
            resolve: { scale: { x: "shared" } },
            scales: { x: { type: "linear", domain: [0, 100], zoom: true } },
            vconcat: [
                {
                    mark: "point",
                    data: { values: [{ x: 5 }] },
                    encoding: { x: { field: "x", type: "quantitative" } },
                },
            ],
        });
        try {
            const resolution = view.getScaleResolution("x");
            await resolution.zoomTo([20, 40]);
            await view.removeChildAt(0);
            expect(view.getScaleResolution("x")).toBe(resolution);
            expect(resolution.getScale().domain()).toEqual([20, 40]);
        } finally {
            view.disposeSubtree();
        }
    });

    test.each(["linear", undefined])(
        "nested declarations share the ancestor domain without encodings (type: %s)",
        async (type) => {
            const { view } = await createHeadlessEngine({
                scales: { x: { type, domain: [0, 100] } },
                // An untyped ancestor configures the child-owned scale. Keep its axis there.
                resolve: { axis: { x: "independent" } },
                layer: [
                    {
                        scales: { x: { type: "linear", domain: [0, 10] } },
                        data: { values: [{}] },
                        mark: "point",
                    },
                ],
            });
            try {
                const resolution = mapViewLevelScaleProps(view)[0].resolution;
                expect(view.children[0].getScaleResolution("x")).toBe(
                    resolution
                );
                expect(resolution.getScale().domain()).toEqual([0, 100]);
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test("a declared scale domain reacts without encoding members", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "end", value: 10 }],
            scales: { x: { type: "linear", domain: [0, { expr: "end" }] } },
            vconcat: [],
        });
        try {
            const resolution = view.getScaleResolution("x");
            expect(resolution.getScale().domain()).toEqual([0, 10]);
            view.paramRuntime.setValue("end", 20);
            await view.paramRuntime.whenPropagated();
            expect(resolution.getScale().domain()).toEqual([0, 20]);
        } finally {
            view.disposeSubtree();
        }
    });

    test("standalone value expressions can read a declared scale", async () => {
        const { view } = await createHeadlessEngine({
            scales: {
                x: {
                    type: "locus",
                    assembly: {
                        name: "test",
                        contigs: [{ name: "chr1", size: 1000 }],
                    },
                },
            },
            data: { values: [{}] },
            params: [{ name: "span", expr: "abs(span(domain('x')))" }],
            mark: { type: "text", text: { expr: "span" } },
        });
        try {
            expect(view.paramRuntime.getValue("span")).toBe(1000);
            view.getScaleResolution("x").getScale().domain([100, 200]);
            await view.paramRuntime.whenPropagated();
            expect(view.paramRuntime.getValue("span")).toBe(100);
        } finally {
            view.disposeSubtree();
        }
    });

    test("initial view creation attaches mapped declarations automatically", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }] },
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);

        expect(view.getScaleResolution("x").getScale().domain()).toEqual([
            0, 10,
        ]);
    });

    test("updates transitioned scale helper params when attaching initial declarations", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 100 }] },
            scales: {
                x: { domain: [0, 1] },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                {
                    name: "message",
                    data: { values: [{}] },
                    params: [
                        {
                            name: "zoomMessageState",
                            expr: "span(domain('x')) > 5 ? 1 : 0",
                            transition: { type: "lerp", halfLife: 60 },
                        },
                    ],
                    mark: "text",
                    encoding: {
                        text: { value: "Zoom in" },
                    },
                },
            ],
        };

        const { view } = await createHeadlessEngine(spec);
        const message = view.findDescendantByName("message");

        expect(message.paramRuntime.getValue("zoomMessageState")).toBe(0);
        expect(message.paramRuntime.getTargetValue("zoomMessageState")).toBe(0);
    });

    test("maps a subtree declaration to a unique visible scale resolution", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }] },
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const mappings = mapViewLevelScaleProps(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0].view).toBe(view);
        expect(mappings[0]).toMatchObject({
            channel: "x",
            props: { domain: [0, 10] },
        });
        expect(mappings[0].resolution).toBe(view.getScaleResolution("x"));
    });

    test("maps a composed view declaration to its shared inherited positional scale", async () => {
        // Mirrors tracks where a shared x encoding is defined on a vconcat and
        // one child repeats the inherited channel to customize other encodings.
        /** @type {import("../spec/view.js").ConcatSpec} */
        const spec = {
            assembly: "hg38",
            data: {
                values: [
                    {
                        chrom: "chr11",
                        start: 5280000,
                        end: 5280100,
                        score: 3,
                    },
                ],
            },
            scales: {
                x: {
                    domain: [
                        { chrom: "chr11", pos: 5280000 },
                        { chrom: "chr11", pos: 5290000 },
                    ],
                },
            },
            encoding: {
                x: { chrom: "chrom", pos: "start", type: "locus" },
                x2: { chrom: "chrom", pos: "end" },
            },
            resolve: {
                axis: { x: "shared" },
            },
            vconcat: [
                {
                    height: 140,
                    mark: "rect",
                    encoding: {
                        x: { chrom: "chrom", pos: "start", type: "locus" },
                        y: {
                            field: "score",
                            type: "quantitative",
                            axis: { grid: true },
                        },
                    },
                },
                {
                    height: 80,
                    mark: "rect",
                    encoding: {
                        color: { field: "score", type: "quantitative" },
                    },
                },
            ],
            config: {
                view: { stroke: "lightgray" },
            },
        };

        const view = await initView(spec, ConcatView);
        const mappings = mapViewLevelScaleProps(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0].view).toBe(view);
        expect(mappings[0]).toMatchObject({
            channel: "x",
            props: {
                domain: [
                    { chrom: "chr11", pos: 5280000 },
                    { chrom: "chr11", pos: 5290000 },
                ],
            },
        });
        expect(mappings[0].resolution).toBe(
            view.children[0].getScaleResolution("x")
        );
        expect(mappings[0].resolution).toBe(
            view.children[1].getScaleResolution("x")
        );
    });

    test("ignores excluded child subtrees when mapping a parent props", async () => {
        /** @type {import("../spec/view.js").ConcatSpec} */
        const spec = {
            assembly: "hg38",
            params: [{ name: "brush", value: null }],
            scales: {
                x: {
                    domain: {
                        param: "brush",
                        initial: [
                            { chrom: "chr6", pos: 20000000 },
                            { chrom: "chr11", pos: 40000000 },
                        ],
                    },
                },
            },
            vconcat: [
                {
                    resolve: { scale: { x: "excluded" } },
                    vconcat: [
                        {
                            params: [
                                {
                                    name: "brush",
                                    select: {
                                        type: "interval",
                                        encodings: ["x"],
                                    },
                                    push: "outer",
                                },
                            ],
                            data: {
                                values: [
                                    { chrom: "chr1", pos: 1 },
                                    { chrom: "chr2", pos: 1 },
                                ],
                            },
                            mark: "point",
                            encoding: {
                                x: {
                                    chrom: "chrom",
                                    pos: "pos",
                                    type: "locus",
                                },
                                y: { value: 0 },
                            },
                        },
                        {
                            data: {
                                values: [
                                    { chrom: "chr1", pos: 1 },
                                    { chrom: "chr2", pos: 1 },
                                ],
                            },
                            mark: "rule",
                            encoding: {
                                x: {
                                    chrom: "chrom",
                                    pos: "pos",
                                    type: "locus",
                                },
                            },
                        },
                    ],
                },
                {
                    data: {
                        values: [
                            { chrom: "chr6", pos: 30000000 },
                            { chrom: "chr11", pos: 30000000 },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: {
                            chrom: "chrom",
                            pos: "pos",
                            type: "locus",
                        },
                        y: { value: 0 },
                    },
                },
            ],
        };

        const view = await initView(spec, ConcatView);
        const detail = view.children[1];
        const resolution = detail.getScaleResolution("x");
        const mappings = mapViewLevelScaleProps(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0].resolution).toBe(resolution);
        expect(resolution.getComplexDomain()).toEqual([
            { chrom: "chr6", pos: 20000000 },
            { chrom: "chr11", pos: 40000000 },
        ]);
        expect(resolution.getLinkedSelectionDomainInfo()).toMatchObject({
            param: "brush",
            encoding: "x",
        });
    });

    test("keeps an empty subtree props pending", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [],
        };

        const view = await initView(spec, LayerView);
        const mappings = mapViewLevelScaleProps(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0].view).toBe(view);
        expect(mappings[0]).toMatchObject({
            channel: "x",
            props: { domain: [0, 10] },
            resolution: undefined,
        });
    });

    test("rejects declarations that map to multiple visible scale resolutions", async () => {
        /** @type {import("../spec/view.js").ConcatSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            concat: [
                {
                    data: { values: [{ value: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                {
                    data: { values: [{ value: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };

        const { view } = await createHeadlessViewHierarchy(spec);

        expect(() => mapViewLevelScaleProps(view)).toThrow(
            "View-level scales.x maps to multiple scale resolutions."
        );
    });

    test("attaches mapped declarations to target scale resolutions", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }] },
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const [mapping] = attachViewLevelScaleProps(view);

        expect(mapping.resolution.getViewLevelScaleProps()).toEqual({
            view,
            props: { domain: [0, 10] },
        });
    });

    test("attaches pending props when a matching child is added", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [],
        };

        const view = await initView(spec, LayerView);
        await view.addChildSpec({
            data: { values: [{ value: 1 }] },
            mark: "point",
            encoding: {
                x: { field: "value", type: "quantitative" },
            },
        });

        expect(view.getScaleResolution("x").getScale().domain()).toEqual([
            0, 10,
        ]);
    });

    test("dynamically added descendant props is shadowed by an attached ancestor props", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }] },
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [
                {
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "value",
                                    type: "quantitative",
                                },
                            },
                        },
                    ],
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const nestedView = /** @type {LayerView} */ (view.children[0]);
        const resolution = view.getScaleResolution("x");

        await nestedView.addChildSpec({
            scales: {
                x: { domain: [2, 8], reverse: true },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        });

        expect(resolution.getViewLevelScaleProps()).toEqual({
            view,
            props: { domain: [0, 10] },
        });
        expect(resolution.getScale().domain()).toEqual([0, 10]);
        expect(resolution.getScale().props.reverse).toBeUndefined();
    });

    test("returns a view-level props to pending when the last matching child is removed", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [],
        };

        const view = await initView(spec, LayerView);
        await view.addChildSpec({
            data: { values: [{ value: 1 }] },
            mark: "point",
            encoding: {
                x: { field: "value", type: "quantitative" },
            },
        });
        const removedResolution = view.getScaleResolution("x");

        await view.removeChildAt(0);
        const [mapping] = mapViewLevelScaleProps(view);

        expect(removedResolution.getViewLevelScaleProps()).toBeUndefined();
        expect(mapping.view).toBe(view);
        expect(mapping).toMatchObject({
            channel: "x",
            props: { domain: [0, 10] },
            resolution: undefined,
        });
    });

    test("rejects ambiguous view-level props during initialization", async () => {
        /** @type {import("../spec/view.js").ConcatSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            concat: [
                {
                    data: { values: [{ value: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                {
                    data: { values: [{ value: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };

        await expect(initView(spec, ConcatView)).rejects.toThrow(
            "View-level scales.x maps to multiple scale resolutions."
        );
    });
});
