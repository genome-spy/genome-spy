import { describe, expect, test } from "vitest";

import { getMarkRenderingIntent } from "./renderingIntent.js";

describe("getMarkRenderingIntent", () => {
    test("selects plain sample-faceted rectangles including null strokes", () => {
        expect(intent(rect())).toBe(4);
        expect(intent(rect({ stroke: { value: null } }))).toBe(4);
        expect(intent(rect({ sample: true, facetIndex: false }))).toBe(4);
    });

    test.each([
        ["points", { type: "point" }],
        ["ordinary rectangles", { facetIndex: false }],
        ["stroked rectangles", { stroke: { value: "black" } }],
        ["conditional strokes", { stroke: { value: null, condition: {} } }],
        ["rounded rectangles", { properties: { cornerRadius: 2 } }],
        ["shadowed rectangles", { properties: { shadowOpacity: 0.5 } }],
        ["hatched rectangles", { properties: { hatch: "diagonal" } }],
    ])("keeps %s direct", (_name, options) => {
        expect(intent(rect(/** @type {any} */ (options)))).toBe(1);
    });
});

/** @param {object} [options] */
function rect(options = {}) {
    const {
        type = "rect",
        facetIndex = true,
        sample = false,
        stroke,
        properties = {},
    } = /** @type {any} */ (options);
    return /** @type {import("../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            getType: () => type,
            encoders: {
                ...(facetIndex ? { facetIndex: () => 0 } : {}),
                ...(sample ? { sample: () => "sample" } : {}),
            },
            encoding: stroke === undefined ? {} : { stroke },
            properties,
        })
    );
}

/** @param {import("../marks/mark.js").default} mark */
function intent(mark) {
    return getMarkRenderingIntent(mark).sampleCount;
}
