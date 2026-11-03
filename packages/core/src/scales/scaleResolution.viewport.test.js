import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Animator from "../utils/animator.js";
import { renderToLayout } from "../view/testUtils.js";
import Rectangle from "../view/layout/rectangle.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

/** @param {import("../spec/scale.js").Scale} [scale] */
function spec(scale = {}) {
    return /** @type {import("../spec/root.js").RootSpec} */ ({
        params: [{ name: "categories", value: ["A", "B", "C", "D"] }],
        data: { values: [{ category: "A" }, { category: "C" }] },
        layer: [{ mark: "rect" }, { mark: "text" }],
        encoding: {
            x: {
                field: "category",
                type: "nominal",
                scale: {
                    type: "band",
                    domain: { expr: "categories" },
                    zoom: true,
                    ...scale,
                },
                axis: null,
            },
        },
    });
}

test("shared categorical navigation preserves membership and reset while categories keep updating", async () => {
    const { view } = await createHeadlessEngine(spec({ viewport: [1, 3] }));
    onTestFinished(() => view.disposeSubtree());
    const x = getRequiredScaleResolution(view, "x");
    const domainChanged = vi.fn();
    const viewportChanged = vi.fn();
    x.addEventListener("domain", domainChanged);
    x.addEventListener("viewport", viewportChanged);
    expect(x.getViewport()).toEqual([1, 3]);
    expect(x.getZoomLevel()).toBe(2);
    expect(x.isZoomed()).toBe(false);
    x.zoom(0.5, 0.5, 0, 200);
    expect(x.getViewport()).toEqual([1.5, 2.5]);
    expect(x.getDomain()).toEqual(["A", "B", "C", "D"]);
    expect(domainChanged).not.toHaveBeenCalled();
    expect(viewportChanged).toHaveBeenCalledOnce();
    expect(x.getZoomLevel()).toBe(4);
    expect(x.resetZoom()).toBe(true);
    expect(x.getViewport()).toEqual([1, 3]);

    await x.zoomToViewport([2, 4]);
    view.paramRuntime.setValue("categories", ["D", "A", "C", "B", "E"]);
    await view.paramRuntime.whenPropagated();
    expect(x.getDomain()).toEqual(["D", "A", "C", "B", "E"]);
    expect(x.getViewport()).toEqual([2, 4]);
    view.paramRuntime.setValue("categories", ["D", "A"]);
    await view.paramRuntime.whenPropagated();
    expect(x.getViewport()).toEqual([0, 2]);
    expect(x.isZoomed()).toBe(false);
    expect(x.resetZoom()).toBe(false);
    await x.zoomToViewport(null);
    view.paramRuntime.setValue("categories", ["A", "B", "C"]);
    await view.paramRuntime.whenPropagated();
    expect(x.getViewport()).toBeNull();
    expect(x.getDomain()).toEqual(["A", "B", "C"]);
    await expect(x.zoomTo([0, 2])).rejects.toThrow("zoomToViewport");
});

test("point uses the same viewport commands even without gesture zooming", async () => {
    const { view } = await createHeadlessEngine(
        spec({ type: "point", zoom: false })
    );
    onTestFinished(() => view.disposeSubtree());
    const x = getRequiredScaleResolution(view, "x");
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        x.getScale()
    );
    expect(x.isZoomable()).toBe(false);
    const interval = /** @type {[number, number]} */ ([1, 3]);
    await x.zoomToViewport(interval);
    interval[0] = -10;
    expect(x.getViewport()).toEqual([1, 3]);
    expect(scale.bandwidth()).toBe(0);
    const snapshot = x.getViewport();
    snapshot[0] = -10;
    expect(x.getViewport()).toEqual([1, 3]);
    x.resetZoom();
    expect(x.getViewport()).toBeNull();
});

test("animated interval navigation cancels stale targets when gaps or categories change", async () => {
    const animator = new Animator(() => undefined);
    vi.spyOn(animator, "requestRender").mockImplementation(() => undefined);
    const input = spec({ gapPositions: { expr: "cuts" }, gapWidth: 8 });
    input.params.push({ name: "cuts", value: ["B", "C"] });
    const { view } = await createHeadlessEngine(input, {
        contextOptions: { animator },
    });
    onTestFinished(() => {
        view.disposeSubtree();
        animator.finalize();
    });
    const x = getRequiredScaleResolution(view, "x");
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        x.getScale()
    );
    scale.axisLength(200);
    const target = /** @type {[number, number]} */ ([1, 3]);
    const transition = x.zoomToViewport(target, { duration: 500 });
    animator.transitions
        .splice(0)
        .forEach((frame) => frame(performance.now() + 1000));
    await transition;
    expect(x.getViewport()).toEqual(target);
    const changedGaps = x.zoomToViewport([0, 1], { duration: 500 });
    view.paramRuntime.setValue("cuts", []);
    await view.paramRuntime.whenPropagated();
    animator.transitions
        .splice(0)
        .forEach((frame) => frame(performance.now() + 1000));
    await changedGaps;
    expect(x.getViewport()).toEqual([1, 3]);
    const interrupted = x.zoomToViewport([0, 1], { duration: 500 });
    view.paramRuntime.setValue("categories", ["C", "A"]);
    await view.paramRuntime.whenPropagated();
    animator.transitions
        .splice(0)
        .forEach((frame) => frame(performance.now() + 1000));
    await interrupted;
    expect(x.getViewport()).toEqual([0, 2]);
});

test.each([{ zoom: { extent: "data" } }, { viewport: [0, 2], round: true }])(
    "rejects unsupported categorical navigation configuration: %j",
    async (scale) => {
        await expect(
            createHeadlessEngine(
                spec(/** @type {import("../spec/scale.js").Scale} */ (scale))
            )
        ).rejects.toThrow(/Categorical/);
    }
);

test("categorical navigation updates fitted offsets without changing a step-based content size", async () => {
    const { view } = await createHeadlessEngine({
        width: { step: 20 },
        data: {
            values: ["A", "B", "C", "D"].flatMap((category) =>
                ["p", "q"].map((group) => ({ category, group }))
            ),
        },
        mark: "rect",
        encoding: {
            x: {
                field: "category",
                type: "nominal",
                scale: { type: "band", zoom: true },
                axis: null,
            },
            xOffset: { field: "group", type: "nominal" },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    renderToLayout(view, Rectangle.create(0, 0, 300, 100));
    const x = getRequiredScaleResolution(view, "x");
    const offset = getRequiredScaleResolution(view, "xOffset").getScale();
    const width = view.coords.width;
    const before = offset.range()[1];
    await x.zoomToViewport([1, 3]);
    renderToLayout(view, Rectangle.create(0, 0, 300, 100));
    expect(view.coords.width).toBe(width);
    expect(offset.range()[1]).toBeGreaterThan(before);
    expect(offset.range()[1]).toBeCloseTo(
        /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
            x.getScale()
        ).bandwidth() * width
    );
});

test("replacement viewport bounds use the newly configured categorical domain", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ category: "A" }] },
        scales: {
            x: {
                type: "band",
                domain: ["A", "B"],
                viewport: [0, 1],
                zoom: true,
            },
        },
        mark: "rect",
        encoding: { x: { field: "category", type: "nominal", axis: null } },
    });
    onTestFinished(() => view.disposeSubtree());
    const x = getRequiredScaleResolution(view, "x");
    x.attachViewLevelScaleProps(view, {
        type: "band",
        domain: ["A", "B", "C", "D"],
        viewport: [2, 4],
        zoom: true,
    });
    await view.paramRuntime.whenPropagated();
    expect(x.getDomain()).toEqual(["A", "B", "C", "D"]);
    expect(x.getViewport()).toEqual([2, 4]);
    expect(x.isZoomed()).toBe(false);
});

test("initial viewport reconciliation publishes the settled zoom metric", async () => {
    const input = spec({ viewport: [0, 8] });
    input.params.push({ name: "zoom", expr: "zoomLevel('x')" });
    const { view } = await createHeadlessEngine(input);
    onTestFinished(() => view.disposeSubtree());
    const x = getRequiredScaleResolution(view, "x");
    expect(x.getViewport()).toEqual([0, 4]);
    expect(view.paramRuntime.getValue("zoom")).toBe(1);
    expect(x.isZoomed()).toBe(false);
});

test("interval navigation animates internal gap state and returns to fit-all", async () => {
    const animator = new Animator(() => undefined);
    vi.spyOn(animator, "requestRender").mockImplementation(() => undefined);
    const { view } = await createHeadlessEngine(
        spec({ gapPositions: ["B", "D"], gapWidth: 8 }),
        { contextOptions: { animator } }
    );
    onTestFinished(() => {
        view.disposeSubtree();
        animator.finalize();
    });
    const x = getRequiredScaleResolution(view, "x");
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        x.getScale()
    );
    scale.axisLength(100);
    const from = {
        interval: /** @type {[number, number]} */ ([1, 3]),
        gapRanks: /** @type {[number, number]} */ ([0.25, 1.75]),
    };
    scale.viewport(from);
    const before = scale.gapMapping().position("B");
    const final = scale
        .copy()
        .viewport({ interval: from.interval })
        .gapMapping()
        .position("B");
    const transition = x.zoomToViewport(from.interval, { duration: 500 });
    expect(x.getViewport()).toEqual(from.interval);
    const start = performance.now();
    animator.transitions.splice(0).forEach((frame) => frame(start + 250));
    const middle = scale.gapMapping().position("B");
    expect(middle).toBeGreaterThan(Math.min(before, final));
    expect(middle).toBeLessThan(Math.max(before, final));
    animator.transitions.splice(0).forEach((frame) => frame(start + 1000));
    await transition;
    expect(x.getViewport()).toEqual(from.interval);
    expect(scale.gapMapping().position("B")).toBeCloseTo(final);
    expect(scale.viewport().gapRanks).toBeUndefined();

    const reset = x.zoomToViewport(null, { duration: 500 });
    expect(x.getViewport()).toEqual(from.interval);
    animator.transitions
        .splice(0)
        .forEach((frame) => frame(performance.now() + 1000));
    await reset;
    expect(x.getViewport()).toBeNull();
    expect(x.getMappingRef().get().viewport).toBeNull();
});

test("ordinary categorical intervals share one-band limits across authored, API, and reset bounds", async () => {
    const { view } = await createHeadlessEngine(
        spec({ viewport: [1, 1.2], gapPositions: ["B"], gapWidth: 8 })
    );
    onTestFinished(() => view.disposeSubtree());
    const x = getRequiredScaleResolution(view, "x");
    const authored = x.getViewport();
    expect(authored[1] - authored[0]).toBeCloseTo(1);
    expect(x.isZoomed()).toBe(false);
    await x.zoomToViewport([0.8, 1]);
    const normalized = x.getViewport();
    await x.zoomToViewport(normalized);
    expect(x.getViewport()).toEqual(normalized);
    expect(x.getMappingRef().get().viewport.interval).toEqual(normalized);
    await x.zoomToViewport([0, 0.2]);
    expect(x.getViewport()).toEqual([0, 1]);
    x.resetZoom();
    expect(x.getViewport()).toEqual(authored);
    expect(x.isZoomed()).toBe(false);
    const exact = {
        interval: /** @type {[number, number]} */ ([1, 1.2]),
        gapRanks: /** @type {[number, number]} */ ([0.5, 1]),
    };
    /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        x.getScale()
    ).viewport(exact);
    expect(x.getViewport()).toEqual(exact.interval);
    view.paramRuntime.setValue("categories", ["A", "B", "D", "C"]);
    await view.paramRuntime.whenPropagated();
    // Clearing stale gap ranks must normalize both owner state and live scale.
    expect(x.getMappingRef().get().viewport.interval).toEqual(authored);
    expect(x.getViewport()).toEqual(authored);
    x.resetZoom();
    view.paramRuntime.setValue("categories", []);
    await view.paramRuntime.whenPropagated();
    expect(x.getViewport()).toEqual(authored);
    view.paramRuntime.setValue("categories", ["A"]);
    await view.paramRuntime.whenPropagated();
    expect(x.getViewport()).toEqual([0, 1]);
    expect(x.isZoomed()).toBe(false);
});
