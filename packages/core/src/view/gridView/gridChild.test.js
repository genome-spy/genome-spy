import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import GridChild, { resolveIntervalZoomEventConfig } from "./gridChild.js";
import { iterateLegendViews } from "./gridChildLegends.js";
import Padding from "../layout/padding.js";
import Point from "../layout/point.js";
import Rectangle from "../layout/rectangle.js";
import TitleView from "../titleView.js";
import ContainerView from "../containerView.js";
import { createTestViewContext } from "../testUtils.js";
import LayerView from "../layerView.js";
import UnitView from "../unitView.js";
import { isChromeView } from "../viewSelectors.js";

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
        getDataAncestors() {
            return [this];
        },
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

function createRulerGridChildView(
    /** @type {import("../../spec/parameter.js").Parameter[]} */ params
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
            params,
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        },
        context,
        layoutParent,
        layoutParent,
        "child"
    );
    view.getParentGridChromePolicy = () => ({
        axes: true,
        background: true,
    });
    view.needsAxes.x = false;
    view.getConfiguredOrDefaultResolution = () => "excluded";
    view.facetCoords.set(null, Rectangle.create(0, 0, 100, 100));

    /** @param {number} value */
    const scale = (value) => value;
    scale.type = "linear";
    /** @param {number} value */
    scale.invert = (value) => value;
    view.getScaleResolution = () =>
        /** @type {any} */ ({
            getResolvedScaleType: () => "linear",
            getScale: () => scale,
            isZoomable: () => false,
            addEventListener: () => {},
        });

    return { view, layoutParent };
}

function createIntervalGridChildView(
    /** @type {import("../../spec/parameter.js").Parameter[]} */ params
) {
    const context = createTestViewContext();
    context.suspendHoverTracking = vi.fn();
    context.resumeHoverTracking = vi.fn();
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
            params,
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        },
        context,
        layoutParent,
        layoutParent,
        "child"
    );
    view.getParentGridChromePolicy = () => ({
        axes: true,
        background: true,
    });
    view.needsAxes.x = false;
    view.facetCoords.set(null, Rectangle.create(0, 0, 100, 100));

    /** @param {number} value */
    const scale = (value) => value;
    scale.type = "linear";
    /** @param {number} value */
    scale.invert = (value) => value;
    view.getScaleResolution = () =>
        /** @type {any} */ ({
            getResolvedScaleType: () => "linear",
            getScale: () => scale,
            isZoomable: () => false,
            zoomExtent: [0, 1],
        });

    return { view, layoutParent };
}

function createInteractionEvent(
    /** @type {Partial<import("../../utils/interaction.js").default>} */ event = {}
) {
    return {
        point: new Point(50, 50),
        mouseEvent: { button: 0 },
        proxiedMouseEvent: {},
        stopPropagation: vi.fn(),
        ...event,
    };
}

function createInheritedRulerGridChildView(
    /** @type {import("../../spec/parameter.js").Parameter[]} */ parentParams
) {
    const context = createTestViewContext();
    const layoutParent = new ContainerView(
        { layer: [], params: parentParams },
        context,
        null,
        null,
        "parent"
    );
    const view = new UnitView(
        {
            data: { values: [{ x: 1 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        },
        context,
        layoutParent,
        layoutParent,
        "child"
    );
    view.getParentGridChromePolicy = () => ({
        axes: true,
        background: true,
    });
    view.needsAxes.x = false;
    view.facetCoords.set(null, Rectangle.create(0, 0, 100, 100));

    /** @param {number} value */
    const scale = (value) => value;
    scale.type = "linear";
    /** @param {number} value */
    scale.invert = (value) => value * 10;
    view.getScaleResolution = () =>
        /** @type {any} */ ({
            getResolvedScaleType: () => "linear",
            getScale: () => scale,
            isZoomable: () => false,
            addEventListener: () => {},
        });

    return { view, layoutParent };
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

        await child.syncGuideViews();

        expect(child.backgroundStroke).toBeUndefined();
        expect(child.axisCandidates).toHaveLength(0);
    });
});

describe("GridChild ruler interactions", () => {
    beforeEach(() => {
        vi.spyOn(LayerView.prototype, "initializeChildren").mockResolvedValue(
            undefined
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("registers mousemove listeners for pointer ruler params", () => {
        /** @type {Map<string, any>} */
        const listeners = new Map();
        const { view, layoutParent } = createRulerGridChildView([
            {
                name: "cursor",
                ruler: { encodings: ["x"] },
            },
        ]);
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, listener);
        };

        const child = new GridChild(view, layoutParent, 0);

        expect(listeners.has("mousemove")).toBe(true);
        expect(listeners.has("mouseleave")).toBe(true);

        const rulerOverlay = Array.from(child.getChildren()).find(
            (view) => view.defaultName === "rulerOverlay0_cursor"
        );
        expect(rulerOverlay).toBeDefined();
        expect(isChromeView(rulerOverlay)).toBe(true);
    });

    test("tracks pointer rulers without rendering an overlay when display is none", () => {
        /** @type {Map<string, any>} */
        const listeners = new Map();
        const { view, layoutParent } = createRulerGridChildView([
            {
                name: "cursor",
                ruler: { encodings: ["x"], display: "none" },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, listener);
        };

        const child = new GridChild(view, layoutParent, 0);
        listeners.get("mousemove")({
            point: { x: 2, y: 0 },
            proxiedMouseEvent: {},
        });

        const rulerOverlay = Array.from(child.getChildren()).find(
            (view) => view.defaultName === "rulerOverlay0_cursor"
        );
        expect(rulerOverlay).toBeUndefined();
        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: 0.02,
            },
        });
    });

    test("disposes pointer ruler view listeners", () => {
        /** @type {Map<string, any>} */
        const listeners = new Map();
        const { view, layoutParent } = createRulerGridChildView([
            {
                name: "cursor",
                ruler: { encodings: ["x"] },
            },
        ]);
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, listener);
        };
        view.removeInteractionListener = (type, listener) => {
            if (listeners.get(type) === listener) {
                listeners.delete(type);
            }
        };

        const child = new GridChild(view, layoutParent, 0);
        expect(listeners.has("mousemove")).toBe(true);
        expect(listeners.has("mouseleave")).toBe(true);

        child.dispose();

        expect(listeners.has("mousemove")).toBe(false);
        expect(listeners.has("mouseleave")).toBe(false);
    });

    test("registers viewport ruler params and seeds their value", () => {
        const { view, layoutParent } = createRulerGridChildView([
            {
                name: "center",
                ruler: {
                    source: "viewport",
                    encodings: ["x"],
                    snap: false,
                },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        /** @param {number} value */
        const scale = (value) => value;
        scale.type = "linear";
        /** @param {number} value */
        scale.invert = (value) => value * 10;
        view.getScaleResolution = () =>
            /** @type {any} */ ({
                getResolvedScaleType: () => "linear",
                getScale: () => scale,
                addEventListener: () => {},
            });
        view.addInteractionListener = () => {};

        new GridChild(view, layoutParent, 0);

        expect(setValue).toHaveBeenCalledWith("center", {
            type: "ruler",
            values: {
                x: 5,
            },
        });
    });

    test("disposes viewport ruler scale listeners", () => {
        const { view, layoutParent } = createRulerGridChildView([
            {
                name: "center",
                ruler: {
                    source: "viewport",
                    encodings: ["x"],
                    snap: false,
                },
            },
        ]);
        /** @type {Record<"domain" | "range", Set<any>>} */
        const listeners = {
            domain: new Set(),
            range: new Set(),
        };
        /** @param {number} value */
        const scale = (value) => value;
        scale.type = "linear";
        scale.invert = (/** @type {number} */ value) => value * 10;
        view.getScaleResolution = () =>
            /** @type {any} */ ({
                getResolvedScaleType: () => "linear",
                getScale: () => scale,
                addEventListener: (
                    /** @type {"domain" | "range"} */ type,
                    /** @type {() => void} */ listener
                ) => {
                    listeners[type].add(listener);
                },
                removeEventListener: (
                    /** @type {"domain" | "range"} */ type,
                    /** @type {() => void} */ listener
                ) => {
                    listeners[type].delete(listener);
                },
            });
        view.addInteractionListener = () => {};

        const child = new GridChild(view, layoutParent, 0);
        expect(listeners.domain.size).toBe(1);
        expect(listeners.range.size).toBe(1);

        child.dispose();

        expect(listeners.domain.size).toBe(0);
        expect(listeners.range.size).toBe(0);
    });

    test("attaches inherited pointer ruler params to child views", () => {
        /** @type {Map<string, any>} */
        const listeners = new Map();
        const { view, layoutParent } = createInheritedRulerGridChildView([
            {
                name: "cursor",
                ruler: { encodings: ["x"] },
            },
        ]);
        const setValue = vi.spyOn(layoutParent.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, listener);
        };

        const child = new GridChild(view, layoutParent, 0);
        listeners.get("mousemove")({
            point: { x: 2, y: 0 },
            proxiedMouseEvent: {},
        });

        const rulerOverlay = Array.from(child.getChildren()).find(
            (view) => view.defaultName === "rulerOverlay0_cursor"
        );
        expect(rulerOverlay).toBeDefined();
        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: 0.2,
            },
        });
    });
});

describe("GridChild interval selection interactions", () => {
    beforeEach(() => {
        vi.spyOn(LayerView.prototype, "initializeChildren").mockResolvedValue(
            undefined
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("clears interval selections on dblclick by default", () => {
        /** @type {Map<string, any[]>} */
        const listeners = new Map();
        const { view, layoutParent } = createIntervalGridChildView([
            {
                name: "brush",
                value: { x: [0.1, 0.8] },
                select: { type: "interval", encodings: ["x"] },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        };

        new GridChild(view, layoutParent, 0);
        setValue.mockClear();
        setValue.mockImplementation(() => {});
        listeners.get("dblclick")[0](createInteractionEvent());

        expect(setValue).toHaveBeenCalledWith("brush", {
            type: "interval",
            intervals: { x: null },
        });
    });

    test("honors filtered interval selection clear events", () => {
        /** @type {Map<string, any[]>} */
        const listeners = new Map();
        const { view, layoutParent } = createIntervalGridChildView([
            {
                name: "brush",
                value: { x: [0.1, 0.8] },
                select: {
                    type: "interval",
                    encodings: ["x"],
                    clear: "dblclick[event.shiftKey]",
                },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        };

        new GridChild(view, layoutParent, 0);
        setValue.mockClear();
        setValue.mockImplementation(() => {});
        listeners.get("dblclick")[0](
            createInteractionEvent({
                proxiedMouseEvent: /** @type {any} */ ({ shiftKey: false }),
            })
        );
        expect(setValue).not.toHaveBeenCalled();

        listeners.get("dblclick")[0](
            createInteractionEvent({
                proxiedMouseEvent: /** @type {any} */ ({ shiftKey: true }),
            })
        );
        expect(setValue).toHaveBeenCalledWith("brush", {
            type: "interval",
            intervals: { x: null },
        });
    });

    test("does not clear interval selections on dblclick when clear is false", () => {
        /** @type {Map<string, any[]>} */
        const listeners = new Map();
        const { view, layoutParent } = createIntervalGridChildView([
            {
                name: "brush",
                value: { x: [0.1, 0.8] },
                select: {
                    type: "interval",
                    encodings: ["x"],
                    clear: false,
                },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        };

        new GridChild(view, layoutParent, 0);
        setValue.mockClear();
        setValue.mockImplementation(() => {});

        expect(listeners.has("dblclick")).toBe(false);
    });

    test("does not clear active intervals on click-release when clear is false", () => {
        /** @type {Map<string, any[]>} */
        const listeners = new Map();
        const { view, layoutParent } = createIntervalGridChildView([
            {
                name: "brush",
                value: { x: [0.1, 0.8] },
                select: {
                    type: "interval",
                    encodings: ["x"],
                    on: "mousedown[event.shiftKey]",
                    clear: false,
                },
            },
        ]);
        const setValue = vi.spyOn(view.paramRuntime, "setValue");
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        };
        view.removeInteractionListener = (type, listener) => {
            listeners.set(
                type,
                (listeners.get(type) ?? []).filter(
                    (candidate) => candidate !== listener
                )
            );
        };

        new GridChild(view, layoutParent, 0);
        setValue.mockClear();
        setValue.mockImplementation(() => {});
        listeners.get("mousedown")[0](
            createInteractionEvent({
                proxiedMouseEvent: /** @type {any} */ ({ shiftKey: false }),
            })
        );
        for (const listener of listeners.get("mouseup") ?? []) {
            listener(createInteractionEvent());
        }

        expect(setValue).not.toHaveBeenCalled();
    });

    test("disposes interval selection view listeners", () => {
        /** @type {Map<string, any[]>} */
        const listeners = new Map();
        const { view, layoutParent } = createIntervalGridChildView([
            {
                name: "brush",
                select: { type: "interval", encodings: ["x"] },
            },
        ]);
        view.addInteractionListener = (type, listener) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        };
        view.removeInteractionListener = (type, listener) => {
            listeners.set(
                type,
                (listeners.get(type) ?? []).filter(
                    (candidate) => candidate !== listener
                )
            );
        };
        const listenerCount = () =>
            Array.from(listeners.values()).flat().length;

        const child = new GridChild(view, layoutParent, 0);
        expect(listenerCount()).toBeGreaterThan(0);

        child.dispose();

        expect(listenerCount()).toBe(0);
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
