import { describe, expect, test } from "vitest";

import {
    ARROW_UNIFORM_ENUMS,
    enumIndex,
    getRelativeSizeUniformProps,
} from "./arrow.js";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";

describe("arrow mark uniform enums", () => {
    test("match shader constant order", () => {
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "forward")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "reverse")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "triangle")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "open")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferences, "none")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferences, "scale")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferences, "view-x")).toBe(2);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.sizeReferences, "view-y")).toBe(3);
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

    test("resolves band-relative style size despite the internal size placeholder", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32, band: "A" }] },
                mark: { type: "arrow", style: "arrow-block" },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );
        const mark = /** @type {import("./arrow.js").default} */ (
            /** @type {UnitView} */ (view).mark
        );

        expect(mark.encoding.size).toEqual({ value: 0 });
        expect(
            getRelativeSizeUniformProps(
                mark.properties.size,
                view.spec.encoding?.size != null,
                mark.encoding,
                view
            )
        ).toMatchObject({
            band: 1,
            reference: "scale",
            channel: "y",
        });
    });

    test("rejects band-relative size for diagonal-capable arrows", async () => {
        await expect(
            create(
                {
                    data: { values: [{ x: 0, y: 0, x2: 1, y2: 1 }] },
                    mark: { type: "arrow", size: { band: 0.5 } },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        x2: { field: "x2" },
                        y2: { field: "y2" },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            "Band-relative arrow size is not supported for diagonal arrows."
        );
    });
});

describe("arrow mark endpoint completion", () => {
    test("uses rule-style full-span completion for a single x channel", async () => {
        const view = await create(
            {
                data: { values: [{ position: 8 }] },
                mark: "arrow",
                encoding: {
                    x: { field: "position", type: "index" },
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding).toMatchObject({
            y: { value: 0 },
            y2: { value: 1 },
        });
        expect(/** @type {UnitView} */ (view).mark.encoding.x2).toBe(
            /** @type {UnitView} */ (view).mark.encoding.x
        );
    });

    test("uses rule-style full-span completion for a single y channel", async () => {
        const view = await create(
            {
                data: { values: [{ band: "A" }] },
                mark: "arrow",
                encoding: {
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding).toMatchObject({
            x: { value: 0 },
            x2: { value: 1 },
        });
        expect(/** @type {UnitView} */ (view).mark.encoding.y2).toBe(
            /** @type {UnitView} */ (view).mark.encoding.y
        );
    });

    test("keeps diagonal endpoints when all positional channels are defined", async () => {
        const x = /** @type {const} */ ({ field: "x1", type: "quantitative" });
        const y = /** @type {const} */ ({ field: "y1", type: "quantitative" });
        const x2 = /** @type {const} */ ({ field: "x2" });
        const y2 = /** @type {const} */ ({ field: "y2" });
        const view = await create(
            {
                data: { values: [{ x1: 0, y1: 0, x2: 1, y2: 1 }] },
                mark: "arrow",
                encoding: { x, y, x2, y2 },
            },
            UnitView
        );

        expect(/** @type {UnitView} */ (view).mark.encoding).toMatchObject({
            x,
            y,
            x2,
            y2,
        });
    });
});
