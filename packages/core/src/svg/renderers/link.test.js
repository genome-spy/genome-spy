// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import linkShapesSpec from "../../../../../examples/docs/grammar/mark/link/link-shapes-and-orientations.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../view/layout/rectangle.js";
import { createSvg } from "../index.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG link renderer", () => {
    test("exports all link shapes as native paths", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ (
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

    test("shares arc fade masks by chord line", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.1, x2: 0.4, y: 0.5 },
                    { x: 0.6, x2: 0.9, y: 0.5 },
                    { x: 0.2, x2: 0.8, y: 0.7 },
                ],
            },
            mark: {
                type: "link",
                linkShape: "arc",
                arcFadingDistance: [10, 20],
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { field: "y", type: "quantitative", scale: null },
                y2: { field: "y" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
        });

        const paths = Array.from(
            svg.querySelectorAll('[data-mark-type="link"] path')
        );
        expect(paths).toHaveLength(3);
        expect(svg.querySelectorAll('mask[id^="link-arc-fade-"]')).toHaveLength(
            2
        );
        expect(paths[0].getAttribute("mask")).toBe(
            paths[1].getAttribute("mask")
        );
        expect(paths[2].getAttribute("mask")).not.toBe(
            paths[0].getAttribute("mask")
        );
        expect(warnings).toEqual([]);
    });

    test("positions arc fade masks after sample facet projection", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: "arc",
                arcFadingDistance: [5, 10],
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 200, height: 100 }
        );
        const coords = Rectangle.create(0, 0, 200, 100);

        view.render(context, coords, {
            sampleFacetRenderingOptions: {
                locSize: { location: 10, size: 30 },
                pixelToUnit: 0.01,
            },
        });
        view.render(context, coords, {
            sampleFacetRenderingOptions: {
                locSize: { location: 60, size: 20 },
                pixelToUnit: 0.01,
            },
        });

        const svg = context.getSvg();
        const paths = Array.from(
            svg.querySelectorAll('[data-mark-type="link"] path')
        );
        expect(paths.map((path) => path.getAttribute("mask"))).toEqual([
            "url(#link-arc-fade-0)",
            "url(#link-arc-fade-1)",
        ]);
        expect(
            Array.from(
                svg.querySelectorAll('linearGradient[id$="-gradient"]'),
                (gradient) => [
                    gradient.getAttribute("y1"),
                    gradient.getAttribute("y2"),
                ]
            )
        ).toEqual([
            ["15", "35"],
            ["60", "80"],
        ]);
    });
});
