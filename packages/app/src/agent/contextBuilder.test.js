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

vi.mock("@genome-spy/core/selection/selection.js", () => ({
    asSelectionConfig: asSelectionConfigMock,
    isIntervalSelectionConfig: isIntervalSelectionConfigMock,
    isPointSelectionConfig: isPointSelectionConfigMock,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    getBookmarkableParams: getBookmarkableParamsMock,
    getParamSelector: getParamSelectorMock,
    getViewSelector: (view) => ({
        scope: [],
        view: view.explicitName ?? view.name,
    }),
    isChromeView: () => false,
    visitAddressableViews: (root, visitor) => root.visit(visitor),
}));

import { getAgentContext } from "./contextBuilder.js";

function createAppStub() {
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
            ]),
            getValue: (paramName) =>
                paramName === "brush"
                    ? { type: "interval", value: [0, 1] }
                    : undefined,
        },
        compositeAttributeInfoSource: {
            getAttributeInfo,
        },
    };

    getParamSelectorMock.mockReturnValue({
        scope: [],
        param: "brush",
    });

    const provenance = [
        {
            type: "paramProvenance/paramChange",
            summary: "Brush brush (0-1) in Patient Cohort",
            payload: {
                selector: { scope: [], param: "brush" },
                value: { type: "interval", intervals: { x: [0, 1] } },
            },
        },
        {
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

    return {
        getSampleView: () => sampleView,
        store: {
            getState: () => ({
                lifecycle: {
                    appInitialized: true,
                },
            }),
        },
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
            getBookmarkableActionHistory: () => provenance,
            getActionInfo: (action) => ({
                provenanceTitle: action.summary,
            }),
        },
    };
}

describe("getAgentContext", () => {
    it("keeps the planner context wire shape stable", () => {
        const context = getAgentContext(createAppStub());

        expect(Object.keys(context).sort()).toEqual([
            "actionCatalog",
            "attributes",
            "lifecycle",
            "provenance",
            "sampleSummary",
            "schemaVersion",
            "viewRoot",
            "viewWorkflows",
        ]);

        expect(() => JSON.stringify(context)).not.toThrow();
        expect(context.actionCatalog.map((entry) => entry.actionType)).toEqual([
            "sortBy",
            "filterByNominal",
            "filterByQuantitative",
            "groupByNominal",
            "groupToQuartiles",
            "groupByThresholds",
            "retainFirstNCategories",
        ]);
    });

    it("builds a compact agent context from app state", () => {
        const context = getAgentContext(createAppStub());

        expect(context.schemaVersion).toBe(1);
        expect(context.sampleSummary).toEqual({
            sampleCount: 2,
            groupCount: 2,
        });
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
        expect(context.viewRoot.selectionDeclarations[0].value).toEqual({
            type: "interval",
            intervals: {
                x: [
                    { chrom: "chr1", pos: 0 },
                    { chrom: "chr1", pos: 1 },
                ],
            },
        });
        expect(context.attributes).toHaveLength(2);
        expect(context.attributes[0].id).toEqual({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "diagnosis",
        });
        expect(context.attributes[0].description).toBe("Description diagnosis");
        expect(context.actionCatalog.length).toBeGreaterThan(0);
        expect(context.viewWorkflows.workflows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    workflowType: "deriveMetadataFromSelection",
                }),
                expect.objectContaining({
                    workflowType: "createBoxplotFromSelection",
                }),
            ])
        );
        expect(context.viewWorkflows).not.toHaveProperty("selections");
        expect(context.provenance).toEqual([
            expect.objectContaining({
                summary: "Brush brush (0-1) in Patient Cohort",
                type: "paramProvenance/paramChange",
            }),
            expect.objectContaining({
                summary: "Sort by min(purity) in selection brush",
                type: "sampleView/sortBy",
            }),
        ]);
    });
});
