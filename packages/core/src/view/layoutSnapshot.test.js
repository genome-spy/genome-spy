import { describe, expect, test } from "vitest";
import { specToLayout } from "./testUtils.js";
import Rectangle from "./layout/rectangle.js";
import { loadSharedExampleSpec } from "../spec/exampleFiles.js";

/**
 * @param {string} coords
 * @param {"x" | "y" | "width" | "height"} prop
 */
function getRectProp(coords, prop) {
    return Number(coords.match(new RegExp(`${prop}: (-?\\d+)`))[1]);
}

describe("layout snapshot helper", () => {
    test("renders view title in reserved bounds without manual padding", async () => {
        const layout = await specToLayout(
            {
                vconcat: [
                    {
                        name: "titled",
                        title: "Group title",
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
                ],
            },
            {},
            Rectangle.create(0, 0, 200, 120)
        );

        const title = layout.children.find(
            (child) => child.viewName == "title0"
        );
        const titled = layout.children.find(
            (child) => child.viewName == "titled"
        );

        expect(title).toMatchObject({
            coords: "Rectangle: x: 0, y: 22, width: 200, height: 98",
        });
        expect(titled).toMatchObject({
            coords: "Rectangle: x: 0, y: 22, width: 200, height: 98",
        });
    });

    test("title-styles docs example relies on title bounds instead of padding", async () => {
        const spec = loadSharedExampleSpec(
            "examples/docs/grammar/title/title-styles.json"
        );
        const layout = await specToLayout(spec);

        expect(spec.vconcat[0].padding).toBeUndefined();
        expect(spec.vconcat[1].padding).toBeUndefined();
        expect(spec.vconcat[3].padding).toBeUndefined();

        const groupTitleView = layout.children.find(
            (child) => child.viewName == "grid0"
        );
        const trackTitleView = layout.children.find(
            (child) => child.viewName == "grid1"
        );

        expect(groupTitleView.coords).toMatch(/y: [1-9][0-9]*/);
        expect(trackTitleView.coords).toMatch(/x: [1-9][0-9]*/);
    });

    test("core title bounds acid test reserves title sides", async () => {
        const spec = loadSharedExampleSpec(
            "examples/core/layout/title_bounds.json"
        );
        const layout = await specToLayout(spec);

        expect(spec.vconcat[0].padding).toBeUndefined();
        expect(spec.vconcat[2].padding).toBeUndefined();
        expect(spec.vconcat[3].padding).toBeUndefined();

        const topTitleView = layout.children.find(
            (child) => child.viewName == "topTitle"
        );
        const nestedRow = layout.children.find(
            (child) => child.viewName == "sideTitles"
        );
        const overlayTitleView = layout.children.find(
            (child) => child.viewName == "overlayTitle"
        );
        const bottomTitleView = layout.children.find(
            (child) => child.viewName == "bottomTitle"
        );

        expect(topTitleView.coords).toMatch(/y: [1-9][0-9]*/);
        expect(nestedRow.children[0].coords).toMatch(/x: [1-9][0-9]*/);
        expect(nestedRow.children[1].coords).toMatch(
            /Rectangle: x: [1-9][0-9]+, y: [0-9]+, width: 120, height: 80/
        );
        expect(overlayTitleView.coords).toMatch(/height: 80/);
        expect(bottomTitleView.coords).toMatch(/height: [1-9][0-9]*/);
    });

    test("reserved group-frame title is placed outside same-side axis", async () => {
        const layout = await specToLayout(
            {
                title: {
                    text: "Top title",
                    orient: "top",
                    frame: "group",
                },
                data: { values: [{ x: 1, y: 2 }] },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: { orient: "top" },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: null,
                    },
                },
            },
            {},
            Rectangle.create(0, 0, 200, 120)
        );

        const title = layout.children.find(
            (child) => child.viewName == "title0"
        );
        const axis = layout.children.find(
            (child) => child.viewName == "axis_top"
        );
        const grid = layout.children.find((child) => child.viewName == "grid0");

        expect(getRectProp(title.coords, "x")).toBe(
            getRectProp(grid.coords, "x")
        );
        expect(getRectProp(title.coords, "y")).toBeLessThanOrEqual(
            getRectProp(axis.coords, "y")
        );
        expect(getRectProp(title.coords, "y")).toBeLessThan(
            getRectProp(grid.coords, "y")
        );
    });

    test("captures a shared-axis concat layout", async () => {
        expect(
            await specToLayout({
                resolve: {
                    axis: { x: "shared" },
                },
                vconcat: [
                    {
                        data: {
                            values: [{ x: 1, y: 2 }],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                    {
                        data: {
                            values: [{ x: 3, y: 4 }],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "y",
                                type: "quantitative",
                                axis: null,
                            },
                        },
                    },
                ],
            })
        ).toMatchInlineSnapshot(`
          ViewCoords {
            "children": [
              ViewCoords {
                "children": [
                  ViewCoords {
                    "children": [],
                    "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                    "viewName": "domain",
                  },
                  ViewCoords {
                    "children": [
                      ViewCoords {
                        "children": [],
                        "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                        "viewName": "ticks",
                      },
                      ViewCoords {
                        "children": [],
                        "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                        "viewName": "labels_main",
                      },
                    ],
                    "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                    "viewName": "ticks_and_labels",
                  },
                  ViewCoords {
                    "children": [],
                    "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                    "viewName": "title",
                  },
                ],
                "coords": "Rectangle: x: 0, y: 968, width: 1500, height: 32",
                "viewName": "axis_bottom",
              },
              ViewCoords {
                "children": [],
                "coords": "Rectangle: x: 0, y: 0, width: 1500, height: 479",
                "viewName": "grid0",
              },
              ViewCoords {
                "children": [],
                "coords": "Rectangle: x: 0, y: 489, width: 1500, height: 479",
                "viewName": "grid1",
              },
            ],
            "coords": "Rectangle: x: 0, y: 0, width: 1500, height: 968",
            "viewName": "viewRoot",
          }
        `);
    });

    test("applies SizeDef constraints in concat child layout", async () => {
        const layout = await specToLayout(
            {
                spacing: 0,
                vconcat: [
                    {
                        height: { grow: 1, minPx: 80 },
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
                        height: { grow: 1 },
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
            },
            {},
            Rectangle.create(0, 0, 200, 120)
        );

        // Public vconcat specs should pass SizeDef constraints to flex layout.
        expect(
            layout.children.find((child) => child.viewName == "grid0")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 0, width: 200, height: 80",
        });
        expect(
            layout.children.find((child) => child.viewName == "grid1")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 80, width: 200, height: 40",
        });
    });

    test("applies SizeDef constraints in hconcat child layout", async () => {
        const layout = await specToLayout(
            {
                spacing: 0,
                hconcat: [
                    {
                        width: { grow: 1, maxPx: 80 },
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
                        width: { grow: 1 },
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
            },
            {},
            Rectangle.create(0, 0, 200, 120)
        );

        // Public hconcat specs should pass SizeDef constraints to flex layout.
        expect(
            layout.children.find((child) => child.viewName == "grid0")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 0, width: 80, height: 120",
        });
        expect(
            layout.children.find((child) => child.viewName == "grid1")
        ).toMatchObject({
            coords: "Rectangle: x: 80, y: 0, width: 120, height: 120",
        });
    });

    test("includes px children in nested concat minimum size", async () => {
        const layout = await specToLayout(
            {
                spacing: 0,
                config: { legend: { disable: false } },
                vconcat: [
                    {
                        spacing: 0,
                        vconcat: [
                            {
                                height: 40,
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
                                height: { minPx: 80 },
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
                    },
                    {
                        data: { values: [{ x: 5, y: 6 }] },
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
            {},
            Rectangle.create(0, 0, 200, 100)
        );

        // The nested vconcat should report fixed px children as part of its
        // minimum, so the parent lets it overflow instead of compressing it.
        expect(
            layout.children.find((child) => child.viewName == "grid0")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 0, width: 200, height: 120",
        });
        expect(
            layout.children.find((child) => child.viewName == "grid1")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 120, width: 200, height: 0",
        });
    });

    test("includes px children in nested concat maximum size", async () => {
        const layout = await specToLayout(
            {
                spacing: 0,
                hconcat: [
                    {
                        spacing: 0,
                        hconcat: [
                            {
                                width: 40,
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
                                width: { maxPx: 80 },
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
                    },
                    {
                        data: { values: [{ x: 5, y: 6 }] },
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
            {},
            Rectangle.create(0, 0, 200, 120)
        );

        // The nested hconcat's max includes the fixed-width child and the
        // constrained child, so the parent caps it at 40 + 80.
        expect(
            layout.children.find((child) => child.viewName == "grid0")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 0, width: 120, height: 120",
        });
        expect(
            layout.children.find((child) => child.viewName == "grid1")
        ).toMatchObject({
            coords: "Rectangle: x: 120, y: 0, width: 80, height: 120",
        });
    });

    test("includes local legends in nested concat minimum size", async () => {
        const layout = await specToLayout(
            {
                spacing: 0,
                vconcat: [
                    {
                        spacing: 0,
                        vconcat: [
                            {
                                height: { grow: 1 },
                                data: {
                                    values: [
                                        { x: 1, y: 1, measurement: 0 },
                                        { x: 2, y: 2, measurement: 1 },
                                    ],
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
                                    color: {
                                        field: "measurement",
                                        type: "quantitative",
                                    },
                                },
                            },
                        ],
                    },
                    {
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
            },
            {},
            Rectangle.create(0, 0, 200, 20)
        );

        // The nested vconcat's local vertical gradient legend has a minimum
        // height that includes the title and body before laying out siblings.
        expect(
            layout.children.find((child) => child.viewName == "grid0")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 0, width: 200, height: 56",
        });
        expect(
            layout.children.find((child) => child.viewName == "grid1")
        ).toMatchObject({
            coords: "Rectangle: x: 0, y: 56, width: 182, height: 0",
        });
    });
});
