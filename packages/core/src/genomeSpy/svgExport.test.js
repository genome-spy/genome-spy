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

    test("expands short rules to their expression-valued minimum length", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "minimum", value: 10 }],
            data: { values: [{}] },
            mark: {
                type: "rule",
                minLength: { expr: "minimum" },
                strokeCap: "square",
            },
            encoding: {
                x: { value: 0.49 },
                x2: { value: 0.51 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
                size: { value: 2 },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const line = svg.querySelector('[data-mark-type="rule"] line');

        expect(line?.getAttribute("x1")).toBe("45");
        expect(line?.getAttribute("x2")).toBe("55");
        expect(line?.getAttribute("y1")).toBe("50");
        expect(line?.getAttribute("y2")).toBe("50");
    });

    test("positions and squeezes text inside an encoded range", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "A fitted label" }] },
            mark: {
                type: "text",
                size: 20,
                paddingX: 2,
                squeeze: true,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const text = svg.querySelector('[data-mark-type="text"] text');

        expect(text?.getAttribute("x")).toBe("60");
        expect(+text?.getAttribute("font-size")).toBeLessThan(20);
        expect(+text?.getAttribute("textLength")).toBeLessThanOrEqual(40);
        expect(warnings).toEqual([]);
    });

    test("fits text to discrete scale bands", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { category: "A", label: "Alpha" },
                    { category: "B", label: "Beta" },
                ],
            },
            mark: { type: "text", fitToBand: true, size: 12 },
            encoding: {
                x: { field: "category", type: "nominal" },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const labels = Array.from(
            svg.querySelectorAll('[data-mark-type="text"] text')
        );

        expect(labels).toHaveLength(2);
        expect(labels.map((label) => label.getAttribute("x"))).toEqual([
            "50",
            "150",
        ]);
        expect(warnings).toEqual([]);
    });

    test("exports ranged chromosome labels on a locus axis", async () => {
        const { view } = await createHeadlessEngine(
            {
                assembly: "hg38",
                data: { values: [] },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        axis: { chromLabels: true },
                    },
                },
            },
            {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            }
        );

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 160,
        });
        const chromosomeLabels = Array.from(
            svg.querySelectorAll('[data-view-name="chromosome_labels"] text')
        );

        expect(
            chromosomeLabels.slice(0, 2).map((element) => element.textContent)
        ).toEqual(["chr1", "chr2"]);
        expect(chromosomeLabels[0].getAttribute("x")).toBe("4");
        expect(+chromosomeLabels[1].getAttribute("x")).toBeGreaterThan(
            +chromosomeLabels[0].getAttribute("x")
        );
        expect(warnings.join(" ")).toContain("viewport-edge fading");
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

    test("exports expression-valued uniform rectangle radii", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "radius", value: 12 }],
            data: { values: [{}] },
            mark: { type: "rect", cornerRadius: { expr: "radius" } },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');

        expect(rect?.getAttribute("rx")).toBe("12");
        expect(rect?.getAttribute("ry")).toBe("12");
        expect(warnings).toEqual([]);
    });

    test("exports independently rounded and clamped rectangle corners", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 2,
                cornerRadiusTopLeft: 50,
                cornerRadiusTopRight: 4,
                cornerRadiusBottomRight: 6,
                cornerRadiusBottomLeft: 8,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.6 },
                y: { value: 0.2 },
                y2: { value: 0.4 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const path = svg.querySelector('[data-mark-type="rect"] path');

        expect(path?.getAttribute("d")).toBe(
            "M 30 60 H 56 A 4 4 0 0 1 60 64 V 74 " +
                "A 6 6 0 0 1 54 80 H 28 A 8 8 0 0 1 20 72 V 70 " +
                "A 10 10 0 0 1 30 60 Z"
        );
        expect(warnings).toEqual([]);
    });

    test("preserves minimum rectangle size and opacity compensation", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                minWidth: 5,
                minHeight: 4,
                minOpacity: 0.5,
            },
            encoding: {
                x: { value: 0.5 },
                x2: { value: 0.51 },
                y: { value: 0.5 },
                y2: { value: 0.52 },
                fill: { value: "#123456" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');

        expect(rect?.getAttribute("x")).toBe("48");
        expect(rect?.getAttribute("y")).toBe("47");
        expect(rect?.getAttribute("width")).toBe("5");
        expect(rect?.getAttribute("height")).toBe("4");
        expect(rect?.getAttribute("opacity")).toBe("0.5");
    });

    test("warns about rectangle effects without preventing export", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 5,
                hatch: "diagonal",
                shadowOpacity: 0.5,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            svg
                .querySelector('[data-mark-type="rect"] rect')
                ?.getAttribute("rx")
        ).toBe("5");
        expect(warnings).toHaveLength(2);
        expect(warnings.join(" ")).toContain("rectangle hatch");
        expect(warnings.join(" ")).toContain("rectangle shadow");
    });

    test("exports every point shape with encoded rotation", async () => {
        const shapes = [
            "circle",
            "square",
            "cross",
            "diamond",
            "triangle-up",
            "triangle-right",
            "triangle-down",
            "triangle-left",
            "tick-up",
            "tick-right",
            "tick-down",
            "tick-left",
            "x",
            "+",
        ];
        const { view } = await createHeadlessEngine({
            data: {
                values: shapes.map((shape, index) => ({
                    shape,
                    x: (index + 1) / (shapes.length + 1),
                    angle: 15,
                })),
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                shape: { field: "shape", type: "nominal", scale: null },
                angle: { field: "angle", type: "quantitative", scale: null },
                size: { value: 400 },
                fill: { value: "#123456" },
                stroke: { value: "#654321" },
                strokeWidth: { value: 2 },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 300,
            logicalHeight: 100,
            background: null,
        });
        const pointGroup = svg.querySelector('[data-mark-type="point"]');
        const symbols = Array.from(pointGroup.children);

        expect(symbols).toHaveLength(shapes.length);
        expect(symbols.map((symbol) => symbol.tagName)).toEqual([
            "circle",
            "rect",
            ...Array(12).fill("path"),
        ]);
        expect(
            symbols.every((symbol) =>
                symbol.getAttribute("transform")?.startsWith("rotate(15 ")
            )
        ).toBe(true);
        for (const symbol of symbols.slice(-2)) {
            expect(symbol.getAttribute("fill")).toBe("none");
            expect(symbol.getAttribute("stroke")).toBe("#654321");
            expect(symbol.getAttribute("stroke-width")).toBe("2");
        }
        expect(warnings).toEqual([]);
    });

    test("uses fill color as the stroke of line-only point shapes", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "point",
                shape: "+",
                fill: "#123456",
                stroke: null,
                strokeWidth: 4,
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 400 },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const symbol = svg.querySelector('[data-mark-type="point"] path');

        expect(symbol?.getAttribute("fill")).toBe("none");
        expect(symbol?.getAttribute("stroke")).toBe("#123456");
        expect(symbol?.getAttribute("stroke-width")).toBe("4");
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

        const { svg } = createSvg({
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

        const { svg } = createSvg({
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

        const { svg } = createSvg({
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

        const { svg } = createSvg({
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

    test("resolves expression-valued link properties", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: { expr: "'line'" },
                orient: { expr: "'horizontal'" },
                arcHeightFactor: { expr: "2" },
                minArcHeight: { expr: "3" },
                maxChordLength: { expr: "100" },
                clampApex: { expr: "true" },
                arcFadingDistance: { expr: "false" },
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const path = svg.querySelector('[data-mark-type="link"] path');

        expect(path?.getAttribute("d")).toBe("M 40 50 C 100 50 100 50 160 50");
        expect(warnings).toEqual([]);
    });

    test("exports basic forward and reverse arrows as paths", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { y: 0.3, direction: "forward" },
                    { y: 0.7, direction: "reverse" },
                ],
            },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 2,
                fill: "#5b8def",
                stroke: "black",
                strokeWidth: 1,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { field: "y", type: "quantitative", scale: null },
                direction: {
                    field: "direction",
                    type: "nominal",
                    scale: null,
                },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const arrows = Array.from(
            svg.querySelectorAll(
                '[data-mark-type="arrow"] [data-arrow-part="body"]'
            )
        );

        expect(arrows).toHaveLength(2);
        expect(arrows[0].getAttribute("d")).toContain("80 70");
        expect(arrows[1].getAttribute("d")).toContain("20 30");
        expect(warnings).toEqual([]);
    });

    test("exports an open arrowhead without a stem", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                headShape: "open",
                stem: false,
                size: 4,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            svg.querySelectorAll('[data-mark-type="arrow"] [data-arrow-part]')
        ).toHaveLength(1);
        expect(svg.querySelector('[data-arrow-part="head"]')).not.toBeNull();
        expect(warnings).toEqual([]);
    });

    test("exports diagonal arrow geometry", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0.2, y: 0.2, x2: 0.8, y2: 0.8 }] },
            mark: {
                type: "arrow",
                size: 8,
                fill: "#5b8def",
                stroke: "black",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { field: "y", type: "quantitative", scale: null },
                y2: { field: "y2" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const body = svg.querySelector('[data-arrow-part="body"]');

        expect(body?.getAttribute("d")).toContain("80 20");
    });

    test("exports arrow start and head notches", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ y: 0.35 }, { y: 0.65 }] },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 3,
                headAngle: 45,
                headNotchAngle: 60,
                startNotch: true,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { field: "y", type: "quantitative", scale: null },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const bodies = Array.from(
            svg.querySelectorAll('[data-arrow-part="body"]')
        );

        // The start notch is five pixels deep for a 45-degree, 10-pixel stem.
        expect(bodies[0].getAttribute("d")).toContain("25 65");
        expect(warnings).toEqual([]);
    });

    test("exports notched standalone heads and short-arrow blunting", async () => {
        const { view: notchedView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                stem: false,
                size: 10,
                headWidth: 3,
                headAngle: 45,
                headNotchAngle: 60,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });
        const { svg: notchedSvg } = createSvg({
            viewRoot: notchedView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            notchedSvg
                .querySelector('[data-arrow-part="body"]')
                ?.getAttribute("d")
        ).toContain("73.7 50");

        const { view: shortView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 3,
                headAngle: 45,
                minStemLength: 15,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.4 },
                x2: { value: 0.6 },
                y: { value: 0.5 },
            },
        });
        const { svg: shortSvg, warnings } = createSvg({
            viewRoot: shortView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        // The configured 15-pixel head is blunted to preserve 15 pixels of stem.
        expect(
            shortSvg
                .querySelector('[data-arrow-part="body"]')
                ?.getAttribute("d")
        ).toContain("55 65");
        expect(warnings).toEqual([]);
    });

    test("warns and exports when a property is unsupported", async () => {
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

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
        });

        expect(
            svg.querySelector('[data-mark-type="link"] path')
        ).not.toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("ignored unsupported link arc fading");
        expect(warnings[0]).toContain("View:");
    });
});
