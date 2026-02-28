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

    test("axis style applies after axis buckets and before explicit props", async () => {
        const context = createTestViewContext({ wrapRoot: true });

        const root = await context.createOrImportView(
            {
                data: { values: [{ x: 1, y: 2 }] },
                config: {
                    axis: { tickColor: "blue" },
                    axisX: { tickSize: 11 },
                    axisBottom: { labelColor: "orange" },
                    style: {
                        emphasis: {
                            tickColor: "seagreen",
                            labelColor: "purple",
                        },
                        override: {
                            tickColor: "firebrick",
                            domainColor: "pink",
                        },
                    },
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: {
                            style: ["emphasis", "override"],
                        },
                    },
                    y: { field: "y", type: "quantitative" },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const axis = findAxisView(root, "bottom");

        expect(axis.axisProps.tickSize).toBe(11);
        expect(axis.axisProps.tickColor).toBe("firebrick");
        expect(axis.axisProps.labelColor).toBe("purple");
        expect(axis.axisProps.domainColor).toBe("pink");

        const explicitRoot = await context.createOrImportView(
            {
                data: { values: [{ x: 1, y: 2 }] },
                config: {
                    style: {
                        emphasis: {
                            tickColor: "seagreen",
                        },
                    },
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: {
                            style: "emphasis",
                            tickColor: "black",
                        },
                    },
                    y: { field: "y", type: "quantitative" },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const explicitAxis = findAxisView(explicitRoot, "bottom");
        expect(explicitAxis.axisProps.tickColor).toBe("black");
    });

    test("axis config buckets can enable grid lines without explicit axis.grid", async () => {
        const context = createTestViewContext({ wrapRoot: true });

        const root = await context.createOrImportView(
            {
                data: {
                    values: [
                        { category: "A", value: 1 },
                        { category: "B", value: 2 },
                    ],
                },
                config: {
                    axis: { grid: false },
                    axisY: { grid: true },
                },
                mark: "rect",
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                    },
                    y: {
                        field: "value",
                        type: "quantitative",
                    },
                    y2: { value: 0 },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const axis = findAxisView(root, "left");
        expect(axis.axisProps.grid).toBe(true);
    });

    test("view theme applies before local config overrides", async () => {
        const context = createTestViewContext({ wrapRoot: true });

        const root = await context.createOrImportView(
            {
                data: {
                    values: [
                        { category: "A", value: 1 },
                        { category: "B", value: 2 },
                    ],
                },
                theme: "vegalite",
                config: {
                    axis: {
                        domain: true,
                    },
                },
                mark: "rect",
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                    },
                    y: {
                        field: "value",
                        type: "quantitative",
                    },
                    y2: { value: 0 },
                },
            },
            null,
            null,
            VIEW_ROOT_NAME
        );

        const yAxis = findAxisView(root, "left");
        const xAxis = findAxisView(root, "bottom");

        expect(yAxis.axisProps.grid).toBe(true);
        expect(xAxis.axisProps.grid).toBe(false);
        expect(yAxis.axisProps.domain).toBe(true);
        expect(yAxis.axisProps.gridColor).toBe("#ddd");
    });
});
