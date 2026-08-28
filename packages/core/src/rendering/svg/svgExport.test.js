// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { RasterizationUnavailableError } from "../rasterization.js";
import { analyzeSvgExport, createSvg, createSvgExport } from "./index.js";

const { rasterizeSvgRuns } = vi.hoisted(() => ({
    rasterizeSvgRuns: vi.fn(
        (
            /** @type {{runs: import("./svgViewRenderingContext.js").SvgRasterRun[]}} */ options
        ) => {
            for (const run of options.runs) {
                const image = /** @type {SVGImageElement} */ (run.image);
                image.setAttribute("href", "data:image/png;base64,stub");
            }
        }
    ),
}));

describe("SVG export", () => {
    test("analyzes visible layers without emitting mark elements", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ ({
                layer: [
                    {
                        name: "points",
                        title: "Point observations",
                        data: { values: [{}, {}] },
                        mark: "point",
                        encoding: {
                            x: { value: 0.5 },
                            y: { value: 0.5 },
                            size: { value: 100 },
                            fill: { value: "black" },
                        },
                    },
                    {
                        name: "empty-points",
                        data: { values: [] },
                        mark: "point",
                        encoding: {
                            x: { value: 0.5 },
                            y: { value: 0.5 },
                            size: { value: 100 },
                            fill: { value: "black" },
                        },
                    },
                ],
            })
        );

        const analysis = analyzeSvgExport({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
        });

        const pointLayer = analysis.layers.find(
            (layer) => layer.viewName == "points"
        );
        expect(pointLayer).toEqual(
            expect.objectContaining({
                viewName: "points",
                viewTitle: "Point observations",
                markType: "point",
                instanceCount: 2,
            })
        );
        expect(pointLayer.viewPath).toContain("points");
        expect(analysis.layers).not.toContainEqual(
            expect.objectContaining({ viewName: "empty-points" })
        );
    });

    test("falls back to vectors when no rasterizer is available", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}, {}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });

        const { svg, warnings, rasterized } = await createSvgExport({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
            rasterization: { maxVectorInstances: 1 },
        });

        expect(svg.querySelectorAll("circle")).toHaveLength(2);
        expect(svg.querySelector("image")).toBeNull();
        expect(warnings).toContainEqual(
            expect.stringContaining("no raster rendering backend")
        );
        expect(rasterized).toEqual([]);
    });

    test("falls back to vectors when rasterizer initialization is unavailable", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}, {}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });

        const result = await createSvgExport({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            rasterization: { maxVectorInstances: 1 },
            rasterizeSvgRuns: () => {
                throw new RasterizationUnavailableError("No Canvas2D");
            },
        });

        expect(result.svg.querySelectorAll("circle")).toHaveLength(2);
        expect(result.svg.querySelector("image")).toBeNull();
        expect(result.warnings).toHaveLength(1);
        expect(result.rasterized).toEqual([]);
    });

    test("rasterizes adjacent over-threshold layers as one run", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ ({
                layer: ["point", "rect"].map((mark) => ({
                    data: { values: [{}, {}] },
                    mark,
                    encoding: {
                        x: { value: 0.25 },
                        x2: { value: 0.75 },
                        y: { value: 0.25 },
                        y2: { value: 0.75 },
                        fill: { value: "black" },
                    },
                })),
            })
        );

        const result = await createSvgExport({
            viewRoot: view,
            rasterizeSvgRuns,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
            rasterization: { maxVectorInstances: 1, pixelRatio: 3 },
        });

        expect(result.svg.querySelectorAll("image")).toHaveLength(1);
        expect(result.svg.querySelector("image").getAttribute("href")).toBe(
            "data:image/png;base64,stub"
        );
        expect(result.rasterized).toEqual([
            {
                targets: [
                    { markType: "point", instanceCount: 2 },
                    { markType: "rect", instanceCount: 2 },
                ],
                reason: "instance-threshold",
                maxVectorInstances: 1,
                pixelRatio: 3,
            },
        ]);
        expect(rasterizeSvgRuns).toHaveBeenCalledOnce();
    });

    test("propagates errors after raster rendering starts", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}, {}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });
        const failure = new Error("paint failed");

        await expect(
            createSvgExport({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                rasterization: { maxVectorInstances: 1 },
                rasterizeSvgRuns: () => {
                    throw failure;
                },
            })
        ).rejects.toBe(failure);
    });

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
        expect(textGroup?.getAttribute("font-family")).toBe(
            "'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
        );
        expect(textGroup?.getAttribute("font-size")).toBe("12");
        expect(Number(text?.getAttribute("textLength"))).toBeGreaterThan(0);
        expect(text?.getAttribute("dx")).toBe("3");
        expect(text?.getAttribute("dy")).toBe("2.2");
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

        expect(rect?.getAttribute("x")).toBe("19.9");
        expect(Number(rect?.getAttribute("y"))).toBeCloseTo(29.9);
        expect(rect?.getAttribute("width")).toBe("60.2");
        expect(rect?.getAttribute("height")).toBe("50.2");
        expect(rect?.hasAttribute("fill")).toBe(false);
        expect(rectGroup?.getAttribute("fill")).toBe("#abcdef");
        expect(circle?.getAttribute("cx")).toBe("104");
        expect(circle?.getAttribute("cy")).toBe("53");
        expect(circle?.getAttribute("r")).toBe("5");
        expect(circle?.hasAttribute("fill")).toBe(false);
        expect(pointGroup?.getAttribute("fill")).toBe("#fedcba");
    });
});
