// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { prepareViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { createSvg } from "@genome-spy/core/svg/index.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import MergeSampleFacets from "./mergeFacets.js";

transforms.mergeFacets = MergeSampleFacets;

describe("SampleView SVG export", () => {
    test("exports repeated plots and band-positioned sample labels", async () => {
        const { view, context } = await createSampleViewForTest({
            initializeFlow: false,
            disableGroupUpdates: false,
            spec: {
                config: { mark: { color: "black" } },
                samples: {
                    identity: {
                        data: {
                            values: [
                                { sample: "S1", displayName: "Control" },
                                { sample: "S2", displayName: "Treatment" },
                            ],
                        },
                        idField: "sample",
                        displayNameField: "displayName",
                    },
                },
                spec: {
                    data: { values: [{}] },
                    mark: { type: "text", text: "Plot" },
                    encoding: {
                        x: { value: 0.5 },
                        y: { value: 0.5 },
                    },
                },
            },
        });
        prepareViewHierarchy(view);
        await initializeViewData(
            view,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
        });
        const texts = Array.from(svg.querySelectorAll("text"), (text) => ({
            value: text.textContent,
            y: getTranslateY(text),
            clip: text
                .closest('[data-mark-type="text"]')
                ?.getAttribute("clip-path"),
        }));
        const plotRows = texts.filter(({ value }) => value == "Plot");

        expect(plotRows).toHaveLength(2);
        expect(plotRows[0].y).not.toBe(plotRows[1].y);
        expect(texts.map(({ value }) => value)).toEqual(
            expect.arrayContaining(["Control", "Treatment"])
        );
        expect(new Set(plotRows.map(({ clip }) => clip)).size).toBe(1);
        expect(warnings).toEqual([]);
    });

    test("keeps grouped metadata bars and labels aligned with independent sample plots", async () => {
        const samples = ["A", "B", "C"];
        const { view, context } = await createSampleViewForTest({
            initializeFlow: false,
            disableGroupUpdates: false,
            spec: {
                config: { mark: { color: "black" } },
                data: {
                    values: samples.map((sample) => ({ sample, value: 1 })),
                },
                samples: {},
                sampleLayout: { peekGroupSpacing: 1000 },
                metadata: {},
                spec: {
                    name: "sample-plot",
                    mark: "rect",
                    encoding: {
                        sample: { field: "sample" },
                        x: {
                            field: "value",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                            axis: null,
                        },
                        x2: { datum: 0 },
                        y: {
                            field: "value",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                            axis: null,
                        },
                        y2: { datum: 0 },
                    },
                    aggregateSamples: [
                        {
                            name: "sample-summary",
                            height: 20,
                            mark: "rect",
                            encoding: {
                                x: { field: "value", type: "quantitative" },
                                x2: { datum: 0 },
                                y: { value: 0 },
                                y2: { value: 1 },
                            },
                        },
                    ],
                },
            },
        });
        prepareViewHierarchy(view);
        await initializeViewData(
            view,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );
        view.provenance.store.dispatch(
            view.actions.addMetadata({
                columnarMetadata: {
                    sample: samples,
                    group: ["first", "first", "last"],
                    bar: [1, null, 0.5],
                },
                attributeDefs: {
                    group: {
                        type: "nominal",
                        scale: { domain: ["first", "last"] },
                    },
                    bar: { type: "quantitative", barScale: { domain: [0, 1] } },
                },
            })
        );
        await view.metadataView.awaitMetadataReady();
        view.intentExecutor.dispatch(
            view.actions.groupByNominal({
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "group" },
            })
        );
        await Promise.resolve();

        // Grouping makes the initially hidden group-marker subtree visible.
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.textMetrics
        );

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 500,
            logicalHeight: 240,
        });
        const plots = Array.from(
            svg.querySelectorAll(
                '[data-name="sample-plot"] [data-mark-type="rect"] rect'
            )
        );
        const bars = Array.from(
            svg.querySelectorAll(
                '[data-name="attribute-bar-value"] [data-mark-type="rect"] rect'
            )
        );
        const labels = Array.from(
            svg.querySelectorAll('[data-name="sample-labels"] text')
        );
        expect(plots).toHaveLength(3);
        expect(bars).toHaveLength(2);
        expect(labels).toHaveLength(3);
        expect(
            svg.querySelectorAll(
                '[data-name="attribute-group-missing-background"] rect'
            )
        ).toHaveLength(3);
        for (let i = 0; i < labels.length; i++) {
            const y = Number(plots[i].getAttribute("y"));
            const height = Number(plots[i].getAttribute("height"));
            // SVG serializes positions to tenths of a logical pixel.
            expect(
                Math.abs(getTranslateY(labels[i]) - y - height / 2)
            ).toBeLessThan(0.11);
        }
        for (const [bar, plot] of [
            [bars[0], plots[0]],
            [bars[1], plots[2]],
        ]) {
            expect(Number(bar.getAttribute("y"))).toBeCloseTo(
                Number(plot.getAttribute("y"))
            );
            expect(Number(bar.getAttribute("height"))).toBeCloseTo(
                Number(plot.getAttribute("height"))
            );
        }
        expect(warnings).toEqual([]);
        const title = /** @type {SVGTextElement} */ (
            Array.from(svg.querySelectorAll("text")).find(
                (text) => text.textContent === "bar"
            )
        );
        const titleY = getTranslateY(title);
        const rowScale = view.sampleLabelView
            .getScaleResolution("y")
            .getScale();
        const initialViewport = rowScale.viewport();
        expect(initialViewport).not.toBeNull();
        expect(rowScale.range()).toEqual([1, 0]);

        const plot = view
            .getDescendants()
            .find((candidate) => candidate.name === "sample-plot");
        const topology = view.locationManager
            .getPlacementSource()
            .getSnapshot().topology;
        context.animator.requestTransition = (callback) =>
            callback(performance.now() + 1000);
        const requestLayout = vi.fn();
        context.requestLayoutReflow = requestLayout;
        await view.locationManager.togglePeek(true, 120, "A");
        view.locationManager.setScrollOffset(100);
        const empty = createSvg({
            viewRoot: view,
            logicalWidth: 500,
            logicalHeight: 240,
        }).svg;
        expect(
            empty.querySelectorAll('[data-name="sample-plot"] rect')
        ).toHaveLength(0);
        expect(
            empty.querySelectorAll('[data-name="sample-labels"] text')
        ).toHaveLength(0);
        const emptyViewport = rowScale.viewport();
        expect(emptyViewport).not.toEqual(initialViewport);
        expect(rowScale.range()).toEqual([1, 0]);
        expect(plot.facetCoords.size).toBe(0);

        requestLayout.mockClear();
        view.locationManager.setScrollOffset(Infinity);
        // Membership invalidation must precede this first render after an empty batch.
        expect(requestLayout).toHaveBeenCalled();
        const next = createSvg({
            viewRoot: view,
            logicalWidth: 500,
            logicalHeight: 240,
        }).svg;
        expect(
            next.querySelectorAll('[data-name="sample-plot"] rect')
        ).toHaveLength(1);
        expect(
            Array.from(
                next.querySelectorAll('[data-name="sample-labels"] text'),
                (text) => text.textContent
            )
        ).toEqual(["C"]);
        const nextPlot = next.querySelector('[data-name="sample-plot"] rect');
        const nextBar = Array.from(
            next.querySelectorAll('[data-name="attribute-bar-value"] rect')
        ).at(-1);
        expect(nextBar.getAttribute("y")).toBe(nextPlot.getAttribute("y"));
        expect(nextBar.getAttribute("height")).toBe(
            nextPlot.getAttribute("height")
        );
        const nextTitle = /** @type {SVGTextElement} */ (
            Array.from(next.querySelectorAll("text")).find(
                (text) => text.textContent === "bar"
            )
        );
        expect(getTranslateY(nextTitle)).toBe(titleY);
        expect(rowScale.range()).toEqual([1, 0]);
        expect(rowScale.viewport()).not.toEqual(emptyViewport);
        expect(
            view.locationManager.getPlacementSource().getSnapshot().topology
        ).toBe(topology);

        // Fixed group summaries can exhaust the fitted rows. Metadata and
        // labels must disappear while the summaries remain visible.
        await view.locationManager.togglePeek(false);
        const exhausted = createSvg({
            viewRoot: view,
            logicalWidth: 500,
            logicalHeight: 40,
        });
        expect(view.locationManager.getBandLayout().step).toBe(0);
        expect(
            exhausted.svg.querySelectorAll(
                '[data-name="sample-plot"] rect, [data-name="sample-labels"] text, [data-name="attribute-bar-value"] rect, [data-name="attribute-group-missing-background"] rect'
            )
        ).toHaveLength(0);
        expect(
            exhausted.svg.querySelectorAll('[data-name="sample-summary"] rect')
                .length
        ).toBeGreaterThan(0);
        expect(exhausted.warnings).toEqual([]);
    });
});

/** @param {SVGTextElement} text */
function getTranslateY(text) {
    const match = text
        .getAttribute("transform")
        ?.match(/^translate\(-?\d+(?:\.\d+)? (-?\d+(?:\.\d+)?)\)/);
    if (!match) {
        throw new Error("Expected a leading SVG translate transform.");
    }
    return +match[1];
}
