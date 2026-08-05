// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "./headlessBootstrap.js";
import { createSvg } from "./svgExport.js";

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

        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const line = svg.querySelector("line");
        const text = svg.querySelector("text");

        expect(line?.getAttribute("x1")).toBe("40");
        expect(line?.getAttribute("x2")).toBe("160");
        expect(line?.getAttribute("y1")).toBe("75");
        expect(line?.getAttribute("stroke")).toBe("#123456");
        expect(line?.getAttribute("stroke-dasharray")).toBe("2 3");
        expect(text?.getAttribute("x")).toBe("160");
        expect(text?.getAttribute("font-family")).toBe("sans-serif");
        expect(text?.getAttribute("font-size")).toBe("12");
        expect(Number(text?.getAttribute("textLength"))).toBeGreaterThan(0);
        expect(text?.getAttribute("dx")).toBe("3");
        expect(text?.getAttribute("dy")).toBe("-2");
        expect(text?.hasAttribute("transform")).toBe(false);
        expect(svg.querySelectorAll('[data-mark-type="rule"]')).toHaveLength(1);
        expect(svg.querySelectorAll('[data-mark-type="text"]')).toHaveLength(1);
    });
});
