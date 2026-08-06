// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Rectangle from "../view/layout/rectangle.js";
import { formatSvgNumber, formatSvgUnitless } from "./svgNumber.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";

/**
 * @param {string} name
 * @param {string} path
 */
function createView(name, path) {
    return /** @type {import("../view/view.js").default} */ (
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
        const child = createView("points", "root/points");

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
        expect(context.serialize()).toContain(
            'xmlns="http://www.w3.org/2000/svg"'
        );
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

        const rect = context.getSvg().querySelector("clipPath rect");
        expect(rect?.getAttribute("x")).toBe("20");
        expect(rect?.getAttribute("y")).toBe("0");
        expect(rect?.getAttribute("width")).toBe("100");
        expect(rect?.getAttribute("height")).toBe("180");
        expect(context.getSvg().querySelectorAll("clipPath")).toHaveLength(1);
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

    test("projects sample facets while retaining the shared view clip", async () => {
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

        expect(
            context.getSvg().querySelector("circle")?.getAttribute("cy")
        ).toBe("40");
        const clipRect = context.getSvg().querySelector("clipPath rect");
        expect([
            clipRect?.getAttribute("y"),
            clipRect?.getAttribute("height"),
        ]).toEqual(["10", "80"]);
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
            /** @type {import("../view/view.js").default} */ (
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
