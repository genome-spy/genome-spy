// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

describe("ScaleResolution view-level config attachment", () => {
    test("stores and clears view-level scale config", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");
        const config = { domain: [0, 10] };

        resolution.attachViewLevelScaleConfig(view, config);

        expect(resolution.getViewLevelScaleConfig()).toEqual({
            view,
            config,
        });

        resolution.clearViewLevelScaleConfig(view);

        expect(resolution.getViewLevelScaleConfig()).toBeUndefined();
    });

    test("allows the same view to replace its view-level scale config", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");
        const firstConfig = { domain: [0, 10] };
        const secondConfig = { domain: [2, 8] };

        resolution.attachViewLevelScaleConfig(view, firstConfig);
        resolution.attachViewLevelScaleConfig(view, secondConfig);

        expect(resolution.getViewLevelScaleConfig()).toEqual({
            view,
            config: secondConfig,
        });
    });

    test("rejects duplicate view-level configs for the same resolution", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] });

        expect(() =>
            resolution.attachViewLevelScaleConfig(view.children[0], {
                domain: [2, 8],
            })
        ).toThrow(
            "Multiple view-level scale configs target the same x scale resolution."
        );
    });
});

async function createSharedLayer() {
    /** @type {import("../spec/view.js").LayerSpec} */
    const spec = {
        data: { values: [{ value: 1 }] },
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

    return initView(spec, LayerView);
}
