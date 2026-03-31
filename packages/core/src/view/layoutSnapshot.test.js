import { describe, expect, test } from "vitest";
import { specToLayout } from "./testUtils.js";

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
});
