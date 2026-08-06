// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

describe("SVG export", () => {
    test("emits scaled rule and plain text elements", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [{ start: 2, end: 8, y: 0.25, label: "Range" }],
            },
            layer: [
                {
                    mark: {
                        type: "rule",
                        strokeCap: "square",
                        strokeDash: [2, 3],
                    },
                    encoding: {
                        x: {
                            field: "start",
                            type: "quantitative",
                            scale: { domain: [0, 10] },
                        },
                        x2: { field: "end" },
                        y: {
                            field: "y",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                        },
                        y2: { field: "y" },
                        color: { value: "#123456" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: { type: "text", dx: 3, dy: -2 },
                    encoding: {
                        x: {
                            field: "end",
                            type: "quantitative",
                            scale: { domain: [0, 10] },
                        },
                        y: {
                            field: "y",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                        },
                        text: { field: "label" },
                        size: { value: 12 },
                        color: { value: "#654321" },
                    },
                },
            ],
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const line = svg.querySelector("line");
        const text = svg.querySelector("text");
        const ruleGroup = line.closest('[data-mark-type="rule"]');
        const textGroup = text.closest('[data-mark-type="text"]');

        expect(line?.getAttribute("x1")).toBe("40");
        expect(line?.getAttribute("x2")).toBe("160");
        expect(line?.getAttribute("y1")).toBe("75");
        expect(line?.hasAttribute("stroke")).toBe(false);
        expect(ruleGroup?.getAttribute("stroke")).toBe("#123456");
        expect(ruleGroup?.getAttribute("stroke-dasharray")).toBe("2 3");
        expect(text?.getAttribute("x")).toBe("160");
        expect(text?.hasAttribute("font-family")).toBe(false);
        expect(textGroup?.getAttribute("font-family")).toBe("sans-serif");
        expect(textGroup?.getAttribute("font-size")).toBe("12");
        expect(Number(text?.getAttribute("textLength"))).toBeGreaterThan(0);
        expect(text?.getAttribute("dx")).toBe("3");
        expect(text?.getAttribute("dy")).toBe("-2");
        expect(text?.hasAttribute("transform")).toBe(false);
        expect(svg.querySelectorAll('[data-mark-type="rule"]')).toHaveLength(1);
        expect(svg.querySelectorAll('[data-mark-type="text"]')).toHaveLength(1);
        expect(warnings).toEqual([]);
    });

    test("emits circle points and axis-aligned rectangles", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0.5, y: 0.5 }] },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: { value: 0.1 },
                        x2: { value: 0.4 },
                        y: { value: 0.2 },
                        y2: { value: 0.7 },
                        fill: { value: "#abcdef" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                        },
                        y: {
                            field: "y",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                        },
                        xOffset: { value: 4 },
                        yOffset: { value: 3 },
                        size: { value: 100 },
                        fill: { value: "#fedcba" },
                    },
                },
            ],
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');
        const circle = svg.querySelector("circle");
        const rectGroup = rect.closest('[data-mark-type="rect"]');
        const pointGroup = circle.closest('[data-mark-type="point"]');

        expect(rect?.getAttribute("x")).toBe("20");
        expect(Number(rect?.getAttribute("y"))).toBeCloseTo(30);
        expect(rect?.getAttribute("width")).toBe("60");
        expect(rect?.getAttribute("height")).toBe("50");
        expect(rect?.hasAttribute("fill")).toBe(false);
        expect(rectGroup?.getAttribute("fill")).toBe("#abcdef");
        expect(circle?.getAttribute("cx")).toBe("104");
        expect(circle?.getAttribute("cy")).toBe("53");
        expect(circle?.getAttribute("r")).toBe("5");
        expect(circle?.hasAttribute("fill")).toBe(false);
        expect(pointGroup?.getAttribute("fill")).toBe("#fedcba");
    });
});
