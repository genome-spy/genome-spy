// @ts-nocheck

import { describe, expect, test } from "vitest";

import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import { initView } from "./scaleResolutionTestUtils.js";
import { mapViewLevelScaleConfigs } from "./viewLevelScaleConfig.js";

describe("view-level scale config mapping", () => {
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
            pending: false,
        });
        expect(mappings[0].resolution).toBe(view.getScaleResolution("x"));
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
            pending: true,
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

        const view = await initView(spec, ConcatView);

        expect(() => mapViewLevelScaleConfigs(view)).toThrow(
            "View-level scales.x maps to multiple scale resolutions."
        );
    });
});
