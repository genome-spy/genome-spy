// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG rectangle renderer", () => {
    test("uses padded index bandwidth for vertical and horizontal bars", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [{ index: 0 }, { index: 1 }],
            },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: {
                            field: "index",
                            type: "index",
                            scale: {
                                paddingInner: 0.2,
                                paddingOuter: 0.1,
                            },
                        },
                        y: { value: 0.2 },
                        y2: { value: 0.8 },
                        fill: { value: "#123456" },
                    },
                },
                {
                    mark: "rect",
                    encoding: {
                        x: { value: 0.2 },
                        x2: { value: 0.8 },
                        y: {
                            field: "index",
                            type: "index",
                            scale: {
                                paddingInner: 0.2,
                                paddingOuter: 0.1,
                            },
                        },
                        fill: { value: "#654321" },
                    },
                },
            ],
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const groups = Array.from(
            svg.querySelectorAll('[data-mark-type="rect"]')
        );
        const verticalBars = Array.from(groups[0].querySelectorAll("rect"));
        const horizontalBars = Array.from(groups[1].querySelectorAll("rect"));

        expect(verticalBars.map((rect) => rect.getAttribute("width"))).toEqual([
            "40",
            "40",
        ]);
        expect(
            horizontalBars.map((rect) => rect.getAttribute("height"))
        ).toEqual(["40", "40"]);
    });

    test("applies rect band coverage within padded index bandwidth", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ index: 0 }, { index: 1 }] },
            mark: "rect",
            encoding: {
                x: {
                    field: "index",
                    type: "index",
                    band: 0.5,
                    scale: {
                        paddingInner: 0.2,
                        paddingOuter: 0.1,
                    },
                },
                y: { value: 0.2 },
                y2: { value: 0.8 },
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

        expect([rect?.getAttribute("x"), rect?.getAttribute("width")]).toEqual([
            "15",
            "20",
        ]);
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

    test("exports rectangle shadows and hatches", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 5,
                hatch: "diagonal",
                stroke: "black",
                strokeWidth: 2,
                shadowBlur: 10,
                shadowColor: "#abcdef",
                shadowOffsetX: 2,
                shadowOffsetY: 3,
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

        const markGroup = svg.querySelector('[data-mark-type="rect"]');
        const shadowGroup = markGroup?.querySelector(":scope > g");
        const filter = svg.querySelector("filter");
        const pattern = svg.querySelector("pattern");

        expect(
            markGroup?.querySelector(":scope > rect")?.getAttribute("rx")
        ).toBe("5");
        expect(shadowGroup?.getAttribute("fill")).toBe("#abcdef");
        expect(shadowGroup?.getAttribute("opacity")).toBe("0.5");
        expect(shadowGroup?.getAttribute("filter")).toBe(
            `url(#${filter?.getAttribute("id")})`
        );
        expect(
            filter
                ?.querySelector("feGaussianBlur")
                ?.getAttribute("stdDeviation")
        ).toBe("4");
        expect(filter?.querySelector("feOffset")?.getAttribute("dx")).toBe("2");
        expect(filter?.querySelector("feOffset")?.getAttribute("dy")).toBe("3");
        expect(
            markGroup?.querySelector(":scope > rect")?.getAttribute("fill")
        ).toBe(`url(#${pattern?.getAttribute("id")})`);
        expect(pattern?.getAttribute("patternUnits")).toBe("userSpaceOnUse");
        expect(warnings).toEqual([]);
    });

    test("deduplicates screen-aligned hatch patterns", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.1, x2: 0.4 },
                    { x: 0.6, x2: 0.9 },
                ],
            },
            mark: {
                type: "rect",
                hatch: "diagonal",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "#123456" },
                fillOpacity: { value: 0.5 },
                stroke: { value: "#abcdef" },
                strokeOpacity: { value: 0.75 },
                strokeWidth: { value: 2 },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const pattern = svg.querySelector("pattern");
        const rects = Array.from(
            svg.querySelectorAll('[data-mark-type="rect"] > rect')
        );

        expect(svg.querySelectorAll("pattern")).toHaveLength(1);
        expect(pattern?.getAttribute("width")).toBe("12");
        expect(pattern?.querySelector("rect")?.getAttribute("fill")).toBe(
            "#123456"
        );
        expect(
            pattern?.querySelector("rect")?.getAttribute("fill-opacity")
        ).toBe("0.5");
        expect(pattern?.querySelector("g")?.getAttribute("stroke")).toBe(
            "#abcdef"
        );
        expect(
            pattern?.querySelector("g")?.getAttribute("stroke-opacity")
        ).toBe("0.8");
        expect(
            new Set(rects.map((rect) => rect.getAttribute("fill"))).size
        ).toBe(1);
        expect(
            rects.every((rect) => rect.getAttribute("fill-opacity") == "1")
        ).toBe(true);
        expect(warnings).toEqual([]);
    });

    test("resolves expression-valued hatch properties", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "hatch", value: "ringsLarge" },
                { name: "hatchWidth", value: 2 },
            ],
            data: { values: [{}] },
            mark: {
                type: "rect",
                hatch: { expr: "hatch" },
                stroke: "black",
                strokeWidth: { expr: "hatchWidth" },
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "white" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(svg.querySelectorAll("pattern circle")).toHaveLength(4);
        expect(svg.querySelector("pattern circle")?.getAttribute("r")).toBe(
            "4.9"
        );
        expect(warnings).toEqual([]);
    });
});
