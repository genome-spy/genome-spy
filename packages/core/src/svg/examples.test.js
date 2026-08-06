// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import barAndLabelSpec from "../../../../examples/docs/grammar/composition/layer/bar-and-label-layer.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG example exports", () => {
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
        expect(
            chromosomeLabels[0]
                .closest('[data-mark-type="text"]')
                ?.getAttribute("mask")
        ).toMatch(/^url\(#edge-fade-\d+\)$/);
        expect(warnings).toEqual([]);
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
});
