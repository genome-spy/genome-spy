import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
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
    test("collected keeps legend resolutions independent without changing scales", async () => {
        const view = /** @type {LayerView} */ (
            await initView(
                {
                    config: { legend: { disable: true } },
                    data: { values: [{ group: "A" }] },
                    resolve: { legend: { color: "collected" } },
                    layer: [colorUnit(), colorUnit()],
                },
                LayerView
            )
        );
        const [first, second] = view.children;

        expect(first.getLegendResolution("color")).not.toBe(
            second.getLegendResolution("color")
        );
        expect(first.getScaleResolution("color")).toBe(
            second.getScaleResolution("color")
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
