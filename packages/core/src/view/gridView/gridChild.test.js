import { describe, expect, test, vi } from "vitest";

import GridChild, { resolveIntervalZoomEventConfig } from "./gridChild.js";
import { iterateLegendViews } from "./gridChildLegends.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import TitleView from "../titleView.js";
import ContainerView from "../containerView.js";
import { createTestViewContext } from "../testUtils.js";
import UnitView from "../unitView.js";

/**
 * @returns {GridChild}
 */
function createMinimalGridChild() {
    const view = /** @type {any} */ ({
        needsAxes: { x: false, y: false },
        spec: {},
        getConfigScopes:
            /** @returns {import("../../spec/config.js").GenomeSpyConfig[]} */ () => [],
        getParentGridChromePolicy: () => ({
            axes: true,
            background: true,
        }),
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

function createMinimalGridChildWithPolicy(
    /** @type {import("../view.js").ParentGridChromePolicy} */ policy
) {
    const context = createTestViewContext();
    const layoutParent = new ContainerView(
        { layer: [] },
        context,
        null,
        null,
        "parent"
    );
    const view = new UnitView(
        {
            data: { values: [{ x: 1 }] },
            mark: "point",
            view: {
                stroke: "lightgray",
            },
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        },
        context,
        layoutParent,
        layoutParent,
        "child"
    );
    view.getParentGridChromePolicy = () => policy;
    view.needsAxes.x = true;
    view.getConfiguredOrDefaultResolution = () => "excluded";

    return new GridChild(view, layoutParent, 0);
}

function createTitledGridChild(
    /** @type {Partial<import("../../spec/title.js").Title>} */ titleSpec
) {
    const child = createMinimalGridChild();
    const context = createTestViewContext();
    context.fontManager = createFontManager();
    const parent = new ContainerView(
        { layer: [] },
        context,
        null,
        null,
        "parent"
    );
    child.title = TitleView.create(
        /** @type {import("../../spec/title.js").Title} */ ({
            text: "Title",
            orient: "top",
            offset: 10,
            fontSize: 12,
            angle: 0,
            ...titleSpec,
        }),
        [],
        context,
        parent,
        parent,
        "title"
    );

    return child;
}

function createFontManager() {
    return /** @type {any} */ ({
        getDefaultFont: () => ({
            metrics: createFontMetrics(),
        }),
        getFont: () => ({
            metrics: createFontMetrics(),
        }),
    });
}

function createFontMetrics() {
    return /** @type {import("../../fonts/bmFontMetrics.js").BMFontMetrics} */ ({
        common: { base: 10 },
        capHeight: 7,
        descent: 2,
        measureWidth: (
            /** @type {string} */ text,
            /** @type {number} */ size
        ) => text.length * size,
    });
}

function createLegendEntry(
    /** @type {number} */ size,
    /** @type {boolean} */ visible
) {
    return {
        legendView: {
            legendProps: { orient: "right" },
            getPerpendicularSize: () => size,
            getOffset: () => 8,
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
            getOffset: () => 8,
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

describe("GridChild parent chrome policy", () => {
    test("keeps parent chrome enabled by default", () => {
        const child = createMinimalGridChildWithPolicy({
            axes: true,
            background: true,
        });

        expect(child.backgroundStroke?.name).toBe("backgroundStroke0");
    });

    test("allows child views to opt out of parent-owned chrome", async () => {
        const child = createMinimalGridChildWithPolicy({
            axes: false,
            background: false,
        });

        await child.createAxes();

        expect(child.backgroundStroke).toBeUndefined();
        expect(child.axisCandidates).toHaveLength(0);
    });
});

describe("GridChild ruler interactions", () => {
    test("registers mousemove listeners for pointer ruler params", () => {
        const listeners = new Map();
        const scale = (value) => value;
        scale.type = "linear";
        scale.invert = (value) => value;
        const view = /** @type {any} */ ({
            needsAxes: { x: false, y: false },
            spec: {},
            getConfigScopes:
                /** @returns {import("../../spec/config.js").GenomeSpyConfig[]} */ () => [],
            getParentGridChromePolicy: () => ({
                axes: true,
                background: true,
            }),
            getOverhang: () => Padding.zero(),
            getPadding: () => Padding.zero(),
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "cursor",
                        {
                            name: "cursor",
                            ruler: { encodings: ["x"] },
                        },
                    ],
                ]),
                setValue: () => {},
            },
            coords: Rectangle.create(0, 0, 100, 100),
            getScaleResolution: () => ({
                getResolvedScaleType: () => "linear",
                getScale: () => scale,
            }),
            addInteractionListener(type, listener) {
                listeners.set(type, listener);
            },
        });
        const layoutParent = /** @type {any} */ ({
            context: {},
            spec: {},
        });

        new GridChild(view, layoutParent, 0);

        expect(listeners.has("mousemove")).toBe(true);
        expect(listeners.has("mouseleave")).toBe(true);
    });

    test("registers viewport ruler params and seeds their value", () => {
        const setValue = vi.fn();
        const scale = (value) => value;
        scale.type = "linear";
        scale.invert = (value) => value * 10;
        const view = /** @type {any} */ ({
            needsAxes: { x: false, y: false },
            spec: {},
            getConfigScopes:
                /** @returns {import("../../spec/config.js").GenomeSpyConfig[]} */ () => [],
            getParentGridChromePolicy: () => ({
                axes: true,
                background: true,
            }),
            getOverhang: () => Padding.zero(),
            getPadding: () => Padding.zero(),
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "center",
                        {
                            name: "center",
                            ruler: {
                                source: "viewport",
                                encodings: ["x"],
                                snap: false,
                            },
                        },
                    ],
                ]),
                setValue,
            },
            getScaleResolution: () => ({
                getResolvedScaleType: () => "linear",
                getScale: () => scale,
                addEventListener: () => {},
            }),
            addInteractionListener: () => {},
        });
        const layoutParent = /** @type {any} */ ({
            context: {},
            spec: {},
        });

        new GridChild(view, layoutParent, 0);

        expect(setValue).toHaveBeenCalledWith("center", {
            type: "ruler",
            values: {
                x: 5,
            },
        });
    });
});

describe("GridChild title layout", () => {
    test("default view title contributes top overhang", () => {
        const child = createTitledGridChild({});

        expect(child.getOverhang().top).toBeGreaterThan(0);
    });

    test("overlay view title does not contribute external overhang", () => {
        const child = createTitledGridChild({
            text: "Overlay",
            offset: -10,
        });

        expect(child.getOverhang().top).toBe(0);
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
