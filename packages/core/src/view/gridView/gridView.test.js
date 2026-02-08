import { describe, expect, test } from "vitest";

import ConcatView from "../concatView.js";
import Rectangle from "../layout/rectangle.js";
import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import UnitView from "../unitView.js";
import { createAndInitialize, createTestViewContext } from "../testUtils.js";

// Minimal context for layout-driven render calls without WebGL.
class NoOpRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} options
     */
    constructor(options) {
        super(options);
    }

    pushView() {
        //
    }

    popView() {
        //
    }

    renderMark() {
        //
    }
}

/**
 * @returns {import("../../spec/view.js").UnitSpec}
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

describe("GridView incremental child management", () => {
    test("dynamic add/remove keeps shared axes in sync", async () => {
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

        // Shared axes must appear as real views after insertion.
        const axesAfterAdd = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterAdd).toHaveLength(2);

        await parent.removeChildAt(0);

        // Removing the last child should also remove shared axes.
        const axesAfterRemove = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterRemove).toHaveLength(0);
    });

    test("grid child axes can be recreated without duplication", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "concat"
        );
        const child = new UnitView(
            makeUnitSpec(),
            context,
            parent,
            parent,
            "u"
        );

        const gridChild = parent.insertChildViewAt(child, 0);
        await gridChild.createAxes();
        const axisCount = Object.keys(gridChild.axes).length;

        // Axis views must not contribute to shared scale domains.
        for (const axisView of Object.values(gridChild.axes)) {
            expect(axisView.isDomainInert()).toBe(true);
        }

        // Recreating axes should not leak or duplicate axis views.
        await gridChild.createAxes();
        expect(Object.keys(gridChild.axes)).toHaveLength(axisCount);
    });

    test("removing a child prunes dataflow collectors", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        await parent.addChildSpec(makeUnitSpec());

        // Ensure subtree init created collectors for the child.
        expect(context.dataFlow.collectors.length).toBeGreaterThan(0);

        await parent.removeChildAt(0);

        // Removing the child should dispose the collector subtree.
        expect(context.dataFlow.collectors.length).toBe(0);
    });
});

describe("GridView separators", () => {
    /**
     * @param {import("../concatView.js").default} view
     */
    const getSeparatorViews = (view) => {
        const separators = view
            .getDescendants()
            .filter(
                (descendant) =>
                    descendant.name.startsWith("separatorHorizontal") ||
                    descendant.name.startsWith("separatorVertical")
            );

        return {
            horizontal: separators.find((descendant) =>
                descendant.name.startsWith("separatorHorizontal")
            ),
            vertical: separators.find((descendant) =>
                descendant.name.startsWith("separatorVertical")
            ),
        };
    };

    /**
     * @param {import("../concatView.js").default} view
     */
    const renderForLayout = (view) => {
        const context = new NoOpRenderingContext({ picking: false });
        view.render(context, Rectangle.create(0, 0, 200, 200), {
            firstFacet: true,
        });
    };

    test("vconcat draws only horizontal separators", async () => {
        const view = await createAndInitialize(
            {
                vconcat: [makeUnitSpec(), makeUnitSpec()],
                separator: true,
            },
            ConcatView
        );

        renderForLayout(view);

        const { horizontal, vertical } = getSeparatorViews(view);
        const horizontalCount = horizontal.flowHandle.collector.getItemCount();
        const verticalCount = vertical
            ? vertical.flowHandle.collector.getItemCount()
            : 0;

        expect(horizontalCount).toBe(1);
        expect(verticalCount).toBe(0);
    });

    test("concat grid draws both horizontal and vertical separators", async () => {
        const view = await createAndInitialize(
            {
                columns: 2,
                concat: [
                    makeUnitSpec(),
                    makeUnitSpec(),
                    makeUnitSpec(),
                    makeUnitSpec(),
                ],
                separator: true,
            },
            ConcatView
        );

        renderForLayout(view);

        const { horizontal, vertical } = getSeparatorViews(view);
        const horizontalCount = horizontal.flowHandle.collector.getItemCount();
        const verticalCount = vertical
            ? vertical.flowHandle.collector.getItemCount()
            : 0;

        expect(horizontalCount).toBe(1);
        expect(verticalCount).toBe(1);
    });

    test("invisible children do not create extra separators", async () => {
        const view = await createAndInitialize(
            {
                vconcat: [
                    makeUnitSpec(),
                    {
                        ...makeUnitSpec(),
                        visible: false,
                    },
                    makeUnitSpec(),
                ],
                separator: true,
            },
            ConcatView
        );

        // Respect spec-defined visibility for this test.
        view.context.isViewConfiguredVisible = (candidate) =>
            candidate.isVisibleInSpec();

        renderForLayout(view);

        const { horizontal, vertical } = getSeparatorViews(view);
        const horizontalCount = horizontal.flowHandle.collector.getItemCount();
        const verticalCount = vertical
            ? vertical.flowHandle.collector.getItemCount()
            : 0;

        expect(horizontalCount).toBe(1);
        expect(verticalCount).toBe(0);
    });
});
