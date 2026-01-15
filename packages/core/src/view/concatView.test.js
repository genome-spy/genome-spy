import { describe, expect, test, vi } from "vitest";

import ConcatView from "./concatView.js";
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

describe("ConcatView dynamic children", () => {
    test("addChildSpec inserts at index and updates spec order", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const first = makeUnitSpec();
        const second = makeUnitSpec();

        await parent.addChildSpec(first);
        await parent.addChildSpec(second, 0);

        // The spec order should mirror the view order for deterministic updates.
        expect(parent.spec.vconcat).toEqual([second, first]);
        expect(parent.children.map((view) => view.spec)).toEqual([
            second,
            first,
        ]);

        // Dynamic insertion should request layout reflow for updated sizes.
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("removeChildAt disposes subtree and updates specs", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const first = await parent.addChildSpec(makeUnitSpec());
        await parent.addChildSpec(makeUnitSpec());

        await parent.removeChildAt(0);

        // Removing a child should dispose its flow handle to avoid leaks.
        expect(first.flowHandle).toBeUndefined();
        expect(parent.spec.vconcat).toHaveLength(1);
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("shared axes are removed when the last child is removed", async () => {
        const context = createTestViewContext();

        const parent = new ConcatView(
            {
                vconcat: [],
                resolve: {
                    axis: { x: "shared", y: "shared" },
                    scale: { x: "shared", y: "shared" },
                },
            },
            context,
            null,
            null,
            "concat"
        );

        await parent.addChildSpec(makeUnitSpec());

        const axesAfterAdd = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterAdd).toHaveLength(2);

        await parent.removeChildAt(0);

        // Shared axes should disappear when no members remain.
        const axesAfterRemove = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterRemove).toHaveLength(0);
    });

    test("removeChildAt throws for invalid index", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        // Explicitly reject out-of-range removal to keep state consistent.
        await expect(parent.removeChildAt(0)).rejects.toThrow(
            "Child index out of range!"
        );
    });

    test("addChildSpec returns a unit view for unit specs", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const view = await parent.addChildSpec(makeUnitSpec());

        // Consumers may need the created view to attach additional behavior.
        expect(view).toBeInstanceOf(UnitView);
    });
});
