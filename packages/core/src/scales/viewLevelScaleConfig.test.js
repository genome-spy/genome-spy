// @ts-nocheck

import { describe, expect, test } from "vitest";

import { createHeadlessViewHierarchy } from "../genomeSpy/headlessBootstrap.js";
import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";
import {
    attachViewLevelScaleConfigs,
    mapViewLevelScaleConfigs,
} from "./viewLevelScaleConfig.js";

describe("view-level scale config mapping", () => {
    test("initial view creation attaches mapped configs automatically", async () => {
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

    test("maps a subtree config to a unique visible scale resolution", async () => {
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
        const mappings = mapViewLevelScaleConfigs(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0]).toMatchObject({
            view,
            channel: "x",
            config: { domain: [0, 10] },
        });
        expect(mappings[0].resolution).toBe(view.getScaleResolution("x"));
    });

    test("maps a composed view config to its shared inherited positional scale", async () => {
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
        const mappings = mapViewLevelScaleConfigs(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0]).toMatchObject({
            view,
            channel: "x",
            config: {
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

    test("keeps an empty subtree config pending", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            scales: {
                x: { domain: [0, 10] },
            },
            layer: [],
        };

        const view = await initView(spec, LayerView);
        const mappings = mapViewLevelScaleConfigs(view);

        expect(mappings).toHaveLength(1);
        expect(mappings[0]).toMatchObject({
            view,
            channel: "x",
            config: { domain: [0, 10] },
            resolution: undefined,
        });
    });

    test("rejects configs that map to multiple visible scale resolutions", async () => {
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

        expect(() => mapViewLevelScaleConfigs(view)).toThrow(
            "View-level scales.x maps to multiple scale resolutions."
        );
    });

    test("attaches mapped configs to target scale resolutions", async () => {
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
        const [mapping] = attachViewLevelScaleConfigs(view);

        expect(mapping.resolution.getViewLevelScaleConfig()).toEqual({
            view,
            config: { domain: [0, 10] },
        });
    });

    test("attaches pending config when a matching child is added", async () => {
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

    test("returns a view-level config to pending when the last matching child is removed", async () => {
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
        const [mapping] = mapViewLevelScaleConfigs(view);

        expect(removedResolution.getViewLevelScaleConfig()).toBeUndefined();
        expect(mapping).toMatchObject({
            view,
            channel: "x",
            config: { domain: [0, 10] },
            resolution: undefined,
        });
    });

    test("rejects ambiguous view-level config during initialization", async () => {
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
