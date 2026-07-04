import { describe, expect, test } from "vitest";

import { ARROW_UNIFORM_ENUMS, enumIndex, inferArrowOrient } from "./arrow.js";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";

describe("arrow mark uniform enums", () => {
    test("match shader constant order", () => {
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "horizontal")).toBe(
            0
        );
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "vertical")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "forward")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "reverse")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "triangle")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "open")).toBe(1);
        expect(
            enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, "auto")
        ).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, "x")).toBe(
            1
        );
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, "y")).toBe(
            2
        );
        expect(
            enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, "view-x")
        ).toBe(3);
        expect(
            enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, "view-y")
        ).toBe(4);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "inside")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "outside")).toBe(
            1
        );
    });

    test("fails fast on unknown values", () => {
        expect(() =>
            enumIndex(ARROW_UNIFORM_ENUMS.directions, "sideways")
        ).toThrow("Unsupported arrow mark value: sideways");
        expect(() =>
            enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "start")
        ).toThrow("Unsupported arrow mark value: start");
    });
});

describe("arrow mark size encoding", () => {
    test("uses a zero pixel size channel placeholder for band-relative mark size", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32, band: "A" }] },
                mark: { type: "arrow", size: { band: 0.5 } },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding.size).toEqual({
            value: 0,
        });
    });

    test("uses numeric mark size as a pixel value channel", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32, band: "A" }] },
                mark: { type: "arrow", size: 12 },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding.size).toEqual({
            value: 12,
        });
    });

    test("keeps encoded size when mark size is also defined", async () => {
        const size = /** @type {const} */ ({
            field: "thickness",
            type: "quantitative",
        });
        const view = await create(
            {
                data: {
                    values: [{ start: 8, end: 32, band: "A", thickness: 14 }],
                },
                mark: { type: "arrow", size: 6 },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                    size,
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding.size).toEqual(size);
    });

    test("keeps encoded size when band-relative mark size is also defined", async () => {
        const size = /** @type {const} */ ({
            field: "thickness",
            type: "quantitative",
        });
        const view = await create(
            {
                data: {
                    values: [{ start: 8, end: 32, band: "A", thickness: 14 }],
                },
                mark: { type: "arrow", size: { band: 0.5 } },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                    size,
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding.size).toEqual(size);
    });
});

describe("arrow mark orient inference", () => {
    test("uses the directional quantitative/index/locus axis", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "index" },
                y: { field: "sample", type: "nominal" },
            })
        ).toBe("horizontal");

        expect(
            inferArrowOrient({
                x: { field: "sample", type: "nominal" },
                y: { field: "position", type: "locus" },
            })
        ).toBe("vertical");
    });

    test("uses the ranged channel axis when only one secondary channel exists", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
            })
        ).toBe("horizontal");

        expect(
            inferArrowOrient({
                y: { field: "start", type: "quantitative" },
                y2: { field: "end" },
            })
        ).toBe("vertical");
    });

    test("falls back to horizontal for ambiguous two-axis encodings", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "quantitative" },
                y: { field: "end", type: "quantitative" },
            })
        ).toBe("horizontal");
    });
});
