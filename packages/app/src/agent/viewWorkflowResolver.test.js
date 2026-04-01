// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
}));

import { resolveViewWorkflow } from "./viewWorkflowResolver.js";
import { createFieldId } from "./viewWorkflowContext.js";

function createAppStub({
    hasBrush = true,
    brushValue = [0, 1],
    fields = [{ view: "betaTrack", title: "Beta Track", field: "beta" }],
} = {}) {
    const views = fields.map((field) => ({
        explicitName: field.view,
        getTitleText: () => field.title,
        getEncoding: () => ({
            x: { field: "pos", type: "locus" },
            y: { field: field.field, type: "quantitative" },
        }),
    }));

    const sampleView = {
        visit: (visitor) => {
            for (const view of views) {
                visitor(view);
            }
        },
    };

    resolveParamSelectorMock.mockReturnValue({ view: views[0] });

    return {
        getSampleView: () => sampleView,
        provenance: {
            getPresentState: () => ({
                paramProvenance: {
                    entries: hasBrush
                        ? {
                              brush: {
                                  selector: { scope: [], param: "brush" },
                                  value: {
                                      type: "interval",
                                      value: brushValue,
                                  },
                              },
                          }
                        : {},
                },
            }),
        },
    };
}

describe("resolveViewWorkflow", () => {
    it("resolves a fully specified structured workflow", () => {
        const selectionId = JSON.stringify({ scope: [], param: "brush" });
        const result = resolveViewWorkflow(createAppStub(), {
            workflowType: "deriveMetadataFromSelection",
            selectionId,
            fieldId: createFieldId(selectionId, "betaTrack", "beta"),
            aggregation: "variance",
        });

        expect(result.status).toBe("resolved");
        expect(result.value).toEqual(
            expect.objectContaining({
                workflowType: "deriveMetadataFromSelection",
                aggregation: "variance",
                field: expect.objectContaining({
                    view: "betaTrack",
                    field: "beta",
                }),
                selection: expect.objectContaining({
                    label: "brush",
                }),
            })
        );
    });

    it("asks for the field when the workflow leaves it unspecified", () => {
        const betaTrack = {
            explicitName: "betaTrack",
            getTitleText: () => "Beta Track",
            getEncoding: () => ({
                x: { field: "pos", type: "locus" },
                y: { field: "beta", type: "quantitative" },
                color: { field: "segmentMean", type: "quantitative" },
            }),
        };

        resolveParamSelectorMock.mockReturnValue({ view: betaTrack });

        const result = resolveViewWorkflow(
            {
                getSampleView: () => ({
                    visit: (visitor) => visitor(betaTrack),
                }),
                provenance: {
                    getPresentState: () => ({
                        paramProvenance: {
                            entries: {
                                brush: {
                                    selector: { scope: [], param: "brush" },
                                    value: { type: "interval", value: [0, 1] },
                                },
                            },
                        },
                    }),
                },
            },
            {
                workflowType: "deriveMetadataFromSelection",
                aggregation: "variance",
            }
        );

        expect(result.status).toBe("needs_clarification");
        expect(result.request.slot).toBe("fieldId");
        expect(result.request.message).toContain("beta (Beta Track)");
        expect(result.request.message).toContain("segmentMean (Beta Track)");
    });

    it("asks for the aggregation when it is missing", () => {
        const selectionId = JSON.stringify({ scope: [], param: "brush" });
        const result = resolveViewWorkflow(createAppStub(), {
            workflowType: "deriveMetadataFromSelection",
            fieldId: createFieldId(selectionId, "betaTrack", "beta"),
        });

        expect(result.status).toBe("needs_clarification");
        expect(result.request.slot).toBe("aggregation");
        expect(result.request.options).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: "weightedMean" }),
                expect.objectContaining({ value: "variance" }),
            ])
        );
    });

    it("returns an error when no active brush exists", () => {
        const result = resolveViewWorkflow(createAppStub({ hasBrush: false }), {
            workflowType: "deriveMetadataFromSelection",
        });

        expect(result).toEqual(
            expect.objectContaining({
                status: "error",
                message: expect.stringContaining(
                    "No active interval selection"
                ),
            })
        );
    });

    it("resolves a structured boxplot workflow without creating a metadata name", () => {
        const selectionId = JSON.stringify({ scope: [], param: "brush" });
        const result = resolveViewWorkflow(createAppStub(), {
            workflowType: "createBoxplotFromSelection",
            selectionId,
            fieldId: createFieldId(selectionId, "betaTrack", "beta"),
            aggregation: "variance",
        });

        expect(result.status).toBe("resolved");
        expect(result.value).toEqual(
            expect.objectContaining({
                workflowType: "createBoxplotFromSelection",
                outputTarget: "boxplot",
                aggregation: "variance",
                name: undefined,
            })
        );
    });

    it("generates short unique names from the current selection interval", () => {
        const selectionId = JSON.stringify({ scope: [], param: "brush" });
        const first = resolveViewWorkflow(
            createAppStub({ brushValue: [0, 1] }),
            {
                workflowType: "deriveMetadataFromSelection",
                selectionId,
                fieldId: createFieldId(selectionId, "betaTrack", "beta"),
                aggregation: "weightedMean",
            }
        );
        const second = resolveViewWorkflow(
            createAppStub({ brushValue: [10, 20] }),
            {
                workflowType: "deriveMetadataFromSelection",
                selectionId,
                fieldId: createFieldId(selectionId, "betaTrack", "beta"),
                aggregation: "weightedMean",
            }
        );

        expect(first.status).toBe("resolved");
        expect(second.status).toBe("resolved");
        expect(first.value.name).not.toBe(second.value.name);
        expect(first.value.name.length).toBeLessThanOrEqual(32);
    });
});
