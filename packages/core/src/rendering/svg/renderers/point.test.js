// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createSvg } from "../index.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";

describe("SVG point renderer", () => {
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

    test("preserves legacy point displacement", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: { type: "point", dx: 7, dy: 11 },
            encoding: {
                x: { value: 0.25 },
                y: { value: 0.75 },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
        });
        const circle = svg.querySelector('[data-mark-type="point"] circle');

        expect(circle?.getAttribute("cx")).toBe("32");
        expect(circle?.getAttribute("cy")).toBe("14");
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

    test("anchor-culls unclipped points in the configured direction", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.5, y: 0.9 },
                    { x: 0.1, y: 0.5 },
                    { x: 0.5, y: 0.1 },
                ],
            },
            mark: {
                type: "point",
                clip: "never",
                cullByVisibleRange: "y",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { field: "y", type: "quantitative", scale: null },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        view.arrange(context, Rectangle.create(0, 0, 100, 100), {
            clip: {
                rect: Rectangle.create(25, 25, 50, 50),
                clipX: true,
                clipY: true,
            },
        });

        const circles = context
            .getSvg()
            .querySelectorAll('[data-mark-type="point"] circle');
        expect(circles).toHaveLength(1);
        expect(circles[0].getAttribute("cx")).toBe("10");
        expect(circles[0].getAttribute("cy")).toBe("50");
    });

    test("keeps inward strokes within the encoded point diameter", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.2, shape: "circle", size: 400, strokeWidth: 4 },
                    { x: 0.5, shape: "circle", size: 100, strokeWidth: 8 },
                    { x: 0.8, shape: "x", size: 400, strokeWidth: 8 },
                    { x: 0.9, shape: "circle", size: 0, strokeWidth: 8 },
                ],
            },
            mark: {
                type: "point",
                inwardStroke: { expr: "true" },
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                shape: { field: "shape", type: "nominal", scale: null },
                size: { field: "size", type: "quantitative", scale: null },
                fill: { value: "#abcdef" },
                stroke: { value: "#123456" },
                strokeWidth: {
                    field: "strokeWidth",
                    type: "quantitative",
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
        const pointGroup = svg.querySelector('[data-mark-type="point"]');
        const circles = Array.from(pointGroup.querySelectorAll("circle"));
        const line = pointGroup.querySelector("path");

        expect(pointGroup.children).toHaveLength(3);
        expect(
            circles.map((circle) => [
                circle.getAttribute("r"),
                circle.getAttribute("stroke-width"),
            ])
        ).toEqual([
            ["8", "4"],
            ["2.5", "5"],
        ]);
        expect(line?.getAttribute("d")).toBe("M 70 40 L 90 60 M 90 40 L 70 60");
        expect(line?.getAttribute("stroke-width")).toBe("8");
        expect(warnings).toEqual([]);
    });

    test("reports resolved unsupported properties separately", async () => {
        // The deprecated property is intentional; assert its diagnostic without printing it.
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        const { view } = await createHeadlessEngine({
            params: [{ name: "gradient", value: 0.25 }],
            data: { values: [{}] },
            mark: {
                type: "point",
                fillGradientStrength: { expr: "gradient" },
                geometricZoomBound: 2,
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                fill: { value: "black" },
            },
        });

        expect(warn).toHaveBeenCalledWith(
            'geometricZoomBound is deprecated. Use something like the following instead: "size": { "expr": "min(0.5 * pow(zoomLevel, 2), 200)" }.'
        );
        warn.mockRestore();
        const { warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("fillGradientStrength");
        expect(warnings[1]).toContain("geometricZoomBound");
    });

    test("does not warn for a disabled expression-valued gradient", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "gradient", value: 0 }],
            data: { values: [{}] },
            mark: {
                type: "point",
                fillGradientStrength: { expr: "gradient" },
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                fill: { value: "black" },
            },
        });

        const { warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(warnings).toEqual([]);
    });
});
