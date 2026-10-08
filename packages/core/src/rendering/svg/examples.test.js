// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import barAndLabelSpec from "../../../../../examples/docs/grammar/composition/layer/bar-and-label-layer.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Genome from "../../genome/genome.js";
import { renderToLayout } from "../../view/testUtils.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG example exports", () => {
    test.each(["generated", "values", "extraValues"])(
        "keeps close-zoom locus ticks and grid lines at visible centers with %s ticks",
        async (mode) => {
            const genome = new Genome({ name: "hg38" });
            const start = genome.toContinuous("chr8", 41_855_590);
            const values = [start, start + 1, start + 2, start + 3];
            const { view } = await createHeadlessEngine(
                {
                    assembly: "hg38",
                    width: 1000,
                    height: 100,
                    data: { values: [] },
                    mark: "point",
                    scales: {
                        x: {
                            type: "locus",
                            // External locus intervals have an inclusive upper bound.
                            domain: [
                                { chrom: "chr8", pos: 41_855_590.01 },
                                { chrom: "chr8", pos: 41_855_592.27 },
                            ],
                            zoom: true,
                        },
                    },
                    encoding: {
                        x: {
                            chrom: "chrom",
                            pos: "pos",
                            type: "locus",
                            axis: {
                                grid: true,
                                // Force the extraValues case to use the explicit path.
                                tickCount: mode === "extraValues" ? 1 : 100,
                                ...(mode === "generated"
                                    ? {}
                                    : { [mode]: values }),
                            },
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

            try {
                // Numeric label layout follows the first completed layout pass.
                renderToLayout(view);
                view.visit((child) =>
                    child.handleBroadcast({ type: "layoutComputed" })
                );
                const { svg, warnings } = createSvg({
                    viewRoot: view,
                    logicalWidth: 1000,
                    logicalHeight: 160,
                });
                const labels = Array.from(
                    svg.querySelectorAll('[data-name="labels_main"] text')
                );
                expect(labels.map((label) => label.textContent)).toEqual([
                    "41,855,591",
                    "41,855,592",
                    "41,855,593",
                ]);
                const positions = labels.map(getTranslateX);
                expect(positions).toEqual([150.3, 457.1, 763.8]);

                for (const name of ["ticks", "grid_lines"]) {
                    const lines = Array.from(
                        svg.querySelectorAll('[data-name="' + name + '"] line')
                    );
                    expect(
                        lines.map((line) => +line.getAttribute("x1"))
                    ).toEqual(positions);
                }
                expect(warnings).toEqual([]);
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test.each(
        /** @type {const} */ ([
            {
                type: "index",
                align: 1,
                padding: 0,
                reverse: false,
                positions: [25, 37.5, 50],
            },
            {
                type: "index",
                align: 0,
                padding: 0.4,
                reverse: false,
                positions: [22.7, 29.5, 36.4],
            },
            {
                type: "locus",
                align: 1,
                padding: 0.4,
                reverse: true,
                positions: [59.1, 52.3, 45.5],
            },
        ])
    )(
        "places $type bands with alignment $align and reverse=$reverse",
        async ({ type, align, padding, reverse, positions }) => {
            const { view } = await createHeadlessEngine(
                {
                    name: "bands",
                    genomes: {
                        test: { contigs: [{ name: "chr1", size: 100 }] },
                    },
                    assembly: "test",
                    width: 100,
                    height: 40,
                    data: { values: [{ pos: 1 }] },
                    params: [{ name: "mapped", expr: "scale('x', 1)" }],
                    scales: {
                        x: { type, domain: [0, 3], align, padding, reverse },
                    },
                    encoding: { y: { value: 0.5 } },
                    // Compare band starts, centers, and ends through the real SVG path.
                    layer: [0, 0.5, 1].map((band, i) => ({
                        name: "placement" + i,
                        mark: "point",
                        encoding: {
                            x: {
                                field: "pos",
                                type,
                                band,
                                axis: /** @type {null} */ (null),
                            },
                        },
                    })),
                },
                {
                    contextOptions: {
                        baseConfig,
                        viewFactoryOptions: { wrapRoot: true },
                    },
                }
            );
            try {
                const { svg, warnings } = createSvg({
                    viewRoot: view,
                    logicalWidth: 100,
                    logicalHeight: 40,
                });
                const actualPositions = positions.map(
                    (_, i) =>
                        +svg
                            .querySelector(
                                '[data-name="placement' + i + '"] circle'
                            )
                            .getAttribute("cx")
                );
                expect(actualPositions).toEqual(positions);
                const owner = view
                    .getDescendants()
                    .find((child) => child.name === "bands");
                expect(owner.paramRuntime.getValue("mapped") * 100).toBeCloseTo(
                    positions[0],
                    0
                );
                expect(warnings).toEqual([]);
            } finally {
                view.disposeSubtree();
            }
        }
    );

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
            svg.querySelectorAll('[data-name="chromosome_labels"] text')
        );

        expect(
            chromosomeLabels.slice(0, 2).map((element) => element.textContent)
        ).toEqual(["chr1", "chr2"]);
        expect(getTranslateX(chromosomeLabels[0])).toBe(4);
        expect(getTranslateX(chromosomeLabels[1])).toBeGreaterThan(
            getTranslateX(chromosomeLabels[0])
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
            /** @type {import("../../spec/root.js").RootSpec} */ (
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
                .querySelector('[data-name="Label"]')
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
                Math.abs(getTranslateX(labels[i]) - expectedCenter)
            ).toBeLessThanOrEqual(0.1);
        }
        expect(textValues).toEqual(expect.arrayContaining(["28", "55", "91"]));
        expect(svg.querySelector('[data-name="Bar"]')).not.toBeNull();
        expect(svg.querySelector('[data-name="Label"]')).not.toBeNull();
        expect(svg.querySelector("style")).toBeNull();
        expect(svg.querySelector("image")).toBeNull();
    });
});

/** @param {Element} element */
function getTranslateX(element) {
    const match = element
        .getAttribute("transform")
        ?.match(/^translate\((-?\d+(?:\.\d+)?)/);
    if (!match) {
        throw new Error("Expected a leading SVG translate transform.");
    }
    return +match[1];
}
