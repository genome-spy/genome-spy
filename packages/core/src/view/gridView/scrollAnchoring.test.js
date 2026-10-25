// @vitest-environment jsdom

import { expect, onTestFinished, test, vi } from "vitest";
import Rectangle from "../layout/rectangle.js";
import { createHeadlessEngine, renderToLayout } from "../testUtils.js";
import { createSvg } from "../../rendering/svg/index.js";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import Scrollbar from "./scrollbar.js";

/** @typedef {"x" | "y"} Axis */

const contextOptions = {
    baseConfig: resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
    }),
};

/** @param {import("../view.js").default} view @param {string} name */
function find(view, name) {
    const descendant = view.getDescendants().find((v) => v.name === name);
    if (!descendant) throw new Error("Missing view: " + name);
    return descendant;
}

/**
 * Exercise the actual viewport owner and a growing descendant: initial offsets
 * must be ready before nested layout, not only when the scrollbar is painted.
 * @param {Axis} axis
 * @param {"start" | "end" | undefined} anchor
 * @param {number} [contentSize]
 */
async function initialize(axis, anchor, contentSize = 600) {
    const dimension = axis === "x" ? "width" : "height";
    const viewport = axis === "x" ? "viewportWidth" : "viewportHeight";
    /** @type {import("../../spec/view.js").VConcatSpec} */
    const panel = {
        name: "panel",
        width: 100,
        height: 100,
        vconcat: [
            {
                name: "content",
                mark: { type: "point", size: 20 },
                encoding: { x: { value: 0.5 }, y: { value: 0.5 } },
            },
        ],
    };
    panel[dimension] = { expr: "contentSize" };
    panel[viewport] = {
        expr: "viewportSize",
        ...(anchor === undefined ? {} : { anchor }),
    };
    /** @type {import("../../spec/view.js").ViewSpec[]} */
    const children = [
        panel,
        { name: "following", width: 20, height: 20, mark: "point" },
    ];
    const { view } = await createHeadlessEngine(
        {
            data: { values: [{}] },
            params: [
                { name: "contentSize", value: contentSize },
                { name: "viewportSize", value: 200 },
            ],
            spacing: 0,
            ...(axis === "x" ? { hconcat: children } : { vconcat: children }),
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());

    /** @param {string} name */
    const named = (name) => find(view, name);
    const scrollbar = /** @type {import("./scrollbar.js").default} */ (
        named("scrollbar-" + (axis === "x" ? "horizontal" : "vertical"))
    );
    const render = () => renderToLayout(view, Rectangle.create(0, 0, 400, 400));
    render();

    return { view, find: named, scrollbar, render };
}

test.each(/** @type {const} */ (["x", "y"]))(
    "%s anchor places overflowing and fitting content at the selected edge",
    async (axis) => {
        for (const [
            anchor,
            contentSize,
            expectedStart,
        ] of /** @type {const} */ ([
            [undefined, 600, 0],
            ["start", 100, 0],
            ["end", 600, -400],
            ["end", 100, 100],
        ])) {
            const { find, scrollbar } = await initialize(
                axis,
                anchor,
                contentSize
            );
            expect(find("content").layoutCoords[axis]).toBe(expectedStart);
            expect(find("following").layoutCoords[axis]).toBe(200);
            expect(scrollbar.viewportOffset).toBe(
                contentSize === 600 && anchor === "end" ? 400 : 0
            );
            expect(scrollbar.canScroll()).toBe(contentSize > 200);
            expect(scrollbar.getOpacity()).toBe(contentSize > 200 ? 1 : 0);
        }
    }
);

test.each(/** @type {const} */ (["x", "y"]))(
    "%s scrollbar visibility follows resizing and preserves caller opacity",
    async (axis) => {
        const { view, scrollbar, render } = await initialize(axis, "end");

        // SampleView independently controls this multiplier during peek transitions.
        scrollbar.paramRuntime.setValue("scrollbarOpacity", 0.5);
        expect(scrollbar.getOpacity()).toBe(0.5);

        view.paramRuntime.setValue("viewportSize", 600);
        render();
        expect(scrollbar.getOpacity()).toBe(0);

        scrollbar.paramRuntime.setValue("scrollbarOpacity", 0.8);
        expect(scrollbar.getOpacity()).toBe(0);

        view.paramRuntime.setValue("viewportSize", 800);
        render();
        expect(scrollbar.getOpacity()).toBe(0);

        view.paramRuntime.setValue("contentSize", 1000);
        render();
        expect(scrollbar.getOpacity()).toBe(0.8);

        scrollbar.paramRuntime.setValue("scrollbarOpacity", 0);
        expect(scrollbar.getOpacity()).toBe(0);
    }
);

test.each(/** @type {const} */ (["x", "y"]))(
    "%s navigation preserves distance from the end through content and viewport changes",
    async (axis) => {
        const { view, find, scrollbar, render } = await initialize(axis, "end");
        scrollbar.setViewportOffset(320, { syncSmoother: true });

        // The user is 80 pixels away from the end, rather than pinned to it.
        view.paramRuntime.setValue("contentSize", 800);
        render();
        expect(scrollbar.viewportOffset).toBe(520);
        expect(find("content").layoutCoords[axis]).toBe(-520);

        view.paramRuntime.setValue("viewportSize", 300);
        render();
        expect(scrollbar.viewportOffset).toBe(420);
        expect(find("following").layoutCoords[axis]).toBe(300);

        view.paramRuntime.setValue("contentSize", 350);
        render();
        expect(scrollbar.viewportOffset).toBe(0);
        expect(scrollbar.canScroll()).toBe(true);

        // Fitting content clears a scroll distance that is no longer reachable.
        view.paramRuntime.setValue("contentSize", 100);
        render();
        expect(scrollbar.viewportOffset).toBe(0);
        expect(find("content").layoutCoords[axis]).toBe(200);
        expect(scrollbar.canScroll()).toBe(false);

        view.paramRuntime.setValue("contentSize", 600);
        render();
        expect(scrollbar.viewportOffset).toBe(300);
        expect(find("following").layoutCoords[axis]).toBe(300);
    }
);

test("anchored flexible viewport preserves its constraints through container resizing", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: { values: [{}] },
            spacing: 0,
            vconcat: [
                {
                    name: "panel",
                    width: 100,
                    height: 600,
                    viewportHeight: {
                        grow: 1,
                        minPx: 100,
                        maxPx: 200,
                        anchor: "end",
                    },
                    mark: "point",
                },
                { name: "following", height: 20, mark: "point" },
            ],
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());

    for (const [containerHeight, viewportHeight] of [
        [400, 200],
        [170, 150],
        [70, 100],
    ]) {
        renderToLayout(view, Rectangle.create(0, 0, 400, containerHeight));
        expect(find(view, "following").layoutCoords.y).toBe(viewportHeight);
        expect(find(view, "panel").layoutCoords.y2).toBe(viewportHeight);
    }
});

test("end anchoring does not claim wheel input without overflow or at its edge", async () => {
    const { view, scrollbar, render } = await initialize("y", "end");
    const wheel = (/** @type {number} */ deltaY) =>
        scrollbar.getWheelScroll({
            type: "wheel",
            deltaX: 0,
            deltaY,
            deltaMode: 0,
            ctrlKey: false,
            preventDefault() {},
        });
    expect(wheel(20)).toBeUndefined();
    const scrollUp = wheel(-40);
    expect(scrollUp).toBeTypeOf("function");
    scrollUp();
    expect(scrollbar.viewportOffset).toBe(360);

    view.paramRuntime.setValue("contentSize", 100);
    render();
    expect(wheel(-40)).toBeUndefined();
    expect(wheel(40)).toBeUndefined();
});

test("pending interpolation cannot restore an offset from before a content resize", async () => {
    const { view, scrollbar, render } = await initialize("y", "end");
    const animator = view.context.animator;
    animator.transitionsEnabled = true;
    // Hold one real smoothing callback across the layout change.
    const transition = vi
        .spyOn(animator, "requestTransition")
        .mockImplementation(() => {});
    onTestFinished(() => {
        vi.restoreAllMocks();
    });
    scrollbar.interpolateViewportOffset({ x: 320 });
    const pending = transition.mock.calls[0][0];

    view.paramRuntime.setValue("contentSize", 800);
    render();
    expect(scrollbar.viewportOffset).toBe(600);
    pending(performance.now() + 1000);
    expect(scrollbar.viewportOffset).toBe(600);
});

test("nested viewports keep independent policies on both axes", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: { values: [{}] },
            spacing: 0,
            vconcat: [
                {
                    name: "outer",
                    width: 300,
                    height: 400,
                    viewportWidth: { px: 150, anchor: "end" },
                    viewportHeight: { px: 200, anchor: "end" },
                    vconcat: [
                        {
                            name: "inner",
                            width: 500,
                            height: 400,
                            viewportWidth: { px: 200, anchor: "end" },
                            mark: "point",
                        },
                    ],
                },
                { name: "following", height: 20, mark: "point" },
            ],
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());
    renderToLayout(view, Rectangle.create(0, 0, 400, 400));
    const outer = find(view, "outer");
    const inner = find(view, "inner");
    expect(outer.layoutCoords).toMatchObject({ x: -150, y: -200 });
    expect(inner.layoutCoords).toMatchObject({ x: -450, y: -200 });
    expect(find(view, "following").layoutCoords.y).toBe(200);

    const innerScrollbar = outer
        .getDescendants()
        .find((v) => v instanceof Scrollbar);
    expect(innerScrollbar).toBeInstanceOf(Scrollbar);
    /** @type {Scrollbar} */ (innerScrollbar).setViewportOffset(200, {
        syncSmoother: true,
    });
    renderToLayout(view, Rectangle.create(0, 0, 400, 400));
    expect(outer.layoutCoords.x).toBe(-150);
    expect(inner.layoutCoords.x).toBe(-350);
});

test("outer facet anchors newly loaded cells and keeps axes attached", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: { values: [{ group: "A", value: 0 }] },
            spacing: 0,
            vconcat: [
                {
                    name: "facets",
                    facet: {
                        row: { field: "group", header: null, title: null },
                    },
                    spacing: 0,
                    viewportHeight: { px: 50, anchor: "end" },
                    spec: {
                        name: "cell",
                        width: 100,
                        height: 30,
                        mark: "point",
                        encoding: {
                            y: {
                                field: "value",
                                type: "quantitative",
                                scale: { domain: [-1, 1], nice: false },
                                axis: { title: null },
                            },
                        },
                    },
                },
            ],
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());
    const render = () => renderToLayout(view, Rectangle.create(0, 0, 400, 400));
    render();
    const cell = find(view, "cell");
    expect(cell.facetCoords.get(["A"])).toMatchObject({ y: 20, height: 30 });

    /** @type {import("../../data/sources/inlineSource.js").default} */ (
        view.flowHandle.dataSource
    ).updateDynamicData(["A", "B", "C"].map((group) => ({ group, value: 0 })));
    render();
    const lastCell = cell.facetCoords.get(["C"]);
    expect(lastCell).toMatchObject({ y: 20, height: 30 });
    expect(
        /** @type {Scrollbar} */ (find(view, "scrollbar-vertical"))
            .viewportOffset
    ).toBe(40);
    expect(find(view, "axis_left").facetCoords.get(["C"])).toMatchObject({
        y: lastCell.y,
        height: lastCell.height,
    });
});

test("SVG clips anchored content to the viewport and preserves nested placement", async () => {
    const { view } = await initialize("y", "end", 100);
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 400,
        logicalHeight: 400,
    });
    expect(warnings).toEqual([]);
    const mark = svg.querySelector('[data-name="content"] [data-mark-type]');
    const circle = mark.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(Number(circle.getAttribute("cy"))).toBe(150);
    const clip = svg
        .querySelector(mark.getAttribute("clip-path").slice(4, -1))
        .querySelector("rect");
    expect(Number(clip.getAttribute("y"))).toBe(0);
    expect(Number(clip.getAttribute("height"))).toBe(200);
});
