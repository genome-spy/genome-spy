// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import Rectangle from "../layout/rectangle.js";
import { formatSvgNumber } from "./svgNumber.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";

/**
 * @param {string} name
 * @param {string} path
 */
function createView(name, path) {
    return /** @type {import("../view.js").default} */ (
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
});
