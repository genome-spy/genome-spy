// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

describe("SVG view backgrounds", () => {
    test("exports fill, shadow, and stroke decorations in view z-order", async () => {
        const { view } = await createHeadlessEngine(
            {
                name: "plot",
                view: {
                    fill: "#f0f4f8",
                    fillOpacity: 0.8,
                    shadowBlur: 10,
                    shadowColor: "#123456",
                    shadowOffsetX: 2,
                    shadowOffsetY: 3,
                    shadowOpacity: 0.4,
                    stroke: "#abcdef",
                    strokeOpacity: 0.6,
                    strokeWidth: 2,
                    strokeZindex: 10,
                },
                data: { values: [{ x: 0.5, y: 0.5 }] },
                mark: { type: "point", size: 20 },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 1] },
                        axis: null,
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 1] },
                        axis: null,
                    },
                    fill: { value: "black" },
                },
            },
            { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
        );

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 120,
            logicalHeight: 80,
            background: null,
        });
        const fillView = svg.querySelector('[data-view-name^="background"]');
        const fillMark = fillView?.querySelector('[data-mark-type="rect"]');
        const fill = fillMark?.querySelector(":scope > rect:not([filter])");
        const shadow = fillMark?.querySelector(":scope > [filter]");
        const strokeView = svg.querySelector(
            '[data-view-name^="backgroundStroke"]'
        );
        const plot = svg.querySelector('[data-view-name="plot"]');

        expect(fill).not.toBeNull();
        expect(fillMark?.getAttribute("fill")).toBe("#f0f4f8");
        expect(fillMark?.getAttribute("fill-opacity")).toBe("0.8");
        expect(shadow?.getAttribute("fill")).toBe("#123456");
        expect(shadow?.getAttribute("opacity")).toBe("0.4");
        expect(strokeView?.querySelectorAll("line")).toHaveLength(4);
        expect(
            strokeView
                ?.querySelector('[data-mark-type="rule"]')
                ?.getAttribute("stroke")
        ).toBe("#abcdef");
        expect(
            strokeView
                ?.querySelector('[data-mark-type="rule"]')
                ?.getAttribute("stroke-opacity")
        ).toBe("0.6");
        expect(
            fillView?.compareDocumentPosition(plot) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(
            plot?.compareDocumentPosition(strokeView) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(warnings).toEqual([]);
    });
});
