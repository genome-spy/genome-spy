import { describe, expect, test, vi } from "vitest";

import UnitView from "./unitView.js";
import { createTestViewContext } from "./testUtils.js";

/**
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeUnitSpec = () => ({
    data: {
        values: [
            {
                x: 1,
                y: 2,
            },
        ],
    },
    mark: "point",
    encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
    },
});

describe("LayerView dynamic children", () => {
    test("addChildSpec inserts at index and updates spec order", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = /** @type {import("./layerView.js").default} */ (
            await context.createOrImportView({ layer: [] }, null, null, "layer")
        );

        const first = makeUnitSpec();
        const second = makeUnitSpec();

        await parent.addChildSpec(first);
        await parent.addChildSpec(second, 0);

        expect(parent.spec.layer).toEqual([second, first]);
        expect([...parent].map((view) => view.spec)).toEqual([second, first]);
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("removeChildAt disposes subtree and updates specs", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = /** @type {import("./layerView.js").default} */ (
            await context.createOrImportView({ layer: [] }, null, null, "layer")
        );

        const first = await parent.addChildSpec(makeUnitSpec());
        await parent.addChildSpec(makeUnitSpec());

        expect(context.dataFlow.collectors.length).toBeGreaterThan(0);

        await parent.removeChildAt(0);

        expect(first.flowHandle).toBeUndefined();
        expect(parent.spec.layer).toHaveLength(1);
        expect(context.dataFlow.collectors.length).toBe(1);
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("removeChildAt throws for invalid index", async () => {
        const context = createTestViewContext();
        const parent = /** @type {import("./layerView.js").default} */ (
            await context.createOrImportView({ layer: [] }, null, null, "layer")
        );

        await expect(parent.removeChildAt(0)).rejects.toThrow(
            "Child index out of range!"
        );
    });

    test("addChildSpec returns a unit view for unit specs", async () => {
        const context = createTestViewContext();
        const parent = /** @type {import("./layerView.js").default} */ (
            await context.createOrImportView({ layer: [] }, null, null, "layer")
        );

        const view = await parent.addChildSpec(makeUnitSpec());

        expect(view).toBeInstanceOf(UnitView);
    });
});
