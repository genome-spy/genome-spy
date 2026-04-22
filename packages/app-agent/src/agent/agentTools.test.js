import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
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
        resolveViewSelector: vi.fn(() => view),
        setViewVisibility: vi.fn((selector, nextVisible) => {
            visible = nextVisible;
        }),
        jumpToProvenanceState: vi.fn(() => true),
        jumpToInitialProvenanceState: vi.fn(() => true),
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
                description: "Sort samples by a selected attribute.",
                usage: "Use this when the user wants to rank samples by a single attribute. The attribute is typically quantitative or ordinal.",
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

        expect(result.content.schema).toEqual(
            expect.objectContaining({
                type: "object",
                required: ["attribute"],
            })
        );
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
                        { value: "F", count: 1 },
                        { value: "M", count: 1 },
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
                                { value: "blood", count: 1 },
                                { value: "bone marrow", count: 1 },
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
                            categories: [{ value: "blood", count: 1 }],
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
        runtime.getAgentContext.mockReturnValueOnce({
            provenance: [
                {
                    provenanceId: "provenance-1",
                    summary: "Sort by purity",
                    type: "sampleView/sortBy",
                },
            ],
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
