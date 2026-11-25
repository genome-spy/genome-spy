// @vitest-environment jsdom

import { render } from "lit";
import { describe, expect, test, vi } from "vitest";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { prepareViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "@genome-spy/core/genomeSpy/viewDataInit.js";
import SoftwarePickingBuffer from "@genome-spy/core/rendering/canvas2d/picking/softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "@genome-spy/core/rendering/canvas2d/picking/softwarePickingRasterizer.js";
import SoftwarePickingViewRenderingContext from "@genome-spy/core/rendering/canvas2d/picking/softwarePickingViewRenderingContext.js";
import SvgViewRenderingContext from "@genome-spy/core/rendering/svg/svgViewRenderingContext.js";
import { createSvg } from "@genome-spy/core/svg/index.js";
import dataTooltipHandler from "@genome-spy/core/tooltip/dataTooltipHandler.js";
import { createLayoutResult } from "@genome-spy/core/view/layout/layoutResult.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import UnitView from "@genome-spy/core/view/unitView.js";
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

    test.each(/** @type {const} */ ([undefined, "ellipsis", "fade"]))(
        "renders sidebar labels with labelOverflow %s",
        async (labelOverflow) => {
            const longId = "sample-identifier-for-the-treatment-group";
            const longName = "Primary T helper cells from peripheral blood";
            const labelLength = 80;
            const { view, context } = await createSampleViewForTest({
                initializeFlow: false,
                spec: {
                    config: { mark: { color: "black" } },
                    samples: {
                        labelLength,
                        labelOverflow,
                        identity: {
                            data: {
                                values: [
                                    { id: "S1", label: "Control" },
                                    { id: longId, label: longName },
                                ],
                            },
                            idField: "id",
                            displayNameField: "label",
                        },
                    },
                    spec: { data: { values: [{}] }, mark: "point" },
                },
            });
            prepareViewHierarchy(view);
            await initializeViewData(
                view,
                context.dataFlow,
                context.textMetrics,
                () => undefined
            );

            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: 400,
                logicalHeight: 200,
            });
            const selector = '[data-name="sample-labels"] text';
            const labels = Array.from(svg.querySelectorAll(selector));
            const labelTexts = labels.map((label) => label.textContent);
            expect(view.sampleLabelView.getSize().width.px).toBe(labelLength);
            if (labelOverflow === "ellipsis") {
                expect(labelTexts).toEqual([
                    "Control",
                    expect.stringMatching(/^Primary.*\.\.\.$/),
                ]);
                const labelMetrics = context.textMetrics.requestFont({});
                expect(
                    labelMetrics.measureWidth(labelTexts[1], 11)
                ).toBeLessThanOrEqual(labelLength);
            } else {
                expect(labelTexts).toEqual(["Control", longName]);
            }

            if (labelOverflow === "fade") {
                expect(labels[1].closest("[mask][clip-path]")).not.toBeNull();
                expect(labels[1].getAttribute("transform")).not.toContain(
                    "scale("
                );

                const overview = createSvg({
                    viewRoot: view,
                    logicalWidth: 400,
                    logicalHeight: 35,
                });
                const scales = Array.from(
                    overview.svg.querySelectorAll(selector),
                    (label) =>
                        label
                            .getAttribute("transform")
                            .match(/scale\(([^)]+)\)/)?.[1]
                );
                expect(scales).toHaveLength(2);
                expect(Number(scales[0])).toBeLessThan(1);
                expect(scales[1]).toBe(scales[0]);
            } else if (labelOverflow === undefined) {
                expect(labels[1].getAttribute("transform")).toContain("scale(");
                return;
            }

            const datum = Iterator.from(
                view.sampleLabelView.getCollector().getData()
            ).find((datum) => datum.id === longId);
            const tooltip = document.createElement("div");
            const mark = view.sampleLabelView.mark;
            const tooltipOptions = mark.properties.tooltip;
            render(
                await dataTooltipHandler(
                    datum,
                    mark,
                    tooltipOptions ? tooltipOptions.params : undefined
                ),
                tooltip
            );
            expect(
                Array.from(tooltip.querySelectorAll("td"), (cell) =>
                    cell.textContent.trim()
                )
            ).toEqual([longId, longName]);
        }
    );

    test("keeps grouped metadata bars and labels aligned with independent sample plots", async () => {
        const samples = ["A", "B", "C"];
        const { view, context } = await createSampleViewForTest({
            initializeFlow: false,
            disableGroupUpdates: false,
            spec: {
                config: {
                    mark: { color: "black" },
                    // Sidebar rows keep their shared geometry under plot mark defaults.
                    rect: { yOffset: -3, y2Offset: 3 },
                    text: { yOffset: 4, y2Offset: 4 },
                },
                data: {
                    values: samples.map((sample) => ({ sample, value: 1 })),
                },
                samples: {},
                // This close-up height tapers spacing below the fitted fraction.
                sampleLayout: { sampleHeight: 20, peekGroupSpacing: 1000 },
                metadata: {},
                spec: {
                    name: "sample-plot",
                    mark: { type: "rect", yOffset: 0, y2Offset: 0 },
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

        const width = 500;
        const height = 240;
        // Replay the same arranged commands while the sample camera changes.
        const layout = createLayoutResult(
            view,
            Rectangle.create(0, 0, width, height),
            { renderingOptions: { firstFacet: true } }
        );
        const textMetrics = context.textMetrics;
        const render = () => {
            const svgContext = new SvgViewRenderingContext(
                { picking: false },
                { width, height, textMetrics }
            );
            layout.collectRenderCommands(svgContext);
            return {
                svg: svgContext.getSvg(),
                warnings: svgContext.getWarnings(),
            };
        };
        const pick = (/** @type {number} */ x, /** @type {number} */ y) => {
            const buffer = new SoftwarePickingBuffer(width, height);
            const rasterizer = new SoftwarePickingRasterizer(buffer);
            layout.collectRenderCommands(
                new SoftwarePickingViewRenderingContext({
                    width,
                    height,
                    textMetrics,
                    devicePixelRatio: 1,
                    getRasterizer: () => rasterizer,
                })
            );
            return buffer.read(x, y);
        };

        const { svg, warnings } = render();
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
        const backgrounds = Array.from(
            svg.querySelectorAll(
                '[data-name="attribute-group-missing-background"] rect'
            )
        );
        expect(backgrounds).toHaveLength(3);
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
            [backgrounds[1], plots[1]],
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
        const initialPadding = rowScale.paddingInner();
        expect(initialPadding).toBeCloseTo(0.2);
        expect(rowScale.paddingOuter()).toBeCloseTo(initialPadding / 2);

        const plot = view
            .getDescendants()
            .find((candidate) => candidate.name === "sample-plot");
        if (!(plot instanceof UnitView)) throw new Error("Missing sample plot");
        const firstFacetCoords = plot.facetCoords.get(["A"]);
        const middleOfPlot = view.childCoords.x + view.childCoords.width / 2;
        const topology = view.locationManager
            .getPlacementSource()
            .getSnapshot().topology;
        context.animator.requestTransition = (callback) =>
            callback(performance.now() + 1000);
        const requestLayout = vi.fn();
        context.requestLayoutReflow = requestLayout;
        const copyRowScale = vi.spyOn(rowScale, "copy");
        await view.locationManager.togglePeek(true, 120, "A");
        expect(copyRowScale).not.toHaveBeenCalled();
        copyRowScale.mockRestore();
        expect(rowScale.paddingInner()).toBeGreaterThan(0);
        expect(rowScale.paddingInner()).toBeLessThan(initialPadding);
        expect(rowScale.paddingOuter()).toBeCloseTo(
            rowScale.paddingInner() / 2
        );
        view.locationManager.setScrollOffset(100);
        const empty = render().svg;
        expect(
            empty.querySelectorAll('[data-name="sample-plot"] rect')
        ).toHaveLength(0);
        expect(
            empty.querySelectorAll('[data-name="sample-labels"] text')
        ).toHaveLength(0);
        const emptyViewport = rowScale.viewport();
        expect(emptyViewport).not.toEqual(initialViewport);
        expect(rowScale.range()).toEqual([1, 0]);
        expect(plot.facetCoords.get(["A"])).toBe(firstFacetCoords);
        expect(pick(middleOfPlot, height / 2)).toBe(0);

        view.locationManager.setScrollOffset(Infinity);
        const next = render().svg;
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
        const id = pick(
            middleOfPlot,
            Number(nextPlot.getAttribute("y")) +
                Number(nextPlot.getAttribute("height")) / 2
        );
        expect(plot.getCollector().findDatumByUniqueId(id)).toMatchObject({
            sample: "C",
        });
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
        expect(requestLayout).not.toHaveBeenCalled();
        const exhausted = createSvg({
            viewRoot: view,
            logicalWidth: 500,
            logicalHeight: 40,
        });
        expect(view.locationManager.getBandLayout().step).toBe(0);
        expect(rowScale.paddingInner()).toBe(0);
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
