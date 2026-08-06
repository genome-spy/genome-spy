// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../view/layout/rectangle.js";
import { createSvg } from "../index.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";

describe("SVG text renderer", () => {
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

    test("stretches sequence-logo letters into encoded rectangles", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "A" }] },
            mark: {
                type: "text",
                logoLetters: true,
                size: 100,
                dx: 2,
                dy: -3,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                text: { field: "base" },
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

        expect(text?.textContent).toBe("A");
        expect(text?.getAttribute("font-size")).toBe("1");
        expect(text?.getAttribute("text-anchor")).toBe("middle");
        expect(text?.getAttribute("dominant-baseline")).toBe("central");
        expect(text?.getAttribute("transform")).toBe(
            "translate(60 50) translate(2 -3) scale(40 77.7)"
        );
        expect(warnings).toEqual([]);
    });

    test("uses fit-to-band bounds for sequence-logo letters", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { category: "A", base: "A" },
                    { category: "B", base: "C" },
                ],
            },
            mark: {
                type: "text",
                logoLetters: true,
                fitToBand: true,
                size: 100,
            },
            encoding: {
                x: { field: "category", type: "nominal" },
                y: { value: 0.25 },
                y2: { value: 0.75 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });

        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="text"] text'),
                (text) => text.getAttribute("transform")
            )
        ).toEqual([
            "translate(50 50) scale(100 64.8)",
            "translate(150 50) scale(100 62.9)",
        ]);
        expect(warnings).toEqual([]);
    });

    test("preserves the direction of reversed logo-letter ranges", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "T" }] },
            mark: { type: "text", logoLetters: true, size: 100 },
            encoding: {
                x: { value: 0.8 },
                x2: { value: 0.2 },
                y: { value: 0.8 },
                y2: { value: 0.2 },
                text: { field: "base" },
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

        expect(text?.getAttribute("transform")).toBe(
            "translate(100 50) scale(-120 -77.7)"
        );
        expect(warnings).toEqual([]);
    });

    test("projects sequence-logo ranges into SampleView facets", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "G" }] },
            mark: { type: "text", logoLetters: true, size: 100 },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.25 },
                y2: { value: 0.75 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 200, height: 100 }
        );

        view.render(context, Rectangle.create(0, 0, 200, 100), {
            sampleFacetRenderingOptions: {
                locSize: { location: 20, size: 40 },
                pixelToUnit: 0.01,
            },
        });

        const text = context
            .getSvg()
            .querySelector('[data-mark-type="text"] text');
        expect(text?.getAttribute("transform")).toBe(
            "translate(60 40) scale(40 25.2)"
        );
    });

    test("anchor-culls unclipped text in the configured direction", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.5, y: 0.9, label: "Above" },
                    { x: 0.1, y: 0.5, label: "Inside" },
                    { x: 0.5, y: 0.1, label: "Below" },
                ],
            },
            mark: {
                type: "text",
                clip: "never",
                cullByVisibleRange: "y",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { field: "y", type: "quantitative", scale: null },
                text: { field: "label" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        view.render(context, Rectangle.create(0, 0, 100, 100), {
            clip: {
                rect: Rectangle.create(25, 25, 50, 50),
                clipX: true,
                clipY: true,
            },
        });

        const svg = context.getSvg();
        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="text"] text'),
                (text) => text.textContent
            )
        ).toEqual(["Inside"]);
        expect(
            svg
                .querySelector('[data-mark-type="text"]')
                ?.hasAttribute("clip-path")
        ).toBe(false);
    });

    test("anchor-culls text after SampleView facet projection", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "Sample" }] },
            mark: {
                type: "text",
                clip: "never",
                cullByVisibleRange: "y",
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );
        const coords = Rectangle.create(0, 0, 100, 100);
        const clip = {
            rect: Rectangle.create(0, 25, 100, 50),
            clipX: false,
            clipY: true,
        };

        view.render(context, coords, {
            clip,
            sampleFacetRenderingOptions: {
                locSize: { location: 0, size: 20 },
                pixelToUnit: 0.01,
            },
        });
        view.render(context, coords, {
            clip,
            sampleFacetRenderingOptions: {
                locSize: { location: 40, size: 20 },
                pixelToUnit: 0.01,
            },
        });

        expect(
            context.getSvg().querySelectorAll('[data-mark-type="text"] text')
        ).toHaveLength(1);
        expect(
            context
                .getSvg()
                .querySelector('[data-mark-type="text"] text')
                ?.getAttribute("y")
        ).toBe("50");
    });

    test("reuses one viewport-edge fade mask for all text in a view", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.1, label: "Left" },
                    { x: 0.9, label: "Right" },
                ],
            },
            mark: {
                type: "text",
                viewportEdgeFadeWidthLeft: 20,
                viewportEdgeFadeDistanceLeft: -5,
                viewportEdgeFadeWidthRight: 20,
                viewportEdgeFadeDistanceRight: -10,
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 50,
            background: null,
        });
        const textGroup = svg.querySelector('[data-mark-type="text"]');
        const mask = svg.querySelector("mask");
        const gradients = Array.from(svg.querySelectorAll("linearGradient"));

        expect(
            svg.querySelectorAll('[data-mark-type="text"] text')
        ).toHaveLength(2);
        expect(svg.querySelectorAll("mask")).toHaveLength(1);
        expect(textGroup?.getAttribute("mask")).toBe(
            `url(#${mask?.getAttribute("id")})`
        );
        expect(gradients).toHaveLength(2);
        expect(
            gradients.map((gradient) => [
                gradient.getAttribute("x1"),
                gradient.getAttribute("x2"),
            ])
        ).toEqual([
            ["110", "90"],
            ["-5", "15"],
        ]);
        expect(warnings).toEqual([]);
    });
});
