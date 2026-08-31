import { describe, expect, test } from "vitest";

import { needsCoverageAntialiasing } from "./renderingIntent.js";

describe("needsCoverageAntialiasing", () => {
    test("selects plain rectangles including null strokes", () => {
        expect(needsCoverageAntialiasing(rect())).toBe(true);
        expect(
            needsCoverageAntialiasing(rect({ stroke: { value: null } }))
        ).toBe(true);
    });

    test.each([
        ["points", { type: "point" }],
        ["stroked rectangles", { stroke: { value: "black" } }],
        ["conditional strokes", { stroke: { value: null, condition: {} } }],
        ["rounded rectangles", { properties: { cornerRadius: 2 } }],
        ["shadowed rectangles", { properties: { shadowOpacity: 0.5 } }],
        ["hatched rectangles", { properties: { hatch: "diagonal" } }],
    ])("keeps %s direct", (_name, options) => {
        expect(
            needsCoverageAntialiasing(rect(/** @type {any} */ (options)))
        ).toBe(false);
    });
});

/** @param {object} [options] */
function rect(options = {}) {
    const {
        type = "rect",
        stroke,
        properties = {},
    } = /** @type {any} */ (options);
    return /** @type {import("../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            getType: () => type,
            encoding: stroke === undefined ? {} : { stroke },
            properties,
        })
    );
}
