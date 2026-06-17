import { describe, expect, test } from "vitest";

import GridChild, { resolveIntervalZoomEventConfig } from "./gridChild.js";
import { iterateLegendViews } from "./gridChildLegends.js";
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

function createLegendEntry(
    /** @type {number} */ size,
    /** @type {boolean} */ visible
) {
    return {
        legendView: {
            legendProps: { orient: "right" },
            getPerpendicularSize: () => size,
            getExternalPadding: () => 8,
        },
        resolution: {
            hasVisibleNonChromeMember: () => visible,
        },
    };
}

function createLegendRegion(
    /** @type {ReturnType<typeof createLegendEntry>[]} */ entries
) {
    return {
        legendView: {
            getPerpendicularSize: () =>
                Math.max(
                    0,
                    ...entries.map((entry) =>
                        entry.legendView.getPerpendicularSize()
                    )
                ),
            getExternalPadding: () => 8,
        },
        entries,
    };
}

describe("GridChild legend layout", () => {
    test("right legend contributes to right overhang", () => {
        const child = createMinimalGridChild();
        child.legends.right = /** @type {any} */ (
            createLegendRegion([
                createLegendEntry(42, true),
                createLegendEntry(20, true),
            ])
        );

        expect(child.getOverhang().right).toBe(50);
    });

    test("hidden legend participants do not contribute overhang", () => {
        const child = createMinimalGridChild();
        child.legends.right = /** @type {any} */ (
            createLegendRegion([
                createLegendEntry(42, true),
                createLegendEntry(20, false),
            ])
        );

        expect(child.getOverhang().right).toBe(50);
    });

    test("hidden legend participants keep their legend views", () => {
        const child = createMinimalGridChild();
        child.legends.right = /** @type {any} */ (
            createLegendRegion([
                createLegendEntry(42, true),
                createLegendEntry(20, false),
            ])
        );

        expect(child.legends.right.entries).toHaveLength(2);
        expect(Array.from(iterateLegendViews(child.legends))).toHaveLength(1);
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
