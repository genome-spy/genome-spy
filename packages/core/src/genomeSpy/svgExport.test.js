// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import barAndLabelSpec from "../../../../examples/docs/grammar/composition/layer/bar-and-label-layer.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
import { createHeadlessEngine } from "./headlessBootstrap.js";
import { createSvg } from "./svgExport.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

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

        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');
        const circle = svg.querySelector("circle");

        expect(rect?.getAttribute("x")).toBe("20");
        expect(Number(rect?.getAttribute("y"))).toBeCloseTo(30);
        expect(rect?.getAttribute("width")).toBe("60");
        expect(rect?.getAttribute("height")).toBe("50");
        expect(rect?.getAttribute("fill")).toBe("#abcdef");
        expect(circle?.getAttribute("cx")).toBe("104");
        expect(circle?.getAttribute("cy")).toBe("53");
        expect(circle?.getAttribute("r")).toBe("5");
        expect(circle?.getAttribute("fill")).toBe("#fedcba");
    });

    test("exports a titled point plot with generated axes", async () => {
        const { view } = await createHeadlessEngine(
            {
                config: {
                    mark: { color: "black" },
                    title: { color: "black", subtitleColor: "gray" },
                },
                title: {
                    text: "Point plot",
                    subtitle: "SVG proof of concept",
                    anchor: "start",
                },
                data: {
                    values: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
            {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            }
        );

        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 320,
            logicalHeight: 200,
        });
        const textValues = Array.from(svg.querySelectorAll("text"), (element) =>
            element.textContent.trim()
        );

        expect(svg.querySelectorAll("circle")).toHaveLength(2);
        expect(svg.querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
        expect(textValues).toContain("Point plot");
        expect(textValues).toContain("SVG proof of concept");
        expect(svg.querySelector("image")).toBeNull();
    });

    test("exports the layered bar-and-label example as editable elements", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../spec/root.js").RootSpec} */ (
                structuredClone(barAndLabelSpec)
            ),
            {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            }
        );

        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 320,
            logicalHeight: 200,
        });
        const textValues = Array.from(svg.querySelectorAll("text"), (element) =>
            element.textContent.trim()
        );

        expect(
            svg.querySelectorAll('[data-mark-type="rect"] rect')
        ).toHaveLength(9);
        expect(textValues).toEqual(expect.arrayContaining(["28", "55", "91"]));
        expect(svg.querySelector('[data-view-name="Bar"]')).not.toBeNull();
        expect(svg.querySelector('[data-view-name="Label"]')).not.toBeNull();
        expect(svg.querySelector("image")).toBeNull();
    });
});
