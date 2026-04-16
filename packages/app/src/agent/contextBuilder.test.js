// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

const { getParamSelectorMock } = vi.hoisted(() => ({
    getParamSelectorMock: vi.fn(),
}));
const { asSelectionConfigMock } = vi.hoisted(() => ({
    asSelectionConfigMock: vi.fn((config) => config),
}));
const { isPointSelectionConfigMock } = vi.hoisted(() => ({
    isPointSelectionConfigMock: vi.fn(() => false),
}));
const { isIntervalSelectionConfigMock } = vi.hoisted(() => ({
    isIntervalSelectionConfigMock: vi.fn(
        (config) => config?.type === "interval"
    ),
}));
const { getBookmarkableParamsMock } = vi.hoisted(() => ({
    getBookmarkableParamsMock: vi.fn(() => []),
}));
const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/selection/selection.js", () => ({
    asSelectionConfig: asSelectionConfigMock,
    isIntervalSelectionConfig: isIntervalSelectionConfigMock,
    isPointSelectionConfig: isPointSelectionConfigMock,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    getBookmarkableParams: getBookmarkableParamsMock,
    getParamSelector: getParamSelectorMock,
    makeParamSelectorKey: (selector) => JSON.stringify(selector),
    getViewSelector: (view) => ({
        scope: [],
        view: view.explicitName ?? view.name,
    }),
    isChromeView: () => false,
    resolveParamSelector: resolveParamSelectorMock,
    visitAddressableViews: (root, visitor) => root.visit(visitor),
}));

import { getAgentContext } from "./contextBuilder.js";

function createAppStub(options = {}) {
    const geneSearchData = options.geneSearchData ?? [
        {
            gene_symbol: "TP53",
            gene_name: "tumor protein p53",
        },
        {
            gene_symbol: "BRCA1",
            gene_name: "breast cancer 1",
        },
        {
            gene_symbol: "EGFR",
            gene_name: "epidermal growth factor receptor",
        },
    ];

    const getAttributeInfo = (attribute) => ({
        name: String(attribute.specifier),
        attribute,
        title: "Title " + String(attribute.specifier),
        description: "Description " + String(attribute.specifier),
        emphasizedName: String(attribute.specifier),
        accessor: () => undefined,
        valuesProvider: () => [],
        type: attribute.specifier === "purity" ? "quantitative" : "nominal",
    });

    const provenance = [
        {
            provenanceId: "provenance-1",
            type: "paramProvenance/paramChange",
            summary: "Brush brush (0-1) in Patient Cohort",
            payload: {
                selector: { scope: [], param: "brush" },
                value: { type: "interval", intervals: { x: [0, 1] } },
            },
        },
        {
            provenanceId: "provenance-2",
            type: "sampleView/sortBy",
            summary: "Sort by min(purity) in selection brush",
            payload: {
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: {
                            scope: ["samples"],
                            view: "track",
                        },
                        field: "purity",
                        interval: {
                            type: "selection",
                            selector: { scope: [], param: "brush" },
                        },
                        aggregation: { op: "min" },
                    },
                },
            },
        },
    ];

    const getGeneSearchData = vi.fn(() => geneSearchData);
    const searchCollector = {
        getData: getGeneSearchData,
    };
    const searchView = {
        name: "gene-track",
        explicitName: "gene-track",
        spec: {
            name: "gene-track",
            description: "Gene symbols and names.",
            encoding: {
                search: [
                    {
                        field: "gene_symbol",
                        description: "Gene symbol",
                    },
                    {
                        field: "gene_name",
                        description: "Gene name",
                    },
                ],
            },
        },
        getTitleText: () => "Gene Symbols",
        getEncoding: () => searchView.spec.encoding,
        getSearchAccessors: vi.fn(() => [
            (datum) => datum.gene_symbol,
            (datum) => datum.gene_name,
        ]),
        getCollector: vi.fn(() => searchCollector),
    };

    const sampleView = {
        name: "samples",
        explicitName: "samples",
        getTitleText: () => "Patient Cohort",
        visit: (visitor) => visitor(sampleView),
        getScaleResolution: (channel) =>
            channel === "x"
                ? {
                      type: "locus",
                      toComplex: (value) => ({
                          chrom: "chr1",
                          pos: value,
                      }),
                  }
                : undefined,
        paramRuntime: {
            paramConfigs: new Map([
                [
                    "brush",
                    {
                        name: "brush",
                        description: "Brush the current x interval.",
                        persist: true,
                        select: {
                            type: "interval",
                            encodings: ["x"],
                        },
                    },
                ],
                [
                    "threshold",
                    {
                        name: "threshold",
                        description: "Threshold for the range control.",
                        persist: true,
                        value: 0.6,
                        bind: {
                            input: "range",
                            name: "Threshold",
                            description: "Adjust the cutoff.",
                            min: 0,
                            max: 1,
                            step: 0.1,
                        },
                    },
                ],
            ]),
            getValue: (paramName) =>
                paramName === "brush"
                    ? { type: "interval", value: [0, 1] }
                    : paramName === "threshold"
                      ? 0.6
                      : undefined,
        },
        compositeAttributeInfoSource: {
            getAttributeInfo,
        },
    };

    getParamSelectorMock.mockImplementation((view, paramName) => ({
        scope: [],
        param: paramName,
    }));
    resolveParamSelectorMock.mockImplementation((view) => ({
        view,
    }));

    return {
        getSampleView: () => sampleView,
        genomeSpy: {
            getSearchableViews: () => [searchView],
        },
        searchView,
        searchCollector,
        provenance: {
            getPresentState: () => ({
                sampleView: {
                    sampleData: {
                        ids: ["s1", "s2"],
                    },
                    sampleMetadata: {
                        attributeNames: ["diagnosis", "purity"],
                        attributeDefs: {
                            diagnosis: { visible: true },
                            purity: { visible: false },
                        },
                    },
                    groupMetadata: [
                        {
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "diagnosis",
                            },
                        },
                    ],
                    rootGroup: {
                        name: "ROOT",
                        groups: [{ name: "A", samples: ["s1", "s2"] }],
                    },
                },
                paramProvenance: {
                    entries: {
                        brush: {
                            selector: { param: "brush", scope: ["samples"] },
                            value: { type: "interval", value: [0, 1] },
                        },
                    },
                },
            }),
            getActionHistory: () => provenance,
            getActionInfo: (action) => ({
                provenanceTitle: action.summary,
            }),
        },
    };
}

describe("getAgentContext", () => {
    it("keeps the agent context wire shape stable", () => {
        const app = createAppStub();
        const context = getAgentContext(app);

        expect(Object.keys(context)).toEqual([
            "schemaVersion",
            "actionCatalog",
            "toolCatalog",
            "attributes",
            "searchableViews",
            "selectionAggregation",
            "provenance",
            "sampleSummary",
            "sampleGroupLevels",
            "viewRoot",
        ]);

        expect(() => JSON.stringify(context)).not.toThrow();
        expect(context.actionCatalog.map((entry) => entry.actionType)).toEqual([
            "sampleView/addMetadata",
            "sampleView/deriveMetadata",
            "sampleView/addMetadataFromSource",
            "sampleView/sortBy",
            "sampleView/retainFirstOfEach",
            "sampleView/retainFirstNCategories",
            "sampleView/filterByQuantitative",
            "sampleView/filterByNominal",
            "sampleView/removeUndefined",
            "sampleView/groupCustomCategories",
            "sampleView/groupByNominal",
            "sampleView/groupToQuartiles",
            "sampleView/groupByThresholds",
            "sampleView/removeGroup",
            "sampleView/retainMatched",
            "paramProvenance/paramChange",
        ]);
    });

    it("builds a compact agent context from app state", () => {
        const app = createAppStub();
        const context = getAgentContext(app);

        expect(context.schemaVersion).toBe(1);
        expect(context.sampleSummary).toEqual({
            sampleCount: 2,
            groupCount: 1,
            visibleSampleCount: 2,
        });
        expect(context.sampleGroupLevels).toEqual([
            {
                level: 0,
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "diagnosis",
                },
                title: "Title diagnosis",
            },
        ]);
        expect(context.viewRoot).toEqual(
            expect.objectContaining({
                type: "other",
                title: "Patient Cohort",
                selector: {
                    scope: [],
                    view: "samples",
                },
            })
        );
        expect(context.viewRoot.parameterDeclarations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    parameterType: "selection",
                    label: "brush",
                    value: {
                        type: "interval",
                        intervals: {
                            x: [
                                { chrom: "chr1", pos: 0 },
                                { chrom: "chr1", pos: 1 },
                            ],
                        },
                    },
                }),
                expect.objectContaining({
                    parameterType: "variable",
                    label: "Threshold",
                    bind: expect.objectContaining({
                        input: "range",
                        label: "Threshold",
                        min: 0,
                        max: 1,
                        step: 0.1,
                    }),
                }),
            ])
        );
        expect(context.attributes).toHaveLength(2);
        expect(context.attributes[0].id).toEqual({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "diagnosis",
        });
        expect(context.attributes[0].description).toBe("Description diagnosis");
        expect(context.actionCatalog.length).toBeGreaterThan(0);
        expect(context.toolCatalog).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    toolName: "expandViewNode",
                    description: expect.any(String),
                    inputType: expect.any(String),
                }),
            ])
        );
        expect(context.searchableViews).toEqual([
            expect.objectContaining({
                selector: {
                    scope: [],
                    view: "gene-track",
                },
                title: "Gene Symbols",
                description: "Gene symbols and names.",
                searchFields: [
                    {
                        field: "gene_symbol",
                        description: "Gene symbol",
                        examples: ["TP53", "BRCA1", "EGFR"],
                    },
                    {
                        field: "gene_name",
                        description: "Gene name",
                        examples: [
                            "tumor protein p53",
                            "breast cancer 1",
                            "epidermal growth factor receptor",
                        ],
                    },
                ],
                dataFields: ["gene_symbol", "gene_name"],
            }),
        ]);
        expect(context.selectionAggregation.fields).toEqual([]);
        expect(context.provenance).toEqual([
            expect.objectContaining({
                summary: "Brush brush (0-1) in Patient Cohort",
                type: "paramProvenance/paramChange",
                provenanceId: "provenance-1",
            }),
            expect.objectContaining({
                summary: "Sort by min(purity) in selection brush",
                type: "sampleView/sortBy",
                provenanceId: "provenance-2",
            }),
        ]);
    });

    it("caches searchable view examples across context rebuilds", () => {
        const app = createAppStub();

        const firstContext = getAgentContext(app);
        const secondContext = getAgentContext(app);

        expect(firstContext.searchableViews).toEqual(
            secondContext.searchableViews
        );
        expect(app.searchView.getSearchAccessors).toHaveBeenCalledTimes(1);
        expect(app.searchView.getCollector).toHaveBeenCalledTimes(1);
        expect(app.searchCollector.getData).toHaveBeenCalledTimes(1);
    });

    it("caps searchable view examples per field", () => {
        const app = createAppStub({
            geneSearchData: [
                {
                    gene_symbol: "TP53",
                    gene_name: "tumor protein p53",
                },
                {
                    gene_symbol: "BRCA1",
                    gene_name: "breast cancer 1",
                },
                {
                    gene_symbol: "EGFR",
                    gene_name: "epidermal growth factor receptor",
                },
                {
                    gene_symbol: "MYC",
                    gene_name: "myelocytomatosis",
                },
                {
                    gene_symbol: "PTEN",
                    gene_name: "phosphatase and tensin homolog",
                },
            ],
        });

        const context = getAgentContext(app);

        expect(context.searchableViews[0].searchFields[0].examples).toEqual([
            "TP53",
            "BRCA1",
            "EGFR",
        ]);
        expect(context.searchableViews[0].searchFields[1].examples).toEqual([
            "tumor protein p53",
            "breast cancer 1",
            "epidermal growth factor receptor",
        ]);
    });
});
