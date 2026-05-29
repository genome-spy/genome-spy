import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../charts/hierarchySampleAttributePlots.js", () => ({
    buildHierarchyBarplot: vi.fn(() => ({
        kind: "sample_attribute_plot",
        plotType: "barplot",
        title: "Bar plot",
        spec: {},
        namedData: [],
        filename: "genomespy-barplot.png",
        summary: {
            groupCount: 1,
            sampleCount: 0,
            plottedCount: 0,
        },
        characterization: {
            kind: "category_counts",
            encoding: {
                x: {
                    role: "plotted_attribute",
                    title: "category",
                },
                y: {
                    role: "count",
                    title: "count",
                },
            },
            nonMissingCount: 0,
            missingCount: 0,
            distinctCount: 0,
            categories: [],
        },
    })),
    buildHierarchyBoxplot: vi.fn(() => ({
        kind: "sample_attribute_plot",
        plotType: "boxplot",
        title: "Boxplot",
        spec: {},
        namedData: [],
        filename: "genomespy-boxplot.png",
        summary: {
            groupCount: 1,
            sampleCount: 0,
            plottedCount: 0,
        },
        characterization: {
            kind: "quantitative_distribution",
            groups: [],
        },
    })),
    buildHierarchyScatterplot: vi.fn(() => ({
        kind: "sample_attribute_plot",
        plotType: "scatterplot",
        title: "Scatterplot",
        spec: {},
        namedData: [],
        filename: "genomespy-scatterplot.png",
        summary: {
            groupCount: 1,
            sampleCount: 0,
            plottedCount: 0,
        },
        characterization: {
            kind: "quantitative_relationship",
            axisMapping: [],
            missingPairCount: 0,
            x: {},
            y: {},
        },
    })),
}));

import {
    buildHierarchyBarplot,
    buildHierarchyBoxplot,
    buildHierarchyScatterplot,
} from "../charts/hierarchySampleAttributePlots.js";
import { createAgentApi } from "./index.js";
import { UnknownAttributeInfoError } from "../sampleView/unknownAttributeInfoError.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import { createIntervalSelection } from "@genome-spy/core/selection/selection.js";

describe("createAgentApi", () => {
    let app;

    beforeEach(() => {
        const sampleAttributeInfo = {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            title: "Age",
            description: "Age in years",
            type: "quantitative",
        };
        const namedScaleResolutions = new Map([
            [
                "x_at_root",
                {
                    getComplexDomain: vi.fn(() => [
                        { chrom: "chr1", pos: 10 },
                        { chrom: "chr1", pos: 20 },
                    ]),
                    isZoomable: vi.fn(() => true),
                    isZoomed: vi.fn(() => true),
                    zoomTo: vi.fn(async () => undefined),
                },
            ],
        ]);
        const sampleView = {
            spec: {
                metadata: {
                    sources: [
                        {
                            id: "clinical",
                            name: "Clinical",
                            description: "Clinical annotations.",
                            initialLoad: false,
                            attributes: {
                                "": {
                                    type: "nominal",
                                    description: "Clinical value.",
                                },
                            },
                            backend: {
                                backend: "data",
                                data: {
                                    values: [
                                        {
                                            sample: "s1",
                                            diagnosis: "AML",
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            id: "eager-default",
                            name: "Eager default",
                            description: "Loaded at startup by default.",
                            backend: {
                                backend: "data",
                                data: {
                                    values: [
                                        {
                                            sample: "s1",
                                            stage: "I",
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            id: "eager-explicit",
                            name: "Eager explicit",
                            description: "Loaded at startup explicitly.",
                            initialLoad: ["score"],
                            backend: {
                                backend: "data",
                                data: {
                                    values: [
                                        {
                                            sample: "s1",
                                            score: 1,
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
            sampleHierarchy: { id: "sample-hierarchy" },
            compositeAttributeInfoSource: {
                getAttributeInfo: vi.fn(() => sampleAttributeInfo),
            },
            getBaseUrl: vi.fn(() => "https://example.org/spec.json"),
            paramRuntime: {
                paramConfigs: new Map([
                    ["selection", { description: "Selection" }],
                ]),
            },
        };

        app = {
            rootSpec: {
                genomes: {
                    hg38: {},
                },
                assembly: "hg38",
            },
            genomeSpy: {
                viewRoot: { id: "root-view" },
                getSearchableViews: vi.fn(() => ["searchable-view"]),
                getNamedScaleResolutions: vi.fn(() => namedScaleResolutions),
            },
            getSampleView: vi.fn(() => sampleView),
            provenance: {
                getActionHistory: vi.fn(() => [{ provenanceId: "p1" }]),
                getActionInfo: vi.fn(() => ({
                    provenanceTitle: "Provenance label",
                    title: "Fallback label",
                })),
                getPresentState: vi.fn(() => ({ present: true })),
                getCurrentIndex: vi.fn(() => 1),
                activateState: vi.fn(),
                activateInitialState: vi.fn(),
            },
            intentPipeline: {
                submit: vi.fn(async () => undefined),
            },
            store: {
                dispatch: vi.fn(),
            },
        };
    });

    it("exposes the bound sample and provenance handles", async () => {
        const agentApi = createAgentApi(app);

        expect(agentApi.getSampleHierarchy()).toEqual({
            id: "sample-hierarchy",
        });
        expect(
            agentApi.getAttributeInfo({
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            })
        ).toEqual(
            expect.objectContaining({
                title: "Age",
                description: "Age in years",
                type: "quantitative",
            })
        );
        expect(agentApi.getSampleViewScopedParamConfig("selection")).toEqual({
            description: "Selection",
        });
        expect(agentApi.getSearchableViews()).toEqual(["searchable-view"]);
        expect(agentApi.getNamedScaleResolutions()).toBe(
            app.genomeSpy.getNamedScaleResolutions()
        );
        expect(agentApi.getViewRoot()).toEqual({ id: "root-view" });
        expect(agentApi.getFocusedView()).toEqual(
            expect.objectContaining({
                sampleHierarchy: { id: "sample-hierarchy" },
                compositeAttributeInfoSource: expect.objectContaining({
                    getAttributeInfo: expect.any(Function),
                }),
                paramRuntime: expect.objectContaining({
                    paramConfigs: new Map([
                        ["selection", { description: "Selection" }],
                    ]),
                }),
            })
        );
        expect(agentApi.getRootSpec()).toEqual({
            genomes: {
                hg38: {},
            },
            assembly: "hg38",
        });

        const agentApiWithoutRoot = createAgentApi({
            ...app,
            genomeSpy: {
                ...app.genomeSpy,
                viewRoot: undefined,
            },
        });
        expect(
            agentApiWithoutRoot.resolveViewSelector({
                type: "unit",
                view: [],
            })
        ).toBeUndefined();
        expect(agentApi.getActionHistory()).toEqual([{ provenanceId: "p1" }]);
        expect(
            agentApi.getActionInfo({ provenanceId: "p1", type: "sample/x" })
        ).toEqual({
            provenanceTitle: "Provenance label",
            title: "Fallback label",
        });
        await expect(
            agentApi.submitIntentActions([], {
                submissionKind: "agent",
            })
        ).resolves.toBeUndefined();
        expect(app.intentPipeline.submit).toHaveBeenCalledWith([], {
            submissionKind: "agent",
        });
        expect(agentApi.getPresentProvenanceState()).toEqual({ present: true });
    });

    it("exposes cached agent-facing metadata source summaries", async () => {
        const agentApi = createAgentApi(app);

        const first = await agentApi.getMetadataSourceSummaries();
        const second = await agentApi.getMetadataSourceSummaries();

        expect(first).toBe(second);
        expect(first).toEqual([
            {
                sourceId: "clinical",
                name: "Clinical",
                description: "Clinical annotations.",
                attributeDefaults: {
                    dataType: "nominal",
                    description: "Clinical value.",
                },
                identifiers: [
                    {
                        name: "column",
                        primary: true,
                        examples: ["diagnosis"],
                    },
                ],
            },
        ]);
    });

    it("returns undefined for unknown attributes without suppressing unexpected errors", () => {
        const sampleView = app.getSampleView();
        sampleView.compositeAttributeInfoSource.getAttributeInfo
            .mockImplementationOnce(() => {
                throw new UnknownAttributeInfoError("No such attribute: foo");
            })
            .mockImplementationOnce(() => {
                throw new Error("broken accessor");
            });
        const agentApi = createAgentApi(app);

        expect(
            agentApi.getAttributeInfo({
                type: "SAMPLE_ATTRIBUTE",
                specifier: "foo",
            })
        ).toBeUndefined();
        expect(() =>
            agentApi.getAttributeInfo({
                type: "SAMPLE_ATTRIBUTE",
                specifier: "foo",
            })
        ).toThrow("broken accessor");
    });

    it("forwards mutation and UI hooks to the app shell", () => {
        const agentApi = createAgentApi(app);
        const selector = { view: ["root"], type: "unit" };

        agentApi.setViewVisibility(selector, true);
        expect(app.store.dispatch).toHaveBeenCalledWith(
            viewSettingsSlice.actions.setVisibility({
                key: makeViewSelectorKey(selector),
                visibility: true,
            })
        );

        expect(agentApi.jumpToProvenanceState("p2")).toBe(false);
        expect(app.provenance.activateState).toHaveBeenCalledWith("p2");
        expect(agentApi.jumpToInitialProvenanceState()).toBe(false);
        expect(app.provenance.activateInitialState).toHaveBeenCalledTimes(1);
    });

    it("builds sample attribute plots through the current sample view", async () => {
        app.getSampleView.mockReturnValue({
            sampleHierarchy: {
                groupMetadata: [
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                    },
                ],
            },
            compositeAttributeInfoSource: {
                getAttributeInfo: vi.fn((attribute) => {
                    if (attribute.specifier === "diagnosis") {
                        return {
                            attribute,
                            title: "Diagnosis",
                            emphasizedName: "Diagnosis",
                            type: "nominal",
                            scale: {
                                domain: () => ["AML", "ALL"],
                                range: () => ["#ff0000", "#00ff00"],
                            },
                        };
                    }

                    if (attribute.specifier === "age") {
                        return {
                            attribute,
                            title: "Age",
                            emphasizedName: "Age",
                            type: "quantitative",
                        };
                    }

                    if (attribute.specifier === "purity") {
                        return {
                            attribute,
                            title: "Purity",
                            emphasizedName: "Purity",
                            type: "quantitative",
                        };
                    }

                    return undefined;
                }),
            },
        });

        const agentApi = createAgentApi(app);

        const barPlot = await agentApi.buildSampleAttributePlot({
            plotType: "bar",
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "diagnosis",
            },
        });
        const boxplot = await agentApi.buildSampleAttributePlot({
            plotType: "boxplot",
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
        });
        const scatterplot = await agentApi.buildSampleAttributePlot({
            plotType: "scatterplot",
            xAttribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            yAttribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "purity",
            },
        });

        expect(barPlot).toMatchObject({
            kind: "sample_attribute_plot",
            plotType: "barplot",
        });
        expect(boxplot).toMatchObject({
            kind: "sample_attribute_plot",
            plotType: "boxplot",
        });
        expect(scatterplot).toMatchObject({
            kind: "sample_attribute_plot",
            plotType: "scatterplot",
        });
        expect(buildHierarchyBarplot).toHaveBeenCalledWith(
            expect.objectContaining({
                sampleHierarchy: expect.objectContaining({
                    groupMetadata: expect.any(Array),
                }),
            })
        );
        expect(buildHierarchyBoxplot).toHaveBeenCalledWith(
            expect.objectContaining({
                sampleHierarchy: expect.objectContaining({
                    groupMetadata: expect.any(Array),
                }),
            })
        );
        expect(buildHierarchyScatterplot).toHaveBeenCalledWith(
            expect.objectContaining({
                colorScaleDomain: ["AML", "ALL"],
                colorScaleRange: ["#ff0000", "#00ff00"],
            })
        );
    });

    it("handles unknown plot attributes without suppressing unexpected plot lookup errors", async () => {
        const sampleView = {
            sampleHierarchy: {
                groupMetadata: [],
            },
            compositeAttributeInfoSource: {
                getAttributeInfo: vi
                    .fn()
                    .mockImplementationOnce(() => {
                        throw new UnknownAttributeInfoError(
                            "No such attribute: foo"
                        );
                    })
                    .mockImplementationOnce(() => {
                        throw new Error("broken plot lookup");
                    }),
            },
        };
        app.getSampleView.mockReturnValue(sampleView);
        const agentApi = createAgentApi(app);

        await expect(
            agentApi.buildSampleAttributePlot({
                plotType: "boxplot",
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "foo",
                },
            })
        ).rejects.toThrow("Could not resolve the requested sample attribute.");
        await expect(
            agentApi.buildSampleAttributePlot({
                plotType: "boxplot",
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "foo",
                },
            })
        ).rejects.toThrow("broken plot lookup");
    });

    it("awaits plot attribute availability and applies plot-local labels", async () => {
        const ensureAvailability = vi.fn(async () => undefined);
        const aggregatedAttribute = {
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: {
                    scope: [],
                    view: "track",
                },
                field: "beta",
                interval: {
                    type: "selection",
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                },
                aggregation: {
                    op: "max",
                },
            },
        };
        const aggregatedInfo = {
            attribute: aggregatedAttribute,
            title: "max(beta) in selection brush",
            emphasizedName: "max(beta) in selection brush",
            type: "quantitative",
            ensureAvailability,
        };
        app.getSampleView.mockReturnValue({
            sampleHierarchy: {
                groupMetadata: [],
            },
            compositeAttributeInfoSource: {
                getAttributeInfo: vi.fn((attribute) =>
                    attribute.type === "VALUE_AT_LOCUS"
                        ? aggregatedInfo
                        : undefined
                ),
            },
        });

        const agentApi = createAgentApi(app);
        await agentApi.buildSampleAttributePlot({
            plotType: "boxplot",
            attribute: aggregatedAttribute,
            attributeLabel: "TP53 region beta",
        });

        expect(ensureAvailability).toHaveBeenCalledTimes(1);
        expect(buildHierarchyBoxplot).toHaveBeenCalledWith(
            expect.objectContaining({
                attributeInfo: expect.objectContaining({
                    attribute: aggregatedAttribute,
                    title: "TP53 region beta",
                    emphasizedName: "TP53 region beta",
                }),
            })
        );
    });

    it("materializes selection-backed attribute intervals", () => {
        const intervalSelection = createIntervalSelection(["x"]);
        intervalSelection.intervals.x = [42, 84];
        const sampleView = {
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "brush",
                        {
                            select: {
                                type: "interval",
                            },
                        },
                    ],
                ]),
                getValue: vi.fn(() => intervalSelection),
            },
            visit: (visitor) => visitor(sampleView),
            getDataAncestors: () => [sampleView],
        };
        app.getSampleView.mockReturnValue(sampleView);
        const agentApi = createAgentApi(app);

        const materialized = agentApi.materializeAttributeIdentifier({
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: {
                    scope: [],
                    view: "track",
                },
                field: "beta",
                interval: {
                    type: "selection",
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                },
                aggregation: {
                    op: "weightedMean",
                },
            },
        });

        expect(materialized).toEqual({
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: {
                    scope: [],
                    view: "track",
                },
                field: "beta",
                interval: [42, 84],
                aggregation: {
                    op: "weightedMean",
                },
            },
        });
    });
});
