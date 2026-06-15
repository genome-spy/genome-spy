import { describe, expect, test } from "vitest";

import AxisView, { createGenomeAxis } from "./axisView.js";
import Rectangle from "./layout/rectangle.js";
import UnitView from "./unitView.js";
import { specToLayout } from "./testUtils.js";
import { createHeadlessViewHierarchy } from "../genomeSpy/headlessBootstrap.js";

/**
 * @param {import("./view.js").default} root
 * @param {import("../spec/axis.js").AxisOrient} orient
 */
function findAxisView(root, orient) {
    /** @type {AxisView | undefined} */
    let axisView;

    root.visit((view) => {
        if (view instanceof AxisView && view.axisProps.orient === orient) {
            axisView = view;
        }
    });

    if (!axisView) {
        throw new Error("Axis not found for orient " + orient);
    }

    return axisView;
}

/**
 * @param {AxisView} axisView
 * @param {string} name
 */
function findUnitView(axisView, name) {
    const unitView = axisView
        .getDescendants()
        .find((view) => view instanceof UnitView && view.name === name);

    if (!(unitView instanceof UnitView)) {
        throw new Error("Unit view not found: " + name);
    }

    return unitView;
}

/**
 * @param {import("../spec/axis.js").AxisOrient} orient
 * @param {import("../spec/axis.js").Axis} axis
 */
async function createAxis(orient, axis) {
    const channel = orient === "left" || orient === "right" ? "y" : "x";
    const disabledChannel = channel === "x" ? "y" : "x";
    const { view } = await createHeadlessViewHierarchy(
        {
            data: { values: [{ x: 1, y: 2 }] },
            mark: "point",
            encoding: {
                [disabledChannel]: {
                    field: disabledChannel,
                    type: "quantitative",
                    axis: null,
                },
                [channel]: {
                    field: channel,
                    type: "quantitative",
                    axis: {
                        orient,
                        ...axis,
                    },
                },
            },
        },
        {
            viewFactoryOptions: {
                wrapRoot: true,
            },
        }
    );

    return findAxisView(view, orient);
}

/**
 * @param {import("../spec/axis.js").Axis} axis
 */
async function createLeftAxis(axis) {
    return createAxis("left", axis);
}

/**
 * @param {{ viewName: string, coords?: string, children: any[] }} node
 * @param {string} viewName
 * @returns {{ viewName: string, coords?: string, children: any[] } | undefined}
 */
function findLayoutNode(node, viewName) {
    if (node.viewName === viewName) {
        return node;
    }

    for (const child of node.children) {
        const found = findLayoutNode(child, viewName);
        if (found) {
            return found;
        }
    }
}

/**
 * @param {string} coords
 * @param {"x" | "y" | "width" | "height"} key
 */
function readCoord(coords, key) {
    const match = coords.match(new RegExp(key + ": ([0-9.-]+)"));
    if (!match) {
        throw new Error("Coordinate not found: " + key);
    }

    return Number(match[1]);
}

describe("axis placement", () => {
    test("left inside axis mirrors tick and label direction into the plot", async () => {
        const axis = await createLeftAxis({ placement: "inside" });
        const labels = findUnitView(axis, "labels_main");
        const ticks = findUnitView(axis, "ticks");

        // A left inside axis is anchored at the plot's left edge and extends
        // rightward into the plot, visually like a right-oriented axis there.
        expect(axis.axisProps.labelAlign).toBe("left");
        expect(labels.spec.mark.x).toBe(0);
        expect(labels.spec.mark.xOffset).toBeGreaterThan(0);
        expect(ticks.spec.encoding.x.value).toBe(0);
        expect(ticks.spec.encoding.x2.value.expr).toContain("* -1");
    });

    test("top inside axis mirrors title side into the plot", async () => {
        const axis = await createAxis("top", {
            placement: "inside",
            title: "Signal",
        });
        const title = findUnitView(axis, "title");

        expect(title.spec.mark.y).toBe(0);
        expect(title.spec.mark.baseline).toBe("bottom");
    });

    test("axis title uses point positioning by default", async () => {
        const axis = await createAxis("bottom", {
            title: "Signal",
        });
        const title = findUnitView(axis, "title");

        expect(title.spec.mark.x).toBe(0.5);
        expect(title.spec.mark.x2).toBeUndefined();
        expect(title.spec.mark.flushX).toBeUndefined();
    });

    test("axis labels use pixel clipping by default", async () => {
        const bottomAxis = await createAxis("bottom", {});
        const bottomLabels = findUnitView(bottomAxis, "labels_main");
        const leftAxis = await createAxis("left", {});
        const leftLabels = findUnitView(leftAxis, "labels_main");

        expect(bottomLabels.spec.mark.clip).toBe(false);
        expect(bottomLabels.spec.mark.cullByVisibleRange).toBeUndefined();
        expect(leftLabels.spec.mark.clip).toBe(false);
        expect(leftLabels.spec.mark.cullByVisibleRange).toBeUndefined();
    });

    test("horizontal ranged axis title spans the axis and flushes horizontally", async () => {
        const axis = await createAxis("bottom", {
            title: "Signal",
            titleFit: "range",
        });
        const title = findUnitView(axis, "title");

        expect(title.spec.mark.x).toBe(0);
        expect(title.spec.mark.x2).toBe(1);
        expect(title.spec.mark.flushX).toBe(true);
        expect(title.spec.mark.y).toBe(0);
    });

    test("vertical ranged axis title spans the axis and flushes vertically", async () => {
        const axis = await createAxis("left", {
            title: "Signal",
            titleFit: "range",
        });
        const title = findUnitView(axis, "title");

        expect(title.spec.mark.y).toBe(0);
        expect(title.spec.mark.y2).toBe(1);
        expect(title.spec.mark.flushY).toBe(true);
        expect(title.spec.mark.x).toBe(0);
    });

    test("left inside genome axis mirrors chromosome ticks and labels", () => {
        const spec = createGenomeAxis(
            /** @type {import("../spec/axis.js").GenomeAxis} */ ({
                orient: "left",
                placement: "inside",
                chromTicks: true,
                chromLabels: true,
                chromTickSize: 5,
                chromTickWidth: 1,
                chromLabelPadding: 2,
                chromLabelFontSize: 10,
                labels: false,
                ticks: false,
                domain: false,
            }),
            "locus"
        );
        const chromLayer = spec.layer.find(
            (layer) => layer.name === "chromosome_ticks_and_labels"
        );
        if (!chromLayer || !("layer" in chromLayer)) {
            throw new Error("Chromosome layer not found!");
        }

        const chromTicks = chromLayer.layer.find(
            (layer) => layer.name === "chromosome_ticks"
        );
        const chromLabels = chromLayer.layer.find(
            (layer) => layer.name === "chromosome_labels"
        );
        if (!chromTicks || !chromLabels) {
            throw new Error("Chromosome axis views not found!");
        }

        const ticks = /** @type {import("../spec/view.js").UnitSpec} */ (
            chromTicks
        );
        const labels = /** @type {import("../spec/view.js").UnitSpec} */ (
            chromLabels
        );
        const ticksMark = /** @type {any} */ (ticks.mark);
        const labelsMark = /** @type {any} */ (labels.mark);

        expect(ticksMark.x).toBe(0);
        expect(ticksMark.x2.expr).toContain("* -1");
        expect(labelsMark.x).toBe(0);
        expect(labelsMark.angle).toBe(90);
    });

    test.each(["left", "right", "top", "bottom"])(
        "%s inside axis does not reserve external overhang",
        async (orient) => {
            const channel = orient === "left" || orient === "right" ? "y" : "x";
            const disabledChannel = channel === "x" ? "y" : "x";
            const layout = await specToLayout(
                {
                    data: { values: [{ x: 1, y: 2 }] },
                    mark: "point",
                    encoding: {
                        [disabledChannel]: {
                            field: disabledChannel,
                            type: "quantitative",
                            axis: null,
                        },
                        [channel]: {
                            field: channel,
                            type: "quantitative",
                            axis: { orient, placement: "inside" },
                        },
                    },
                },
                {},
                Rectangle.create(0, 0, 200, 100)
            );

            const plot = findLayoutNode(layout, "grid0");
            if (!plot?.coords) {
                throw new Error("Plot layout node not found!");
            }

            expect(readCoord(plot.coords, "x")).toBe(0);
            expect(readCoord(plot.coords, "y")).toBe(0);
            expect(readCoord(plot.coords, "width")).toBe(200);
            expect(readCoord(plot.coords, "height")).toBe(100);
        }
    );
});
