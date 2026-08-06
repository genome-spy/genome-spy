// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import barAndLabelSpec from "../../../../examples/docs/grammar/composition/layer/bar-and-label-layer.json" with { type: "json" };
import linkShapesSpec from "../../../../examples/docs/grammar/mark/link/link-shapes-and-orientations.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
import { createHeadlessEngine } from "./headlessBootstrap.js";
import { createSvg } from "../svg/index.js";

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

    test("keeps data-dependent presentation attributes on mark elements", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.25, color: "#123456" },
                    { x: 0.75, color: "#abcdef" },
                ],
            },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                },
                y: { value: 0.5 },
                fill: { field: "color", type: "nominal", scale: null },
                fillOpacity: { value: 0.35 },
            },
        });

        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
        });
        const pointGroup = svg.querySelector('[data-mark-type="point"]');
        const circles = Array.from(pointGroup.querySelectorAll("circle"));

        expect(pointGroup.hasAttribute("fill")).toBe(false);
        expect(circles.map((circle) => circle.getAttribute("fill"))).toEqual([
            "#123456",
            "#abcdef",
        ]);
        expect(circles.every((circle) => !circle.hasAttribute("stroke"))).toBe(
            true
        );
        expect(pointGroup.getAttribute("stroke")).toBe("none");
        expect(pointGroup.getAttribute("fill-opacity")).toBe("0.35");
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
        const rects = Array.from(
            svg.querySelectorAll('[data-mark-type="rect"] rect')
        );
        const labels = Array.from(
            svg
                .querySelector('[data-view-name="Label"]')
                .querySelectorAll('[data-mark-type="text"] text')
        );
        // Rect coverage uses the band edges while point-like text uses its center.
        expect(rects.every((rect) => +rect.getAttribute("width") > 0)).toBe(
            true
        );
        expect(labels).toHaveLength(rects.length);
        const compactPixel = /^-?\d+(?:\.\d)?$/;
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            for (const attribute of ["x", "y", "width", "height"]) {
                expect(rect.getAttribute(attribute)).toMatch(compactPixel);
            }
            const expectedCenter =
                +rect.getAttribute("x") + +rect.getAttribute("width") / 2;
            expect(
                Math.abs(+labels[i].getAttribute("x") - expectedCenter)
            ).toBeLessThanOrEqual(0.1);
        }
        expect(textValues).toEqual(expect.arrayContaining(["28", "55", "91"]));
        expect(svg.querySelector('[data-view-name="Bar"]')).not.toBeNull();
        expect(svg.querySelector('[data-view-name="Label"]')).not.toBeNull();
        expect(svg.querySelector("style")).toBeNull();
        expect(svg.querySelector("image")).toBeNull();
    });

    test("exports all link shapes as native paths", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../spec/root.js").RootSpec} */ (
                structuredClone(linkShapesSpec)
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
            logicalWidth: 800,
            logicalHeight: 400,
        });
        const paths = svg.querySelectorAll('[data-mark-type="link"] path');

        expect(paths).toHaveLength(8);
        expect(
            Array.from(paths).every((path) =>
                /^M .* C /.test(path.getAttribute("d"))
            )
        ).toBe(true);
        expect(svg.querySelector("image")).toBeNull();
    });

    test("rejects link arc fading", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: "arc",
                arcFadingDistance: [10, 20],
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        });

        expect(() =>
            createSvg({
                viewRoot: view,
                logicalWidth: 200,
                logicalHeight: 100,
            })
        ).toThrow("SVG export does not support link arc fading yet");
    });
});
