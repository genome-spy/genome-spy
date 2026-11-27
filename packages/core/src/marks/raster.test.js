import { expect, test } from "vitest";
import { createAndInitialize } from "../view/testUtils.js";
import UnitView from "../view/unitView.js";
import View from "../view/view.js";
import RasterMark from "./raster.js";

test("raster opacity fields require a color value", async () => {
    await expect(
        createAndInitialize(
            {
                mark: "raster",
                encoding: {
                    x: { dimension: "column", type: "quantitative" },
                    y: { dimension: "row", type: "quantitative" },
                    color: { field: "pixel", scale: null },
                    opacity: { field: "signal", type: "quantitative" },
                },
            },
            UnitView
        )
    ).rejects.toThrow("opacity field requires a color value");
});

test("rectangular rasters reject clamped grid scales", async () => {
    const dimension = { origin: 0, step: 1, count: 4 };
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    {
                        dimensions: {
                            column: dimension,
                            row: { ...dimension, count: 1 },
                        },
                        fields: { value: [10, 20, 30, 40] },
                    },
                ],
            },
            mark: "raster",
            encoding: {
                x: {
                    dimension: "column",
                    type: "quantitative",
                    scale: { domain: [1, 3], clamp: true },
                },
                y: { dimension: "row", type: "quantitative" },
                color: { field: "value", type: "quantitative" },
            },
        },
        UnitView
    );
    try {
        expect(() =>
            /** @type {RasterMark} */ (view.mark).validateRenderingScales()
        ).toThrow("unclamped");
    } finally {
        view.disposeSubtree();
    }
});

test("triangle rasters reject positional cell intervals", async () => {
    const dimension = { origin: 0, step: 1, count: 2 };
    const view = await createAndInitialize(
        {
            data: {
                values: [
                    {
                        dimensions: { column: dimension, row: dimension },
                        fields: { value: [1, 2, 3, 4] },
                    },
                ],
            },
            projection: "triangle",
            mark: "raster",
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            encoding: {
                x: { dimension: "column", type: "locus" },
                y: { dimension: "row", type: "locus" },
                color: { field: "value", type: "quantitative" },
                opacity: { condition: { param: "brush", value: 1 }, value: 0 },
            },
        },
        UnitView
    );
    try {
        expect(() =>
            /** @type {RasterMark} */ (view.mark).validateRenderingScales()
        ).toThrow(
            "Triangle rasters only support interval conditions on color."
        );
    } finally {
        view.disposeSubtree();
    }
});

test.each(
    /** @type {const} */ ([
        {
            axis: "x",
            condition: { param: "brush", value: 1 },
            message: 'Raster band axis "x" requires a categorical selection.',
        },
        {
            axis: "y",
            condition: { param: "brush", project: { y: "y2" }, value: 1 },
            message: 'Remove the explicit projection on "y2".',
        },
    ])
)(
    "rejects an interval brush on a strip's $axis input",
    async ({ axis, condition, message }) => {
        const root = await createAndInitialize(
            {
                params: [{ name: "brush" }],
                resolve: { scale: { [axis]: "independent" } },
                vconcat: [
                    {
                        params: [
                            {
                                name: "brush",
                                push: "outer",
                                select: { type: "interval", encodings: [axis] },
                            },
                        ],
                        data: { values: [{ sample: 10 }, { sample: 20 }] },
                        mark: "point",
                        encoding: {
                            [axis]: {
                                field: "sample",
                                type: axis === "x" ? "quantitative" : "index",
                            },
                        },
                    },
                    {
                        data: {
                            values: [
                                {
                                    sample: 10,
                                    dimensions: {
                                        row: { origin: 0, step: 1, count: 1 },
                                    },
                                    fields: { pixel: [0xffffffff] },
                                },
                            ],
                        },
                        mark: "raster",
                        encoding: {
                            x: {
                                field: "sample",
                                type: "nominal",
                                scale: { type: "band", domain: [10, 20] },
                            },
                            y: { dimension: "row", type: "index" },
                            color: { field: "pixel", scale: null },
                            opacity: { condition, value: 0 },
                        },
                    },
                ],
            },
            View
        );
        try {
            const raster = root
                .getDescendants()
                .filter((view) => view instanceof UnitView)
                .map((view) => view.mark)
                .find((mark) => mark instanceof RasterMark);

            expect(raster).toBeDefined();
            expect(() => raster.validateRenderingScales()).toThrow(message);
        } finally {
            root.disposeSubtree();
        }
    }
);
