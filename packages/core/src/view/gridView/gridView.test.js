import { describe, expect, test, vi } from "vitest";

import ConcatView from "../concatView.js";
import Interaction from "../../utils/interaction.js";
import Rectangle from "../layout/rectangle.js";
import Point from "../layout/point.js";
import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import UnitView from "../unitView.js";
import AxisView from "../axisView.js";
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

/**
 * @param {import("../../spec/view.js").AnyConcatSpec} spec
 * @param {string[]} labels
 * @returns {Promise<string[]>}
 */
const recordRenderOrder = (spec, labels) => {
    /** @type {string[]} */
    const order = [];
    /**
     * @param {import("../concatView.js").default} view
     */
    const renderForLayout = (view) => {
        const context = new NoOpRenderingContext({ picking: false });
        view.render(context, Rectangle.create(0, 0, 200, 200), {
            firstFacet: true,
        });
    };

    return createAndInitialize(spec, ConcatView).then((view) => {
        for (const label of labels) {
            const target = view.getDescendants().find((descendant) => {
                const viewName = descendant.name ?? "";
                return (
                    viewName === label ||
                    (label.endsWith("*") &&
                        viewName.startsWith(label.slice(0, -1)))
                );
            });

            if (!target) {
                throw new Error(`Missing view "${label}" in test hierarchy.`);
            }

            const original = target.render.bind(target);
            target.render = (context, coords, options = {}) => {
                order.push(target.name);
                return original(context, coords, options);
            };
        }

        renderForLayout(view);
        return order;
    });
};

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

    test("child width params shadow the parent width in hconcat layouts", async () => {
        const view = await createAndInitialize(
            {
                hconcat: [
                    {
                        width: { grow: 1 },
                        ...makeUnitSpec(),
                    },
                    {
                        width: { grow: 2 },
                        ...makeUnitSpec(),
                    },
                ],
            },
            ConcatView
        );

        renderForLayout(view);

        const rootWidth = view.paramRuntime.findValue("width");
        const [firstChild, secondChild] = view.children;

        expect(firstChild.coords.width).not.toBe(rootWidth);
        expect(secondChild.coords.width).not.toBe(rootWidth);

        expect(firstChild.paramRuntime.createExpression("width")()).toBe(
            firstChild.coords.width
        );
        expect(secondChild.paramRuntime.createExpression("width")()).toBe(
            secondChild.coords.width
        );
    });

    test("text expressions see child size on the first render pass", async () => {
        const view = await createAndInitialize(
            {
                hconcat: [
                    {
                        width: { grow: 1 },
                        data: { values: [{}] },
                        mark: {
                            type: "text",
                            text: { expr: "'' + width + ' x ' + height" },
                        },
                    },
                    {
                        width: { grow: 2 },
                        data: { values: [{}] },
                        mark: {
                            type: "text",
                            text: { expr: "'' + width + ' x ' + height" },
                        },
                    },
                ],
            },
            ConcatView
        );

        const [firstChild, secondChild] = /** @type {UnitView[]} */ (
            view.children
        );
        const firstDatum = Array.from(firstChild.getCollector().getData())[0];
        const secondDatum = Array.from(secondChild.getCollector().getData())[0];

        Object.defineProperty(firstChild.mark, "updateGraphicsData", {
            value: /** @returns {void} */ () => undefined,
        });
        Object.defineProperty(secondChild.mark, "updateGraphicsData", {
            value: /** @returns {void} */ () => undefined,
        });

        view.paramRuntime.setValue("width", 999);
        view.paramRuntime.setValue("height", 888);
        firstChild.paramRuntime.setValue("width", 111);
        firstChild.paramRuntime.setValue("height", 222);
        secondChild.paramRuntime.setValue("width", 333);
        secondChild.paramRuntime.setValue("height", 444);

        expect(firstChild.mark.encoders.text(firstDatum)).toBe("111 x 222");
        expect(secondChild.mark.encoders.text(secondDatum)).toBe("333 x 444");
    });

    test("configured height params shadow descendant auto-size params", async () => {
        const view = await createAndInitialize(
            {
                params: [{ name: "height", value: 123 }],
                hconcat: [makeUnitSpec()],
            },
            ConcatView
        );

        renderForLayout(view);

        const [child] = view.children;
        expect(child.coords.height).not.toBe(123);
        expect(child.paramRuntime.createExpression("height")()).toBe(123);
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

describe("GridView decoration zindex", () => {
    test("renders default decorations around unclipped content", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        title: "Track title",
                        view: {
                            fill: "#f4f4f4",
                            stroke: "#999",
                        },
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: { grid: false },
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: { grid: false },
                            },
                        },
                    },
                ],
            },
            [
                "background0",
                "backgroundStroke0",
                "axis_bottom",
                "axis_left",
                "child",
                "title0",
            ]
        );

        expect(order).toEqual([
            "background0",
            "backgroundStroke0",
            "axis_bottom",
            "axis_left",
            "child",
            "title0",
        ]);
    });

    test("renders axes after marks when axis zindex is positive", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: { grid: false, zindex: 1 },
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: { grid: false, zindex: 1 },
                            },
                        },
                    },
                ],
            },
            ["child", "axis_bottom", "axis_left"]
        );

        expect(order).toEqual(["child", "axis_bottom", "axis_left"]);
    });

    test("defaults clipped axes and view stroke above marks", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        viewportWidth: 50,
                        width: 200,
                        view: {
                            stroke: "#999",
                        },
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: {
                            type: "point",
                            clip: true,
                        },
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: { grid: false },
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: { grid: false },
                            },
                        },
                    },
                ],
            },
            ["child", "backgroundStroke0", "axis_bottom", "axis_left"]
        );

        expect(order).toEqual([
            "child",
            "backgroundStroke0",
            "axis_bottom",
            "axis_left",
        ]);
    });

    test("explicit axis and view stroke zindex override the clipped default", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        viewportWidth: 50,
                        width: 200,
                        view: {
                            stroke: "#999",
                            strokeZindex: 0,
                        },
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: {
                            type: "point",
                            clip: true,
                        },
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: { grid: false, zindex: 0 },
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: { grid: false, zindex: 0 },
                            },
                        },
                    },
                ],
            },
            ["backgroundStroke0", "axis_bottom", "axis_left", "child"]
        );

        expect(order).toEqual([
            "backgroundStroke0",
            "axis_bottom",
            "axis_left",
            "child",
        ]);
    });

    test("renders title before marks and background fill/stroke after marks when configured", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        title: {
                            text: "Track title",
                            zindex: 0,
                        },
                        view: {
                            fill: "#f4f4f4",
                            zindex: 1,
                            stroke: "#999",
                            strokeZindex: 2,
                        },
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                ],
            },
            ["title0", "child", "background0", "backgroundStroke0"]
        );

        expect(order).toEqual([
            "title0",
            "child",
            "background0",
            "backgroundStroke0",
        ]);
    });

    test("renders separators after child views when separator zindex is positive", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "first",
                        data: { values: [{ x: 1, y: 2 }] },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                    {
                        name: "second",
                        data: { values: [{ x: 3, y: 4 }] },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                ],
                separator: { zindex: 1 },
            },
            ["first", "second", "separatorHorizontal0"]
        );

        expect(order).toEqual(["first", "second", "separatorHorizontal0"]);
    });

    test("renders brush selections before marks when brush zindex is zero", async () => {
        const order = await recordRenderOrder(
            {
                vconcat: [
                    {
                        name: "child",
                        params: [
                            {
                                name: "brush",
                                // Non-obvious: seed the selection so the brush view has active interval data.
                                value: { x: [1, 2] },
                                select: {
                                    type: "interval",
                                    encodings: ["x"],
                                    mark: {
                                        zindex: 0,
                                    },
                                },
                            },
                        ],
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                ],
            },
            ["selectionRect", "child"]
        );

        expect(order).toEqual(["selectionRect", "child"]);
    });
});

describe("GridView wheel zoom", () => {
    /**
     * @param {ConcatView} view
     */
    const renderForLayout = (/** @type {ConcatView} */ view) => {
        const context = new NoOpRenderingContext({ picking: false });
        view.render(context, Rectangle.create(0, 0, 200, 200), {
            firstFacet: true,
        });
    };

    const makeGapZoomSpec = () =>
        /** @type {import("../../spec/view.js").UnitSpec} */ ({
            ...makeUnitSpec(),
            data: {
                values: [
                    { x: 1, y: 2 },
                    { x: 3, y: 5 },
                ],
            },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { zoom: true },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { zoom: true },
                },
            },
        });

    /**
     * @param {ConcatView} concatView
     * @param {"vconcat" | "hconcat"} direction
     */
    const findSharedAxisPoint = (concatView, direction) => {
        const sharedAxis = concatView
            .getDescendants()
            .find(
                (view) =>
                    view instanceof AxisView &&
                    view.dataParent === concatView &&
                    ((direction === "vconcat" &&
                        (view.axisProps.orient === "top" ||
                            view.axisProps.orient === "bottom")) ||
                        (direction === "hconcat" &&
                            (view.axisProps.orient === "left" ||
                                view.axisProps.orient === "right")))
            );

        return sharedAxis instanceof AxisView
            ? new Point(
                  sharedAxis.coords.x + sharedAxis.coords.width / 2,
                  sharedAxis.coords.y + sharedAxis.coords.height / 2
              )
            : undefined;
    };

    /**
     * @param {"vconcat" | "hconcat"} direction
     * @param {object} [extraSpec]
     */
    const createGapHarness = async (direction, extraSpec = {}) => {
        const spec =
            direction === "vconcat"
                ? /** @type {import("../../spec/view.js").AnyConcatSpec} */ ({
                      vconcat: [makeGapZoomSpec(), makeGapZoomSpec()],
                      ...extraSpec,
                  })
                : /** @type {import("../../spec/view.js").AnyConcatSpec} */ ({
                      hconcat: [makeGapZoomSpec(), makeGapZoomSpec()],
                      ...extraSpec,
                  });

        const view = await createAndInitialize(spec, ConcatView);

        const concatView = /** @type {ConcatView} */ (view);
        renderForLayout(concatView);

        const firstChild = /** @type {UnitView} */ (concatView.children[0]);
        const secondChild = /** @type {UnitView} */ (concatView.children[1]);
        const childPoint = new Point(
            firstChild.coords.x + firstChild.coords.width / 2,
            firstChild.coords.y + firstChild.coords.height / 2
        );
        const point =
            direction === "vconcat"
                ? new Point(
                      firstChild.coords.x + firstChild.coords.width / 2,
                      (firstChild.coords.y2 + secondChild.coords.y) / 2
                  )
                : new Point(
                      (firstChild.coords.x2 + secondChild.coords.x) / 2,
                      firstChild.coords.y + firstChild.coords.height / 2
                  );

        return {
            concatView,
            firstChild,
            secondChild,
            point,
            childPoint,
            axisPoint: findSharedAxisPoint(concatView, direction),
        };
    };

    /**
     * @param {ConcatView} concatView
     * @param {Point} point
     * @param {Partial<import("../../utils/interactionEvent.js").WheelLikeEvent>} [wheelInit]
     */
    const dispatchWheel = (concatView, point, wheelInit = {}) => {
        const preventDefault = vi.fn();
        concatView.propagateInteraction(
            new Interaction(
                point,
                /** @type {any} */ ({
                    type: "wheel",
                    deltaX: 0,
                    deltaY: -120,
                    deltaMode: 0,
                    preventDefault,
                    ...wheelInit,
                })
            )
        );
        return preventDefault;
    };

    test("applies zoom to both x and y resolutions", async () => {
        const zoomableUnitSpec = makeGapZoomSpec();

        const view = await createAndInitialize(
            {
                vconcat: [zoomableUnitSpec],
            },
            ConcatView
        );

        const concatView = /** @type {ConcatView} */ (view);
        view.context.getCurrentHover = () => undefined;

        // Non-obvious: run one layout/render pass so child coords exist for hit testing.
        renderForLayout(concatView);

        const child = /** @type {UnitView} */ (concatView.children[0]);
        const childCoords = child.coords;
        const point = new Point(
            childCoords.x + childCoords.width / 2,
            childCoords.y + childCoords.height / 2
        );

        const xResolution = child.getScaleResolution("x");
        const yResolution = child.getScaleResolution("y");
        if (!xResolution || !yResolution) {
            throw new Error("Expected zoomable x and y resolutions!");
        }

        const xZoomSpy = vi.spyOn(xResolution, "zoom");
        const yZoomSpy = vi.spyOn(yResolution, "zoom");
        const preventDefault = /** @type {() => void} */ (() => undefined);

        concatView.propagateInteraction(
            new Interaction(
                point,
                /** @type {any} */ ({
                    type: "wheel",
                    deltaX: 0,
                    deltaY: -120,
                    deltaMode: 0,
                    preventDefault,
                })
            )
        );

        expect(xZoomSpy).toHaveBeenCalled();
        expect(yZoomSpy).toHaveBeenCalled();
    });

    test("vconcat gap wheel zoom uses the shared x resolution and matches child zoom", async () => {
        const gapHarness = await createGapHarness("vconcat");
        const childHarness = await createGapHarness("vconcat");

        const gapResolution = gapHarness.concatView.getScaleResolution("x");
        const childResolution = childHarness.concatView.getScaleResolution("x");
        const gapYResolution = gapHarness.firstChild.getScaleResolution("y");
        if (!gapResolution || !childResolution) {
            throw new Error("Expected shared x resolutions!");
        }
        if (!gapYResolution) {
            throw new Error("Expected child y resolution!");
        }

        const gapXZoomSpy = vi.spyOn(gapResolution, "zoom");
        const gapYZoomSpy = vi.spyOn(gapYResolution, "zoom");
        dispatchWheel(gapHarness.concatView, gapHarness.point);
        dispatchWheel(childHarness.concatView, childHarness.childPoint);

        expect(gapXZoomSpy).toHaveBeenCalled();
        expect(gapYZoomSpy).not.toHaveBeenCalled();
        expect(gapResolution.getDomain()).toEqual(childResolution.getDomain());
    });

    test("vconcat shared axis wheel zoom matches child wheel zoom on shared x", async () => {
        const axisHarness = await createGapHarness("vconcat", {
            resolve: {
                axis: {
                    x: "shared",
                },
            },
        });
        const childHarness = await createGapHarness("vconcat", {
            resolve: {
                axis: {
                    x: "shared",
                },
            },
        });

        if (!axisHarness.axisPoint) {
            throw new Error("Expected shared x axis!");
        }

        const axisResolution = axisHarness.concatView.getScaleResolution("x");
        const childResolution = childHarness.concatView.getScaleResolution("x");
        if (!axisResolution || !childResolution) {
            throw new Error("Expected shared x resolutions!");
        }

        dispatchWheel(axisHarness.concatView, axisHarness.axisPoint);
        dispatchWheel(childHarness.concatView, childHarness.childPoint);

        expect(axisResolution.getDomain()).toEqual(childResolution.getDomain());
    });

    test("hconcat gap wheel zoom uses the shared y resolution and matches child zoom", async () => {
        const gapHarness = await createGapHarness("hconcat");
        const childHarness = await createGapHarness("hconcat");

        const gapResolution = gapHarness.concatView.getScaleResolution("y");
        const childResolution = childHarness.concatView.getScaleResolution("y");
        const gapXResolution = gapHarness.firstChild.getScaleResolution("x");
        if (!gapResolution || !childResolution) {
            throw new Error("Expected shared y resolutions!");
        }
        if (!gapXResolution) {
            throw new Error("Expected child x resolution!");
        }

        const gapYZoomSpy = vi.spyOn(gapResolution, "zoom");
        const gapXZoomSpy = vi.spyOn(gapXResolution, "zoom");
        dispatchWheel(gapHarness.concatView, gapHarness.point);
        dispatchWheel(childHarness.concatView, childHarness.childPoint);

        expect(gapYZoomSpy).toHaveBeenCalled();
        expect(gapXZoomSpy).not.toHaveBeenCalled();
        expect(gapResolution.getDomain()).toEqual(childResolution.getDomain());
    });

    test("vconcat gap wheelclaimprobe claims the shared x resolution", async () => {
        const { concatView, point } = await createGapHarness("vconcat");

        const interaction = new Interaction(
            point,
            /** @type {any} */ ({ type: "wheelclaimprobe" })
        );

        concatView.propagateInteraction(interaction);

        expect(interaction.wheelClaimed).toBe(true);
    });

    test("vconcat side overhang does not trigger gap zoom", async () => {
        const { concatView, firstChild, secondChild } =
            await createGapHarness("vconcat");

        Object.defineProperty(firstChild, "coords", {
            value: firstChild.coords.modify({ x: 20, width: 80 }),
        });
        Object.defineProperty(secondChild, "coords", {
            value: secondChild.coords.modify({ x: 40, width: 60 }),
        });

        const overhangPoint = new Point(
            firstChild.coords.x + 5,
            (firstChild.coords.y2 + secondChild.coords.y) / 2
        );

        const xResolution = concatView.getScaleResolution("x");
        if (!xResolution) {
            throw new Error("Expected shared x resolution!");
        }

        const xZoomSpy = vi.spyOn(xResolution, "zoom");
        const preventDefault = dispatchWheel(concatView, overhangPoint);

        expect(xZoomSpy).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });

    test("vconcat gap drag pan uses the shared x resolution and matches child pan", async () => {
        const originalDocument = globalThis.document;
        const originalMouseEvent = globalThis.MouseEvent;

        try {
            /**
             * @returns {Record<string, EventListener | undefined>}
             */
            const installDocumentStub = () => {
                /** @type {Record<string, EventListener | undefined>} */
                const listeners = {};
                globalThis.document = /** @type {Document} */ (
                    /** @type {any} */ ({
                        addEventListener(
                            /** @type {string} */ type,
                            /** @type {EventListener} */ listener
                        ) {
                            listeners[type] = listener;
                        },
                        removeEventListener(
                            /** @type {string} */ type,
                            /** @type {EventListener} */ listener
                        ) {
                            if (listeners[type] === listener) {
                                listeners[type] = undefined;
                            }
                        },
                    })
                );
                return listeners;
            };

            class FakeMouseEvent extends Event {
                constructor(
                    /** @type {string} */ type,
                    /** @type {Record<string, any>} */ init = {}
                ) {
                    super(type);
                    Object.assign(this, init);
                }
            }

            globalThis.MouseEvent = /** @type {typeof MouseEvent} */ (
                /** @type {any} */ (FakeMouseEvent)
            );

            const dispatchPan = (
                /** @type {ConcatView} */ concatView,
                /** @type {Point} */ startPoint,
                /** @type {number} */ deltaX
            ) => {
                const listeners = installDocumentStub();
                concatView.propagateInteraction(
                    new Interaction(
                        startPoint,
                        /** @type {any} */ (
                            new FakeMouseEvent("mousedown", {
                                button: 0,
                                clientX: startPoint.x,
                                clientY: startPoint.y,
                                preventDefault: /** @returns {void} */ () =>
                                    undefined,
                            })
                        )
                    )
                );

                listeners.mousemove?.(
                    /** @type {MouseEvent} */ (
                        /** @type {any} */ ({
                            type: "mousemove",
                            clientX: startPoint.x + deltaX,
                            clientY: startPoint.y,
                        })
                    )
                );
            };

            const gapHarness = await createGapHarness("vconcat");
            const childHarness = await createGapHarness("vconcat");

            const gapResolution = gapHarness.concatView.getScaleResolution("x");
            const childResolution =
                childHarness.concatView.getScaleResolution("x");
            const gapYResolution =
                gapHarness.firstChild.getScaleResolution("y");
            if (!gapResolution || !childResolution) {
                throw new Error("Expected shared x resolutions!");
            }
            if (!gapYResolution) {
                throw new Error("Expected child y resolution!");
            }

            const gapXZoomSpy = vi.spyOn(gapResolution, "zoom");
            const gapYZoomSpy = vi.spyOn(gapYResolution, "zoom");
            dispatchPan(gapHarness.concatView, gapHarness.point, 15);
            dispatchPan(childHarness.concatView, childHarness.childPoint, 15);

            expect(gapXZoomSpy).toHaveBeenCalled();
            expect(gapYZoomSpy).not.toHaveBeenCalled();
            expect(gapResolution.getDomain()).toEqual(
                childResolution.getDomain()
            );
        } finally {
            globalThis.document = originalDocument;
            globalThis.MouseEvent = originalMouseEvent;
        }
    });

    test("gap wheel does nothing when concat axis resolution is independent", async () => {
        const { concatView, firstChild, secondChild, point } =
            await createGapHarness("vconcat", {
                resolve: {
                    scale: {
                        x: "independent",
                    },
                },
            });

        const firstChildXResolution = firstChild.getScaleResolution("x");
        const secondChildXResolution = secondChild.getScaleResolution("x");
        if (!firstChildXResolution || !secondChildXResolution) {
            throw new Error("Expected independent child x resolutions!");
        }

        const firstXZoomSpy = vi.spyOn(firstChildXResolution, "zoom");
        const secondXZoomSpy = vi.spyOn(secondChildXResolution, "zoom");
        const preventDefault = dispatchWheel(concatView, point);

        expect(firstXZoomSpy).not.toHaveBeenCalled();
        expect(secondXZoomSpy).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });
});
