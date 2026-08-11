import { describe, expect, test } from "vitest";

import UnitView from "../view/unitView.js";
import ConcatView from "../view/concatView.js";
import { initView } from "./scaleResolutionTestUtils.js";

/**
 * @returns {import("../spec/view.js").UnitSpec}
 */
function colorUnit() {
    return {
        mark: "point",
        encoding: {
            color: { field: "group", type: "nominal" },
        },
    };
}

describe("Legend resolution topology", () => {
    test("collected follows shared scale resolution", async () => {
        const root = /** @type {ConcatView} */ (
            await initView(
                {
                    config: { legend: { disable: true } },
                    data: { values: [{ group: "A" }] },
                    vconcat: [
                        {
                            resolve: { legend: { color: "collected" } },
                            layer: [colorUnit(), colorUnit()],
                        },
                    ],
                },
                ConcatView
            )
        );
        const view = /** @type {import("../view/layerView.js").default} */ (
            root.children[0]
        );
        const [first, second] = view.children;

        expect(first.getScaleResolution("color")).toBe(
            second.getScaleResolution("color")
        );
        expect(first.getLegendResolution("color")).toBe(
            second.getLegendResolution("color")
        );
        expect(first.getLegendResolution("color")).toBe(
            view.resolutions.legend.color
        );
    });

    test("collected follows independent scale resolution", async () => {
        const root = /** @type {ConcatView} */ (
            await initView(
                {
                    config: { legend: { disable: true } },
                    data: { values: [{ group: "A" }] },
                    vconcat: [
                        {
                            resolve: {
                                scale: { color: "independent" },
                                legend: { color: "collected" },
                            },
                            layer: [colorUnit(), colorUnit()],
                        },
                    ],
                },
                ConcatView
            )
        );
        const view = /** @type {import("../view/layerView.js").default} */ (
            root.children[0]
        );
        const [first, second] = view.children;

        expect(first.getScaleResolution("color")).not.toBe(
            second.getScaleResolution("color")
        );
        expect(first.getLegendResolution("color")).not.toBe(
            second.getLegendResolution("color")
        );
        expect(view.resolutions.legend.color).toBeUndefined();
    });

    test("excluded keeps an authored unit legend resolution local", async () => {
        const view = await initView(
            {
                ...colorUnit(),
                config: { legend: { disable: true } },
                data: { values: [{ group: "A" }] },
                resolve: { legend: { color: "excluded" } },
            },
            UnitView
        );

        expect(view.resolutions.legend.color).toBeDefined();
        expect(view.getLegendResolution("color")).toBe(
            view.resolutions.legend.color
        );
    });
});
