import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";

vi.mock("@genome-spy/app/agentShared", () => ({
    buildSelectionAggregationAttributeIdentifier: ({
        viewSelector,
        field,
        selectionSelector,
        aggregation,
    }) => ({
        kind: "selection_aggregation_resolution",
        attribute: {
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
        },
    }),
    formatAggregationExpression: (aggregation, field) =>
        `${aggregation}(${field})`,
    getActionCreator: (actionType) => (payload) => ({
        type: actionType,
        payload,
    }),
    templateResultToString: (value) => String(value),
}));

import { agentTools } from "./agentTools.js";

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
    const groupedMetadataSummarySources = {
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
                    level: 0,
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
                rowCount: 12,
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
        getMetadataAttributeSummarySource: vi.fn(
            (attribute) => metadataSummarySources[attribute.specifier]
        ),
        getGroupedMetadataAttributeSummarySource: vi.fn(
            (attribute) => groupedMetadataSummarySources[attribute.specifier]
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
    };
}

describe("agentTools", () => {
    it("returns compact action details for an intent action", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getActionDetails(runtime, {
            actionType: "sampleView/sortBy",
        });

        expect(result.text).toBe("Fetched details for sampleView/sortBy.");
        expect(result.content).toEqual(
            expect.objectContaining({
                actionType: "sampleView/sortBy",
                description:
                    "Sort samples in descending order by a selected attribute.",
                usage: "Use this when samples should be ranked by one quantitative or ordinal attribute before further filtering or grouping.",
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
    });

    it("rejects unknown action detail lookups", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        expect(() =>
            tools.getActionDetails(runtime, {
                actionType: "sampleView/doesNotExist",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("optionally includes action payload schema in action details", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getActionDetails(runtime, {
            actionType: "sampleView/sortBy",
            includeSchema: true,
        });

        expect(result.content.schema).toEqual({
            $ref: "#/definitions/SortBy",
        });
    });

    it("resolves selection aggregation candidates through the current context", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.buildSelectionAggregationAttribute(runtime, {
            candidateId: "brush@track:beta",
            aggregation: "max",
        });

        expect(result.text).toContain("Built an AttributeIdentifier");
        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "selection_aggregation_resolution",
                candidateId: "brush@track:beta",
                aggregation: "max",
            })
        );
        expect(runtime.getAgentVolatileContext).toHaveBeenCalledTimes(1);
    });

    it("shows sample attribute plots through the host API", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.showSampleAttributePlot(runtime, {
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
                text: "Generated Scatterplot of age vs purity with 2 groups and 12 rows.",
                content: expect.objectContaining({
                    kind: "sample_attribute_plot",
                    plotType: "scatterplot",
                }),
            })
        );
    });

    it("rejects when the host cannot build a sample attribute plot", () => {
        const runtime = createRuntimeStub();
        runtime.agentApi.buildSampleAttributePlot.mockReturnValue(undefined);
        const tools = agentTools;

        expect(() =>
            tools.showSampleAttributePlot(runtime, {
                plotType: "bar",
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "diagnosis",
                },
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("summarizes categorical metadata attributes", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getMetadataAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            scope: "visible_samples",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Summarized metadata attribute sex with 2 observed categories.",
                content: expect.objectContaining({
                    kind: "metadata_attribute_summary",
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
        expect(runtime.getMetadataAttributeSummarySource).toHaveBeenCalledWith({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "sex",
        });
    });

    it("summarizes quantitative metadata attributes", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getMetadataAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "metadata_attribute_summary",
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

    it("summarizes metadata attributes across visible groups", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.getMetadataAttributeSummary(runtime, {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            scope: "visible_groups",
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Summarized metadata attribute tissue across 2 visible groups.",
                content: expect.objectContaining({
                    kind: "grouped_metadata_attribute_summary",
                    dataType: "nominal",
                    scope: "visible_groups",
                    groupCount: 2,
                    truncatedGroups: false,
                    groupLevels: [
                        {
                            level: 0,
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
        expect(
            runtime.getGroupedMetadataAttributeSummarySource
        ).toHaveBeenCalledWith({
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

    it("searches all configured fields when field is empty", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = tools.searchViewDatums(runtime, {
            selector: {
                scope: [],
                view: "gene-track",
            },
            query: "breast cancer 1",
            field: "",
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
            field: "",
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
                field: "",
                mode: "exact",
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("rejects metadata summary requests for unsupported attribute kinds", () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        expect(() =>
            tools.getMetadataAttributeSummary(runtime, {
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
        runtime.getGroupedMetadataAttributeSummarySource.mockReturnValueOnce({
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
            tools.getMetadataAttributeSummary(runtime, {
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
        runtime.agentApi.getActionHistory.mockReturnValueOnce([
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
                }),
            })
        );

        expect(runtime.jumpToProvenanceState).toHaveBeenCalledWith(
            "provenance-1"
        );
    });

    it("summarizes intent action execution through the runtime", async () => {
        const runtime = createRuntimeStub();
        const tools = agentTools;

        const result = await tools.submitIntentActions(runtime, {
            actions: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            ],
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

    it("rethrows intent action failures as rejected tool calls", async () => {
        const runtime = createRuntimeStub();
        runtime.submitIntentActions.mockRejectedValue(
            new Error("No such attribute: mean beta")
        );
        const tools = agentTools;

        await expect(
            tools.submitIntentActions(runtime, {
                actions: [
                    {
                        actionType: "sampleView/sortBy",
                        payload: {
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "age",
                            },
                        },
                    },
                ],
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

    it("rejects unknown selection aggregation candidates as tool errors", () => {
        const runtime = createRuntimeStub();
        runtime.getAgentVolatileContext.mockReturnValueOnce({
            selectionAggregation: {
                fields: [],
            },
        });
        const tools = agentTools;

        expect(() =>
            tools.buildSelectionAggregationAttribute(runtime, {
                candidateId: "missing-candidate",
                aggregation: "max",
            })
        ).toThrow(ToolCallRejectionError);
    });
});
