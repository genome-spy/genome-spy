import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";

vi.mock("@genome-spy/app/agentShared", async (importOriginal) => {
    const actual = await importOriginal();

    return {
        ...actual,
        buildSelectionAggregationAttributeIdentifier: ({
            viewSelector,
            field,
            selectionSelector,
            aggregation,
        }) => ({
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: viewSelector,
                field,
                interval: {
                    type: "selection",
                    selector: selectionSelector,
                },
                aggregation: { op: aggregation },
            },
        }),
        formatAggregationExpression: (aggregation, field) =>
            `${aggregation}(${field})`,
        getActionCreator: (actionType) => (payload) => ({
            type: actionType,
            payload,
        }),
        templateResultToString: (value) => String(value),
    };
});

import { agentTools } from "./agentTools.js";
import { validateIntentBatchShape } from "./actionShapeValidator.js";

function createRuntimeStub() {
    let expanded = false;
    let visible = true;
    const metadataSummarySources = {
        sex: {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            title: "sex",
            dataType: "nominal",
            scope: "visible_samples",
            sampleIds: ["sampleA", "sampleB"],
            values: ["F", "M"],
        },
        age: {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            title: "age",
            dataType: "quantitative",
            scope: "visible_samples",
            sampleIds: ["sampleA", "sampleB"],
            values: [42, undefined],
        },
    };
    const groupedAttributeSummarySources = {
        tissue: {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            title: "tissue",
            dataType: "nominal",
            scope: "visible_groups",
            groupLevels: [
                {
                    level: 1,
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    title: "diagnosis",
                },
            ],
            groups: [
                {
                    path: ["A"],
                    titles: ["A"],
                    title: "A",
                    sampleIds: ["sampleA", "sampleB"],
                },
                {
                    path: ["B"],
                    titles: ["B"],
                    title: "B",
                    sampleIds: ["sampleC"],
                },
            ],
            valuesBySampleId: {
                sampleA: "blood",
                sampleB: "bone marrow",
                sampleC: "blood",
            },
        },
    };
    const searchData = [
        {
            gene_symbol: "TP53",
            gene_name: "tumor protein p53",
        },
        {
            gene_symbol: "BRCA1",
            gene_name: "breast cancer 1",
        },
    ];
    const xScaleResolution = {
        isZoomable: vi.fn(() => true),
        zoomTo: vi.fn(),
    };
    const colorScaleResolution = {
        isZoomable: vi.fn(() => false),
        zoomTo: vi.fn(),
    };
    const view = {
        explicitName: "gene-track",
        name: "gene-track",
        spec: {
            name: "gene-track",
            encoding: {
                search: [
                    {
                        field: "gene_symbol",
                    },
                    {
                        field: "gene_name",
                    },
                ],
            },
        },
        getTitleText: vi.fn(() => "Gene Symbols"),
        getEncoding: vi.fn(() => view.spec.encoding),
        getSearchAccessors: vi.fn(() => [
            (datum) => datum.gene_symbol,
            (datum) => datum.gene_name,
        ]),
        getCollector: vi.fn(() => ({
            getData: vi.fn(() => searchData),
        })),
        isVisible: vi.fn(() => visible),
    };
    const agentApi = {
        getSampleHierarchy: vi.fn(() => ({
            sampleData: {
                ids: ["sampleA", "sampleB", "sampleC"],
                entities: {},
            },
            sampleMetadata: {
                attributeNames: ["sex", "age", "timepoint", "status"],
                entities: {
                    sampleA: {
                        sex: "F",
                        age: 42,
                        timepoint: "relapse",
                        status: "treated",
                    },
                    sampleB: {
                        sex: "M",
                        age: undefined,
                        timepoint: "relapse",
                        status: "naive",
                    },
                    sampleC: {
                        sex: "F",
                        age: 61,
                        timepoint: "baseline",
                        status: "relapse",
                    },
                },
            },
            groupMetadata: [],
            rootGroup: {
                name: "ROOT",
                title: "ROOT",
                groups: [
                    {
                        name: "visible",
                        title: "visible",
                        samples: ["sampleA", "sampleB", "sampleC"],
                    },
                ],
            },
        })),
        getAttributeInfo: vi.fn((attribute) => ({
            attribute,
            title: attribute.specifier,
            emphasizedName: String(attribute.specifier),
            accessor: () => undefined,
            valuesProvider: () => [],
            description: undefined,
            type:
                attribute?.specifier === "sex" ||
                attribute?.specifier === "timepoint" ||
                attribute?.specifier === "status"
                    ? "nominal"
                    : "quantitative",
        })),
        resolveViewSelector: vi.fn(() => view),
        setViewVisibility: vi.fn((selector, nextVisible) => {
            visible = nextVisible;
        }),
        getActionHistory: vi.fn(() => []),
        jumpToProvenanceState: vi.fn(() => true),
        jumpToInitialProvenanceState: vi.fn(() => true),
        materializeAttributeIdentifier: vi.fn((attribute) => {
            if (attribute.type !== "VALUE_AT_LOCUS") {
                return attribute;
            }

            return {
                ...attribute,
                specifier: {
                    ...attribute.specifier,
                    interval: [
                        { chrom: "chr17", pos: 7565097 },
                        { chrom: "chr17", pos: 7590856 },
                    ],
                },
            };
        }),
        getNamedScaleResolutions: vi.fn(
            () =>
                new Map([
                    ["x", xScaleResolution],
                    ["color", colorScaleResolution],
                ])
        ),
        buildSampleAttributePlot: vi.fn((request) => ({
            kind: "sample_attribute_plot",
            plotType:
                request.plotType === "bar"
                    ? "barplot"
                    : request.plotType === "boxplot"
                      ? "boxplot"
                      : "scatterplot",
            title:
                request.plotType === "scatterplot"
                    ? "Scatterplot of age vs purity"
                    : request.plotType === "boxplot"
                      ? "Boxplot of age"
                      : "Bar plot of diagnosis",
            spec: {},
            namedData: [],
            filename: "genomespy-plot.png",
            summary: {
                groupCount: 2,
                sampleCount: 12,
                plottedCount: 12,
            },
            characterization: {
                kind: "quantitative_relationship",
                axisMapping: [
                    { axis: "x", attributeIndex: 0, title: "age" },
                    { axis: "y", attributeIndex: 1, title: "purity" },
                ],
                sampleCount: 12,
                plottedPointCount: 12,
                missingPairCount: 0,
                x: { min: 1, max: 12 },
                y: { min: 2, max: 24 },
            },
        })),
    };

    return {
        agentApi,
        expandViewNode: vi.fn(() => {
            const wasExpanded = expanded;
            expanded = true;
            return !wasExpanded;
        }),
        collapseViewNode: vi.fn(() => {
            const wasExpanded = expanded;
            expanded = false;
            return wasExpanded;
        }),
        resolveViewSelector: agentApi.resolveViewSelector,
        isViewNodeExpanded: vi.fn(() => expanded),
        isViewVisible: vi.fn(() => visible),
        setViewVisibility: agentApi.setViewVisibility,
        getAttributeSummarySource: vi.fn(
            (attribute) => metadataSummarySources[attribute.specifier]
        ),
        getGroupedAttributeSummarySource: vi.fn(
            (attribute) => groupedAttributeSummarySources[attribute.specifier]
        ),
        jumpToProvenanceState: agentApi.jumpToProvenanceState,
        jumpToInitialProvenanceState: agentApi.jumpToInitialProvenanceState,
        getAgentContext: vi.fn(() => ({})),
        getAgentVolatileContext: vi.fn(() => ({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        selectionSelector: {
                            scope: [],
                            param: "brush",
                        },
                        field: "beta",
                        supportedAggregations: ["max"],
                    },
                ],
            },
        })),
        submitIntentActions: vi.fn(async () => ({
            executedActions: 1,
            content: {
                kind: "intent_batch_result",
            },
            summaries: [
                {
                    content: "Executed 1 action.",
                    text: "Executed 1 action.",
                },
            ],
        })),
        summarizeExecutionResult: vi.fn(() => "Executed 1 action."),
        scaleResolutions: {
            x: xScaleResolution,
            color: colorScaleResolution,
        },
    };
}

function createTreatmentSurvivalHierarchy() {
    const makeSamples = (prefix, count) =>
        Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

    return {
        sampleData: {
            ids: [],
            entities: {},
        },
        sampleMetadata: {
            attributeNames: [],
            entities: {},
        },
        groupMetadata: [
            {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "treatment",
                },
            },
            {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "survival",
                },
            },
        ],
        rootGroup: {
            name: "ROOT",
            title: "ROOT",
            groups: [
                {
                    name: "PDS",
                    title: "PDS",
                    groups: [
                        {
                            name: "poor",
                            title: "poor",
                            samples: makeSamples("pdsPoor", 12),
                        },
                        {
                            name: "middle",
                            title: "middle",
                            samples: makeSamples("pdsMiddle", 18),
                        },
                        {
                            name: "good",
                            title: "good",
                            samples: makeSamples("pdsGood", 24),
                        },
                    ],
                },
                {
                    name: "NACT",
                    title: "NACT",
                    groups: [
                        {
                            name: "poor",
                            title: "poor",
                            samples: makeSamples("nactPoor", 10),
                        },
                        {
                            name: "middle",
                            title: "middle",
                            samples: makeSamples("nactMiddle", 16),
                        },
                        {
                            name: "good",
                            title: "good",
                            samples: makeSamples("nactGood", 20),
                        },
                    ],
                },
            ],
        },
    };
}

describe("agentTools", () => {
    it("returns compact docs for an intent action", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getIntentActionDocs(runtime, {
            actionType: "sampleView/sortBy",
        });

        expect(result.text).toBe(
            "Read docs for sampleView/sortBy. No action was executed."
        );
        expect(result.content).toEqual(
            expect.objectContaining({
                actionType: "sampleView/sortBy",
                description:
                    "Sort samples in descending order by a selected attribute.",
                usage: "Use this when samples should be ranked by one quantitative or ordinal attribute before further filtering or grouping. The attribute may be metadata or a selection-derived aggregation candidate from `selectionAggregation.fields`. Sorting is stable, so ties preserve current sample order.",
                payloadFields: [
                    expect.objectContaining({
                        name: "attribute",
                        type: "AttributeIdentifier",
                        required: true,
                    }),
                ],
                examples: [
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                ],
            })
        );
        expect(result.content).not.toHaveProperty("payloadType");
        expect(result.content).not.toHaveProperty("schema");
        expect(result.content.payloadFields[0]).not.toHaveProperty("typeRefs");
        expect(result.content.referencedTypes).toEqual(["AttributeIdentifier"]);
    });

    it("rejects unknown intent action doc lookups", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        expect(() =>
            tools.getIntentActionDocs(runtime, {
                actionType: "sampleView/doesNotExist",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("returns docs for an intent payload field type", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getIntentActionTypeDocs(runtime, {
            typeName: "AttributeIdentifier",
            referenceDepth: 1,
        });

        expect(result.text).toBe(
            "Read docs for intent type AttributeIdentifier. No action was executed."
        );
        expect(result.content.definitions).toHaveProperty(
            "SelectionAggregationCandidate"
        );
    });

    it("shows relationship plots through the host API", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.showAttributeRelationshipPlot(runtime, {
            kind: "scatterplot",
            attributes: [
                {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "age",
                },
                {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "purity",
                },
            ],
        });

        expect(runtime.agentApi.buildSampleAttributePlot).toHaveBeenCalledWith({
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
        expect(result).toEqual(
            expect.objectContaining({
                text: "Shown Scatterplot of age vs purity with 2 groups and 12 plotted samples or points in the chat transcript.",
                content: expect.objectContaining({
                    kind: "sample_attribute_plot",
                    plotType: "scatterplot",
                    attributes: [
                        {
                            input: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "age",
                            },
                            normalized: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "age",
                            },
                        },
                        {
                            input: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "purity",
                            },
                            normalized: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "purity",
                            },
                        },
                    ],
                }),
            })
        );
    });

    it("passes selection aggregation plot candidates through the host API", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;
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
            label: "TP53 region beta",
        };

        runtime.getAgentVolatileContext.mockReturnValueOnce({
            parameterValues: [
                {
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                    value: {
                        type: "interval",
                        intervals: {
                            x: [
                                { chrom: "chr17", pos: 7565097 },
                                { chrom: "chr17", pos: 7590856 },
                            ],
                        },
                    },
                },
            ],
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        field: "beta",
                        selectionSelector: {
                            scope: [],
                            param: "brush",
                        },
                        supportedAggregations: ["max"],
                    },
                ],
            },
        });

        const result = await tools.showAttributeDistributionPlot(runtime, {
            kind: "boxplot",
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@track:beta",
                aggregation: "max",
            },
        });

        expect(runtime.agentApi.buildSampleAttributePlot).toHaveBeenCalledWith({
            plotType: "boxplot",
            attribute: {
                type: "VALUE_AT_LOCUS",
                specifier: {
                    ...aggregatedAttribute.specifier,
                    interval: [
                        { chrom: "chr17", pos: 7565097 },
                        { chrom: "chr17", pos: 7590856 },
                    ],
                },
            },
        });
        expect(result.content).toEqual(
            expect.objectContaining({
                attribute: {
                    input: {
                        type: "SELECTION_AGGREGATION",
                        candidateId: "brush@track:beta",
                        aggregation: "max",
                    },
                    normalized: {
                        type: "VALUE_AT_LOCUS",
                        specifier: {
                            ...aggregatedAttribute.specifier,
                            interval: [
                                { chrom: "chr17", pos: 7565097 },
                                { chrom: "chr17", pos: 7590856 },
                            ],
                        },
                    },
                },
            })
        );
    });

    it("rejects when the host cannot build a sample attribute plot", async () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.buildSampleAttributePlot.mockReturnValue(undefined);
        const tools = agentTools;

        await expect(
            tools.showCategoryCountsPlot(runtime, {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "diagnosis",
                },
            })
        ).rejects.toThrow(ToolCallRejectionError);
    });

    it("adds metadata source guidance to unresolved plot attributes", async () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.buildSampleAttributePlot.mockRejectedValueOnce(
            new Error(
                "Could not resolve one of the requested sample attributes."
            )
        );
        const tools = agentTools;

        await expect(
            tools.showAttributeRelationshipPlot(runtime, {
                kind: "scatterplot",
                attributes: [
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "Pten",
                    },
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "Sox2",
                    },
                ],
            })
        ).rejects.toThrow(
            "One or more requested sample attributes are not loaded in the current view. Use exact loaded attribute specifiers from context or prior tool results. If the current context contains matching metadataSources, import the needed identifiers first with addMetadataFromSource, then use the returned sample attributes. If no suitable metadata source exists, the attributes are unavailable."
        );
    });

    it("rejects relationship plots with identical axes", async () => {
        const runtime = createRuntimeStub();

        await expect(
            agentTools.showAttributeRelationshipPlot(runtime, {
                kind: "scatterplot",
                attributes: [
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "mutations",
                    },
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "mutations",
                    },
                ],
            })
        ).rejects.toThrow(ToolCallRejectionError);
        expect(
            runtime.agentApi.buildSampleAttributePlot
        ).not.toHaveBeenCalled();
    });

    it("zooms a named zoomable scale with animation", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.zoomToScale(runtime, {
            scaleName: "x",
            domain: [
                { chrom: "chr1", pos: 1000 },
                { chrom: "chr1", pos: 3000 },
            ],
        });

        expect(runtime.scaleResolutions.x.zoomTo).toHaveBeenCalledWith(
            [
                { chrom: "chr1", pos: 1000 },
                { chrom: "chr1", pos: 3000 },
            ],
            true
        );
        expect(result).toEqual({
            text: 'Zoomed scale "x".',
            content: {
                kind: "scale_zoom",
                scaleName: "x",
                domain: [
                    { chrom: "chr1", pos: 1000 },
                    { chrom: "chr1", pos: 3000 },
                ],
            },
        });
    });

    it("waits for animated scale zooming before resolving", async () => {
        const runtime = createRuntimeStub();
        let resolveZoom;
        const zoomPromise = new Promise((resolve) => {
            resolveZoom = resolve;
        });
        runtime.scaleResolutions.x.zoomTo.mockReturnValueOnce(zoomPromise);

        const resultPromise = agentTools.zoomToScale(runtime, {
            scaleName: "x",
            domain: [0, 1],
        });
        let settled = false;
        resultPromise.then(() => {
            settled = true;
        });

        await Promise.resolve();

        expect(settled).toBe(false);

        resolveZoom();

        await expect(resultPromise).resolves.toEqual(
            expect.objectContaining({
                text: 'Zoomed scale "x".',
            })
        );
    });

    it("rejects asynchronous zoom failures as tool errors", async () => {
        const runtime = createRuntimeStub();
        runtime.scaleResolutions.x.zoomTo.mockRejectedValueOnce(
            new Error("Invalid zoom domain")
        );

        await expect(
            agentTools.zoomToScale(runtime, {
                scaleName: "x",
                domain: [0, 1],
            })
        ).rejects.toThrow(ToolCallRejectionError);
    });

    it("rejects zoom requests for unknown scale names", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        await expect(
            tools.zoomToScale(runtime, {
                scaleName: "missing",
                domain: [0, 1],
            })
        ).rejects.toThrow(ToolCallRejectionError);
    });

    it("rejects zoom requests for non-zoomable scales", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        await expect(
            tools.zoomToScale(runtime, {
                scaleName: "color",
                domain: ["A", "B"],
            })
        ).rejects.toThrow(ToolCallRejectionError);
        expect(runtime.scaleResolutions.color.zoomTo).not.toHaveBeenCalled();
    });

    it("summarizes categorical attributes", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            scope: "visible_samples",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Summarized attribute sex with 2 observed categories.",
                content: expect.objectContaining({
                    kind: "attribute_summary",
                    dataType: "nominal",
                    scope: "visible_samples",
                    sampleCount: 2,
                    nonMissingCount: 2,
                    missingCount: 0,
                    distinctCount: 2,
                    categories: [
                        { value: "F", count: 1, share: 0.5 },
                        { value: "M", count: 1, share: 0.5 },
                    ],
                    truncated: false,
                }),
            })
        );
        expect(runtime.getAttributeSummarySource).toHaveBeenCalledWith({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "sex",
        });
    });

    it("summarizes quantitative attributes", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "attribute_summary",
                dataType: "quantitative",
                scope: "visible_samples",
                sampleCount: 2,
                nonMissingCount: 1,
                missingCount: 1,
                max: 42,
                min: 42,
                mean: 42,
                median: 42,
                q1: 42,
                q3: 42,
                iqr: 0,
            })
        );
    });

    it("rejects missing attribute summaries with metadata source guidance", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        expect(() =>
            tools.getAttributeSummary(runtime, {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "transcriptome",
                },
                scope: "visible_samples",
            })
        ).toThrow(
            "One or more requested sample attributes are not loaded in the current view. Use exact loaded attribute specifiers from context or prior tool results. If the current context contains matching metadataSources, import the needed identifiers first with addMetadataFromSource, then use the returned sample attributes. If no suitable metadata source exists, the attributes are unavailable."
        );
    });

    it("lists child sample groups under a parent path", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.getSampleHierarchy.mockReturnValue(
            createTreatmentSurvivalHierarchy()
        );

        const result = agentTools.getSampleGroups(runtime, {
            parentPath: ["PDS"],
        });

        expect(result).toEqual({
            text: "Listed 3 sample groups at level 2.",
            content: {
                kind: "sample_group_listing",
                level: 2,
                levelTitle: "survival",
                parentPath: ["PDS"],
                totalGroupCount: 3,
                groupCount: 3,
                groups: [
                    { name: "poor", sampleCount: 12 },
                    { name: "middle", sampleCount: 18 },
                    { name: "good", sampleCount: 24 },
                ],
                truncated: false,
                guide: {
                    levels: "Grouping levels are one-based. Level 1 is the first visible grouping under ROOT.",
                    groups: "Each entry is a direct child of parentPath. Combine parentPath and name for the full group path.",
                    order: "Groups are returned in current display order.",
                },
            },
        });
    });

    it("lists sample groups at a level using paths when parents vary", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.getSampleHierarchy.mockReturnValue(
            createTreatmentSurvivalHierarchy()
        );

        const result = agentTools.getSampleGroups(runtime, {
            level: 2,
        });

        expect(result.content).toEqual({
            kind: "sample_group_listing",
            level: 2,
            levelTitle: "survival",
            totalGroupCount: 6,
            groupCount: 6,
            groups: [
                { path: ["PDS", "poor"], sampleCount: 12 },
                { path: ["PDS", "middle"], sampleCount: 18 },
                { path: ["PDS", "good"], sampleCount: 24 },
                { path: ["NACT", "poor"], sampleCount: 10 },
                { path: ["NACT", "middle"], sampleCount: 16 },
                { path: ["NACT", "good"], sampleCount: 20 },
            ],
            truncated: false,
            guide: {
                levels: "Grouping levels are one-based. Level 1 is the first visible grouping under ROOT.",
                groups: "Each entry is a group at the requested level. Nested levels use full path because names may repeat under different parents.",
                order: "Groups are returned in current display order.",
            },
        });
    });

    it("summarizes attributes across visible groups", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            scope: "visible_groups",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Summarized attribute tissue across 2 visible groups.",
                content: expect.objectContaining({
                    kind: "grouped_attribute_summary",
                    dataType: "nominal",
                    scope: "visible_groups",
                    groupCount: 2,
                    truncatedGroups: false,
                    groupLevels: [
                        {
                            level: 1,
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "diagnosis",
                            },
                            title: "diagnosis",
                        },
                    ],
                    groups: [
                        {
                            path: ["A"],
                            titles: ["A"],
                            title: "A",
                            nonMissingCount: 2,
                            missingCount: 0,
                            distinctCount: 2,
                            categories: [
                                { value: "blood", count: 1, share: 0.5 },
                                { value: "bone marrow", count: 1, share: 0.5 },
                            ],
                            truncated: false,
                        },
                        {
                            path: ["B"],
                            titles: ["B"],
                            title: "B",
                            nonMissingCount: 1,
                            missingCount: 0,
                            distinctCount: 1,
                            categories: [
                                { value: "blood", count: 1, share: 1 },
                            ],
                            truncated: false,
                        },
                    ],
                }),
            })
        );
        expect(runtime.getGroupedAttributeSummarySource).toHaveBeenCalledWith({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "tissue",
        });
    });

    it("resolves metadata values against visible categorical attributes", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.resolveMetadataAttributeValues(runtime, {
            query: "relapse",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: 'Resolved 2 metadata matches for "relapse".',
                content: {
                    kind: "metadata_attribute_value_resolution",
                    query: "relapse",
                    count: 2,
                    matches: [
                        {
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "timepoint",
                            },
                            title: "timepoint",
                            dataType: "nominal",
                            matchedValue: "relapse",
                            matchType: "exact",
                            visibleSampleCount: 2,
                        },
                        {
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "status",
                            },
                            title: "status",
                            dataType: "nominal",
                            matchedValue: "relapse",
                            matchType: "exact",
                            visibleSampleCount: 1,
                        },
                    ],
                },
            })
        );
        expect(runtime.agentApi.getSampleHierarchy).toHaveBeenCalledTimes(1);
    });

    it("uses Levenshtein fallback for typo-tolerant metadata lookup", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.resolveMetadataAttributeValues(runtime, {
            query: "relaps",
        });

        expect(result.content).toEqual({
            kind: "metadata_attribute_value_resolution",
            query: "relaps",
            count: 2,
            matches: [
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "timepoint",
                    },
                    title: "timepoint",
                    dataType: "nominal",
                    matchedValue: "relapse",
                    matchType: "levenshtein",
                    distance: 1,
                    visibleSampleCount: 2,
                },
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "status",
                    },
                    title: "status",
                    dataType: "nominal",
                    matchedValue: "relapse",
                    matchType: "levenshtein",
                    distance: 1,
                    visibleSampleCount: 1,
                },
            ],
        });
    });

    it("looks up datums in one searchable view", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "tp53",
            field: "gene_symbol",
            mode: "exact",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Found 1 matching datum.",
                content: expect.objectContaining({
                    kind: "datum_lookup_result",
                    query: "tp53",
                    mode: "exact",
                    count: 1,
                    selector: {
                        scope: [],
                        view: "gene-track",
                    },
                    matches: [
                        {
                            gene_symbol: "TP53",
                            gene_name: "tumor protein p53",
                        },
                    ],
                }),
            })
        );
        expect(runtime.resolveViewSelector).toHaveBeenCalledWith({
            scope: [],
            view: "gene-track",
        });
    });

    it("searches all configured fields when field is a wildcard", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "breast cancer 1",
            field: "*",
            mode: "exact",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "datum_lookup_result",
                query: "breast cancer 1",
                mode: "exact",
                count: 1,
                matches: [
                    {
                        gene_symbol: "BRCA1",
                        gene_name: "breast cancer 1",
                    },
                ],
            })
        );
    });

    it("restricts lookup to one configured field when field is provided", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "breast cancer 1",
            field: "gene_name",
            mode: "exact",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "datum_lookup_result",
                query: "breast cancer 1",
                mode: "exact",
                count: 1,
                matches: [
                    {
                        gene_symbol: "BRCA1",
                        gene_name: "breast cancer 1",
                    },
                ],
            })
        );
        expect(runtime.resolveViewSelector).toHaveBeenCalledWith({
            scope: [],
            view: "gene-track",
        });
    });

    it("returns no matches when the requested field does not match", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "breast cancer 1",
            field: "gene_symbol",
            mode: "exact",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "datum_lookup_result",
                query: "breast cancer 1",
                mode: "exact",
                count: 0,
                matches: [],
            })
        );
    });

    it("supports prefix matching", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "breast",
            field: "*",
            mode: "prefix",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "datum_lookup_result",
                query: "breast",
                mode: "prefix",
                count: 1,
                matches: [
                    {
                        gene_symbol: "BRCA1",
                        gene_name: "breast cancer 1",
                    },
                ],
            })
        );
    });

    it("rejects datum lookup on a non-searchable view", () => {
        const runtime = createRuntimeStub();
        runtime.resolveViewSelector.mockReturnValueOnce({
            explicitName: "track",
            name: "track",
        });
        const tools = agentTools;

        expect(() =>
            tools.searchViewDatums(runtime, {
                selector: {
                    scope: [],
                    view: "track",
                },
                query: "TP53",
                field: "*",
                mode: "exact",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("rejects attribute summary requests for unsupported attribute kinds", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        expect(() =>
            tools.getAttributeSummary(runtime, {
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: {
                            scope: [],
                            view: "track",
                        },
                        field: "beta",
                        locus: 1,
                    },
                },
                scope: "visible_samples",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("rejects grouped metadata summaries when no visible groups exist", () => {
        const runtime = createRuntimeStub();
        runtime.getGroupedAttributeSummarySource.mockReturnValueOnce({
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            title: "tissue",
            dataType: "nominal",
            scope: "visible_groups",
            groupLevels: [],
            groups: [],
            valuesBySampleId: {},
        });
        const tools = agentTools;

        expect(() =>
            tools.getAttributeSummary(runtime, {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "tissue",
                },
                scope: "visible_groups",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("activates provenance states through the runtime", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.getActionHistory.mockReturnValue([
            {
                provenanceId: "provenance-1",
                summary: "Sort by purity",
                type: "sampleView/sortBy",
            },
        ]);
        runtime.getAgentVolatileContext.mockReturnValueOnce({
            selectionAggregation: {
                fields: [],
            },
        });

        const tools = agentTools;

        expect(
            tools.jumpToProvenanceState(runtime, {
                provenanceId: "provenance-1",
            })
        ).toEqual(
            expect.objectContaining({
                text: "Jumped to provenance state: Sort by purity.",
                content: expect.objectContaining({
                    kind: "provenance_state_activation",
                    provenanceId: "provenance-1",
                    actionType: "sampleView/sortBy",
                    summary: "Sort by purity",
                    initial: false,
                    changed: true,
                    undoneActionCount: 0,
                }),
            })
        );

        expect(runtime.jumpToProvenanceState).toHaveBeenCalledWith(
            "provenance-1"
        );
    });

    it("returns the number of actions undone by provenance activation", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.getActionHistory.mockReturnValue([
            {
                provenanceId: "provenance-1",
                summary: "Sort by purity",
                type: "sampleView/sortBy",
            },
            {
                provenanceId: "provenance-2",
                summary: "Group by diagnosis",
                type: "sampleView/groupByNominal",
            },
            {
                provenanceId: "provenance-3",
                summary: "Sort by age",
                type: "sampleView/sortBy",
            },
        ]);
        const tools = agentTools;

        expect(
            tools.jumpToProvenanceState(runtime, {
                provenanceId: "provenance-1",
            })
        ).toEqual(
            expect.objectContaining({
                content: expect.objectContaining({
                    provenanceId: "provenance-1",
                    undoneActionCount: 2,
                }),
            })
        );
    });

    it("explains when the requested provenance state is already active", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.jumpToProvenanceState.mockReturnValueOnce(false);
        runtime.agentApi.getActionHistory.mockReturnValue([
            {
                provenanceId: "provenance-1",
                summary: "Sort by purity",
                type: "sampleView/sortBy",
            },
        ]);
        const tools = agentTools;

        expect(
            tools.jumpToProvenanceState(runtime, {
                provenanceId: "provenance-1",
            })
        ).toEqual(
            expect.objectContaining({
                text: expect.stringContaining(
                    "This did not undo or change the analysis"
                ),
                content: expect.objectContaining({
                    provenanceId: "provenance-1",
                    changed: false,
                    undoneActionCount: 0,
                }),
            })
        );
    });

    it("activates the initial provenance state when the provenance id is null", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.getActionHistory.mockReturnValue([
            {
                provenanceId: "provenance-1",
                summary: "Sort by purity",
                type: "sampleView/sortBy",
            },
            {
                provenanceId: "provenance-2",
                summary: "Group by diagnosis",
                type: "sampleView/groupByNominal",
            },
        ]);
        const tools = agentTools;

        expect(
            tools.jumpToProvenanceState(runtime, {
                provenanceId: null,
            })
        ).toEqual(
            expect.objectContaining({
                text: "Jumped to the initial provenance state.",
                content: expect.objectContaining({
                    kind: "provenance_state_activation",
                    initial: true,
                    changed: true,
                    undoneActionCount: 2,
                }),
            })
        );

        expect(runtime.jumpToInitialProvenanceState).toHaveBeenCalledTimes(1);
        expect(runtime.jumpToProvenanceState).not.toHaveBeenCalled();
    });

    it("summarizes intent action execution through the runtime", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.submitIntentAction(runtime, {
            action: {
                actionType: "sampleView/sortBy",
                payload: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                },
            },
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Executed 1 action.",
                content: expect.objectContaining({
                    kind: "intent_batch_result",
                }),
            })
        );
        expect(runtime.submitIntentActions).toHaveBeenCalledTimes(1);
        expect(runtime.summarizeExecutionResult).toHaveBeenCalledTimes(1);
    });

    it("normalizes selection aggregation candidates before submitting actions", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        await tools.submitIntentAction(runtime, {
            action: {
                actionType: "sampleView/deriveMetadata",
                payload: {
                    attribute: {
                        type: "SELECTION_AGGREGATION",
                        candidateId: "brush@track:beta",
                        aggregation: "max",
                    },
                    name: "max_beta",
                },
            },
        });

        expect(runtime.submitIntentActions).toHaveBeenCalledWith(
            expect.objectContaining({
                steps: [
                    {
                        actionType: "sampleView/deriveMetadata",
                        payload: {
                            attribute: {
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
                                    aggregation: { op: "max" },
                                },
                            },
                            name: "max_beta",
                        },
                    },
                ],
            }),
            expect.objectContaining({
                submissionKind: "agent",
            })
        );
    });

    it("returns a clear-selection note after deriving selection-based metadata", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.submitIntentAction(runtime, {
            action: {
                actionType: "sampleView/deriveMetadata",
                payload: {
                    attribute: {
                        type: "SELECTION_AGGREGATION",
                        candidateId: "brush@track:beta",
                        aggregation: "max",
                    },
                    name: "max_beta",
                },
            },
        });

        expect(result.text).toBe("Executed 1 action.");
        expect(result.content).toHaveProperty("agentNotes", [
            {
                selector: {
                    scope: [],
                    param: "brush",
                },
                message:
                    "This derived metadata was based on the current interval selection. If that selection was only needed to derive this metadata, clear it before subsequent actions that should not depend on it.",
            },
        ]);
    });

    it("does not return a clear-selection note for metadata-backed derivation", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.submitIntentAction(runtime, {
            action: {
                actionType: "sampleView/deriveMetadata",
                payload: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                    name: "copied_age",
                },
            },
        });

        expect(result.content).not.toHaveProperty("agentNotes");
    });

    it("submits logical selection aggregation attributes without reusing frozen context selectors", async () => {
        const runtime = createRuntimeStub();
        const selectionSelector = Object.freeze({
            scope: Object.freeze([]),
            param: "brush",
        });
        runtime.getAgentVolatileContext.mockReturnValueOnce({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        selectionSelector,
                        field: "beta",
                        supportedAggregations: ["max"],
                    },
                ],
            },
        });
        runtime.submitIntentActions.mockImplementationOnce(async (batch) => {
            expect(() => validateIntentBatchShape(batch)).not.toThrow();
            return {
                executedActions: 1,
                content: {
                    kind: "intent_batch_result",
                },
                summaries: [],
            };
        });
        const tools = agentTools;

        await tools.submitIntentAction(runtime, {
            action: {
                actionType: "sampleView/deriveMetadata",
                payload: {
                    attribute: {
                        type: "SELECTION_AGGREGATION",
                        candidateId: "brush@track:beta",
                        aggregation: "max",
                    },
                    name: "max_beta",
                },
            },
        });
    });

    it("rethrows intent action failures as rejected tool calls", async () => {
        const runtime = createRuntimeStub();
        runtime.submitIntentActions.mockRejectedValue(
            new Error("No such attribute: mean beta")
        );
        const tools = agentTools;

        await expect(
            tools.submitIntentAction(runtime, {
                action: {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            })
        ).rejects.toThrow(ToolCallRejectionError);
        expect(runtime.submitIntentActions).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                submissionKind: "agent",
            })
        );
    });

    it("fails fast when a selector does not resolve", () => {
        const runtime = createRuntimeStub();
        runtime.resolveViewSelector.mockReturnValueOnce(undefined);
        const tools = agentTools;

        expect(() =>
            tools.setViewVisibility(runtime, {
                selector: {
                    scope: [],
                    view: "missing",
                },
                visibility: false,
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("rejects unknown selection aggregation candidates in submitted actions", async () => {
        const runtime = createRuntimeStub();
        runtime.getAgentVolatileContext.mockReturnValueOnce({
            selectionAggregation: {
                fields: [],
            },
        });
        const tools = agentTools;

        await expect(
            tools.submitIntentAction(runtime, {
                action: {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SELECTION_AGGREGATION",
                            candidateId: "missing-candidate",
                            aggregation: "max",
                        },
                    },
                },
            })
        ).rejects.toThrow(
            "Use an exact candidateId from selectionAggregation.fields."
        );
        expect(runtime.submitIntentActions).not.toHaveBeenCalled();
    });
});
