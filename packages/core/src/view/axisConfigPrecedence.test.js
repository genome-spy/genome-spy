import { describe, expect, test } from "vitest";
import AxisView from "./axisView.js";
import { createTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";

/**
 * @param {import("./view.js").default} root
 * @param {import("../spec/axis.js").AxisOrient} orient
 */
function findAxisView(root, orient) {
    /** @type {AxisView} */
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

describe("axis config precedence", () => {
    test("axis config buckets are applied", async () => {
        const context = createTestViewContext({ wrapRoot: true });

        const root = await context.createOrImportView(
            {
                data: { values: [{ x: 1, y: 2 }] },
                config: {
                    axis: { tickColor: "blue" },
                    axisX: { tickSize: 11 },
                    axisBottom: { labelColor: "orange" },
                    axisQuantitative: { domainColor: "pink" },
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const axis = findAxisView(root, "bottom");

        expect(axis.axisProps.tickColor).toBe("blue");
        expect(axis.axisProps.tickSize).toBe(11);
        expect(axis.axisProps.labelColor).toBe("orange");
        expect(axis.axisProps.domainColor).toBe("pink");
    });

    test("explicit axis properties override config", async () => {
        const context = createTestViewContext({ wrapRoot: true });

        const root = await context.createOrImportView(
            {
                data: { values: [{ x: 1, y: 2 }] },
                config: {
                    axis: { tickColor: "blue" },
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: { tickColor: "red" },
                    },
                    y: { field: "y", type: "quantitative" },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const axis = findAxisView(root, "bottom");

        expect(axis.axisProps.tickColor).toBe("red");
    });
});
