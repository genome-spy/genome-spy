// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../view/layout/rectangle.js";
import { markViewAsChrome } from "../../view/viewSelectors.js";
import { formatSvgNumber, formatSvgUnitless } from "./svgNumber.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";

/**
 * @param {string} name
 * @param {string} path
 */
function createView(name, path) {
    return /** @type {import("../../view/view.js").default} */ (
        /** @type {unknown} */ ({
            name,
            getPathString: () => path,
        })
    );
}

describe("SvgViewRenderingContext", () => {
    test("rounds CSS-pixel values to one decimal place", () => {
        expect(formatSvgNumber(59.60439560439557)).toBe(59.6);
        expect(formatSvgNumber(86.43956043956044)).toBe(86.4);
        expect(formatSvgNumber(-0.01)).toBe(0);
    });

    test("retains extra precision for unitless values", () => {
        expect(formatSvgUnitless(0.7496)).toBe(0.75);
        expect(formatSvgUnitless(0.1234)).toBe(0.123);
        expect(formatSvgUnitless(-0.0001)).toBe(0);
    });

    test("creates a standalone document with nested view groups", () => {
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 320, height: 180, background: "white" }
        );
        const root = createView("root", "root");
        const child = createView("Copy number / points", "root/points");

        context.pushView(root, Rectangle.create(0, 0, 320, 180));
        context.pushView(child, Rectangle.create(20, 10, 280, 150));
        context.popView(child);
        context.popView(root);

        const svg = context.getSvg();
        expect(svg.getAttribute("viewBox")).toBe("0 0 320 180");
        expect(svg.querySelector("[data-export-background]")).not.toBeNull();
        expect(svg.querySelectorAll(":scope > g")).toHaveLength(1);
        expect(svg.querySelectorAll("g > g")).toHaveLength(1);
        expect(
            svg.querySelector('[data-view-path="root/points"] > title')
                ?.textContent
        ).toBe("root/points");
        expect(
            svg
                .querySelector('[data-view-path="root/points"]')
                ?.getAttribute("data-name")
        ).toBe("Copy number / points");
        expect(
            svg
                .querySelector('[data-view-path="root/points"]')
                ?.getAttribute("id")
        ).toBe("Copy-number-points-1");
        expect(svg.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    });

    test("omits scrollbar chrome without omitting other similarly named views", () => {
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );
        const root = createView("root", "root");
        const scrollbar = createView("scrollbar-vertical", "root/scrollbar");
        const authoredNamesake = createView(
            "scrollbar-horizontal",
            "root/authored-scrollbar"
        );
        const otherChrome = createView("axis", "root/axis");
        markViewAsChrome(scrollbar, { skipSubtree: true });
        markViewAsChrome(otherChrome, { skipSubtree: true });

        context.pushView(root, Rectangle.create(0, 0, 100, 100));
        context.pushView(scrollbar, Rectangle.create(90, 0, 10, 100));
        // A suppressed subtree must not leak marks into its visible parent.
        context.renderMark(/** @type {any} */ ({}), {});
        context.popView(scrollbar);
        context.pushView(authoredNamesake, Rectangle.create(0, 0, 100, 100));
        context.popView(authoredNamesake);
        context.pushView(otherChrome, Rectangle.create(0, 0, 100, 100));
        context.popView(otherChrome);
        context.popView(root);

        const svg = context.getSvg();
        expect(
            svg.querySelector('[data-name="scrollbar-horizontal"]')
        ).not.toBeNull();
        expect(
            svg.querySelector('[data-view-path="root/scrollbar"]')
        ).toBeNull();
        expect(svg.querySelector('[data-name="axis"]')).not.toBeNull();
    });

    test("deduplicates directional clip paths", () => {
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 320, height: 180 }
        );
        const clip = {
            rect: Rectangle.create(20, 10, 100, 50),
            clipX: true,
            clipY: false,
        };

        expect(context.getClipPathUrl(clip)).toBe("url(#clip-0)");
        expect(context.getClipPathUrl(clip)).toBe("url(#clip-0)");
        expect(
            context.getClipPathUrl({
                ...clip,
                rect: Rectangle.create(20.01, 10.01, 100.01, 50.01),
            })
        ).toBe("url(#clip-0)");

        const rect = context.getSvg().querySelector("clipPath rect");
        expect(rect?.getAttribute("x")).toBe("20");
        expect(rect?.getAttribute("y")).toBe("0");
        expect(rect?.getAttribute("width")).toBe("100");
        expect(rect?.getAttribute("height")).toBe("180");
        expect(context.getSvg().querySelectorAll("clipPath")).toHaveLength(1);
    });

    test("deduplicates filters and patterns at serialized precision", () => {
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        expect(
            context.getShadowFilterUrl({ blur: 10, offsetX: 2, offsetY: 3 })
        ).toBe(
            context.getShadowFilterUrl({
                blur: 10.01,
                offsetX: 2.01,
                offsetY: 3.01,
            })
        );
        const hatch = {
            type: "diagonal",
            fill: "white",
            fillOpacity: 0.75,
            stroke: "black",
            strokeOpacity: 0.5,
            strokeWidth: 2,
        };
        expect(context.getRectHatchPatternUrl(hatch)).toBe(
            context.getRectHatchPatternUrl({
                ...hatch,
                fillOpacity: 0.7501,
                strokeOpacity: 0.5001,
                strokeWidth: 2.0001,
            })
        );

        expect(context.getSvg().querySelectorAll("filter")).toHaveLength(1);
        expect(context.getSvg().querySelectorAll("pattern")).toHaveLength(1);
    });

    test("fails on an unbalanced view stack", () => {
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );
        const root = createView("root", "root");

        context.pushView(root, Rectangle.create(0, 0, 100, 100));

        expect(() => context.popView(createView("other", "other"))).toThrow(
            "Unbalanced SVG view rendering context stack"
        );
    });

    test("flattens repeated sample facets while retaining their shared clip", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "#123456" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        const renderFacets = () => {
            context.beginSampleFacetBatch();
            try {
                view.render(context, Rectangle.create(0, 0, 100, 100), {
                    sampleFacetRenderingOptions: {
                        locSize: { location: 20, size: 40 },
                        pixelToUnit: 0.01,
                    },
                    clip: {
                        rect: Rectangle.create(0, 10, 100, 80),
                        clipX: true,
                        clipY: true,
                    },
                });
                view.render(context, Rectangle.create(0, 0, 100, 100), {
                    sampleFacetRenderingOptions: {
                        locSize: { location: 60, size: 20 },
                        pixelToUnit: 0.01,
                    },
                    clip: {
                        rect: Rectangle.create(0, 10, 100, 80),
                        clipX: true,
                        clipY: true,
                    },
                });
            } finally {
                context.endSampleFacetBatch();
            }
        };

        context.beginInstanceCounting();
        renderFacets();
        context.endInstanceCounting();
        const mark = /** @type {import("../../view/unitView.js").default} */ (
            view
        ).mark;
        expect(context.getVisibleInstanceCount(mark)).toBe(2);
        expect(context.getSvg().querySelector("[data-mark-type]")).toBeNull();

        renderFacets();

        expect(
            Array.from(context.getSvg().querySelectorAll("circle"), (circle) =>
                circle.getAttribute("cy")
            )
        ).toEqual(["40", "70"]);
        expect(
            context.getSvg().querySelectorAll("g[data-view-path]")
        ).toHaveLength(1);
        expect(
            context.getSvg().querySelectorAll('[data-mark-type="point"]')
        ).toHaveLength(1);
        const clipRect = context.getSvg().querySelector("clipPath rect");
        expect([
            clipRect?.getAttribute("y"),
            clipRect?.getAttribute("height"),
        ]).toEqual(["10", "80"]);
    });

    test("keeps different sample-facet clips in separate mark groups", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "#123456" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        context.beginSampleFacetBatch();
        try {
            for (const y of [10, 20]) {
                view.render(context, Rectangle.create(0, 0, 100, 100), {
                    sampleFacetRenderingOptions: {
                        locSize: { location: y, size: 20 },
                        pixelToUnit: 0.01,
                    },
                    clip: {
                        rect: Rectangle.create(0, y, 100, 20),
                        clipX: true,
                        clipY: true,
                    },
                });
            }
        } finally {
            context.endSampleFacetBatch();
        }

        expect(
            context.getSvg().querySelectorAll("g[data-view-path]")
        ).toHaveLength(1);
        expect(
            context.getSvg().querySelectorAll('[data-mark-type="point"]')
        ).toHaveLength(2);
        expect(context.getSvg().querySelectorAll("clipPath")).toHaveLength(2);
    });

    test.each([
        [
            "combines adjacent dense layers",
            ["point", "rect", "text"],
            1,
            ["raster", "text"],
        ],
        [
            "keeps dense layers separated by a vector layer in separate runs",
            ["point", "text", "rect"],
            2,
            ["raster", "text", "raster"],
        ],
    ])("%s", async (_name, markTypes, expectedRunCount, expectedPaintOrder) => {
        const layer = markTypes.map((markType) => ({
            data: {
                values: markType == "text" ? [{ label: "vector" }] : [{}, {}],
            },
            mark: markType,
            encoding: {
                x: { value: 0.25 },
                x2: { value: 0.75 },
                y: { value: 0.25 },
                y2: { value: 0.75 },
                text: { field: "label" },
                fill: { value: "black" },
                color: { value: "black" },
            },
        }));
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ ({ layer })
        );
        const context = new SvgViewRenderingContext(
            { picking: false },
            {
                width: 100,
                height: 100,
                background: null,
                maxVectorInstances: 1,
            }
        );
        const coords = Rectangle.create(0, 0, 100, 100);

        context.beginInstanceCounting();
        view.render(context, coords);
        context.endInstanceCounting();
        view.render(context, coords);

        const runs = context.getRasterRuns();
        expect(runs).toHaveLength(expectedRunCount);
        expect(context.getSvg().querySelectorAll("image")).toHaveLength(
            expectedRunCount
        );
        expect(
            context.getSvg().querySelectorAll("text").length
        ).toBeGreaterThan(0);
        expect(context.getSvg().querySelector("circle")).toBeNull();
        expect(
            context.getSvg().querySelector('[data-mark-type="rect"]')
        ).toBeNull();
        expect(
            runs.flatMap((run) =>
                run.targets.map((target) => target.mark.getType())
            )
        ).toEqual(markTypes.filter((markType) => markType != "text"));
        expect(
            Array.from(
                context.getSvg().querySelectorAll("[data-rasterized], text"),
                (element) =>
                    element.hasAttribute("data-rasterized") ? "raster" : "text"
            )
        ).toEqual(expectedPaintOrder);
    });

    test("projects texture-indexed sample facets using CPU positions", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { facet: 0, x: 0.25 },
                    { facet: 1, x: 0.75 },
                ],
            },
            mark: "point",
            encoding: {
                facetIndex: { field: "facet" },
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "#123456" },
            },
        });
        const originalGetLayoutAncestors = view.getLayoutAncestors.bind(view);
        view.getLayoutAncestors = () => [
            ...originalGetLayoutAncestors(),
            /** @type {import("../../view/view.js").default} */ (
                /** @type {unknown} */ ({
                    /** @param {number} index */
                    getSampleFacetPosition: (index) =>
                        index == 0
                            ? { location: 0, size: 0.4 }
                            : { location: 0.6, size: 0.4 },
                })
            ),
        ];
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        view.render(context, Rectangle.create(0, 0, 100, 100));

        expect(
            Array.from(context.getSvg().querySelectorAll("circle"), (circle) =>
                circle.getAttribute("cy")
            )
        ).toEqual(["20", "80"]);
    });
});
