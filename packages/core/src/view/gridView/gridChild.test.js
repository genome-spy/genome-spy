import { describe, expect, test } from "vitest";

import GridChild, { resolveIntervalZoomEventConfig } from "./gridChild.js";
import Padding from "../layout/padding.js";

function createMinimalGridChild() {
    const view = /** @type {any} */ ({
        needsAxes: { x: false, y: false },
        spec: {},
        getOverhang: () => Padding.zero(),
        getPadding: () => Padding.zero(),
        paramRuntime: { paramConfigs: new Map() },
    });
    const layoutParent = /** @type {any} */ ({
        context: {},
        spec: {},
    });

    return new GridChild(view, layoutParent, 0);
}

describe("GridChild legend layout", () => {
    test("right legend contributes to right overhang", () => {
        const child = createMinimalGridChild();
        child.legends.right = /** @type {any} */ ({
            legendProps: { orient: "right" },
            getPerpendicularSize: () => 42,
        });

        expect(child.getOverhang().right).toBe(42);
    });
});

describe("resolveIntervalZoomEventConfig", () => {
    test("defaults to disabled on zoomable channels", () => {
        const config = resolveIntervalZoomEventConfig(undefined, true, "brush");

        expect(config).toBeUndefined();
    });

    test("defaults to wheel on non-zoomable channels", () => {
        const config = resolveIntervalZoomEventConfig(
            undefined,
            false,
            "brush"
        );

        expect(config).toEqual({ type: "wheel" });
    });

    test("accepts explicit true and false", () => {
        expect(resolveIntervalZoomEventConfig(true, true, "brush")).toEqual({
            type: "wheel",
        });
        expect(
            resolveIntervalZoomEventConfig(false, false, "brush")
        ).toBeUndefined();
    });

    test("parses wheel event strings and objects", () => {
        expect(
            resolveIntervalZoomEventConfig("wheel[event.altKey]", true, "brush")
        ).toEqual({
            type: "wheel",
            filter: "event.altKey",
        });

        expect(
            resolveIntervalZoomEventConfig(
                {
                    type: "wheel",
                    filter: "event.shiftKey",
                },
                true,
                "brush"
            )
        ).toEqual({
            type: "wheel",
            filter: "event.shiftKey",
        });
    });

    test("rejects non-wheel zoom events", () => {
        expect(() =>
            resolveIntervalZoomEventConfig("mousedown", false, "brush")
        ).toThrow(
            'Interval selection param "brush" currently supports only "wheel" in "zoom".'
        );
    });
});
