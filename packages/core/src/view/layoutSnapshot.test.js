import { describe, expect, test } from "vitest";
import { specToLayout } from "./testUtils.js";
import Rectangle from "./layout/rectangle.js";

describe("layout snapshot helper", () => {
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
});
