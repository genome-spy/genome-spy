import { describe, expect, test } from "vitest";

import AxisView from "./axisView.js";
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
 * @param {import("../spec/axis.js").Axis} axis
 */
async function createLeftAxis(axis) {
    const { view } = await createHeadlessViewHierarchy(
        {
            data: { values: [{ x: 1, y: 2 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative", axis: null },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: {
                        orient: "left",
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

    return findAxisView(view, "left");
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

    test("left inside axis does not reserve external overhang", async () => {
        const layout = await specToLayout(
            {
                data: { values: [{ x: 1, y: 2 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: { orient: "left", placement: "inside" },
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
    });
});
