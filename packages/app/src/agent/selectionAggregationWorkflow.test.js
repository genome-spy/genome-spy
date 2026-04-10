// @ts-check
import { describe, expect, it } from "vitest";
import { resolveSelectionAggregationWorkflow } from "./selectionAggregationWorkflow.js";

function createContext({
    selections = [
        {
            id: "brush-1",
            label: "brush",
            type: /** @type {"interval"} */ ("interval"),
            selector: {
                scope: [],
                param: "brush",
            },
            active: true,
            nameSuffix: "brush_1",
        },
    ],
    fields = [
        {
            id: "betaTrack/beta",
            candidateId: "betaTrack/beta",
            view: "betaTrack",
            viewSelector: {
                scope: [],
                view: "betaTrack",
            },
            field: "beta",
            viewTitle: "Beta Track",
            dataType: "quantitative",
            description: "Beta Track",
            supportedAggregations: [
                "count",
                "min",
                "max",
                "weightedMean",
                "variance",
            ],
            selectionIds: ["brush-1"],
        },
    ],
} = {}) {
    return {
        selections,
        fields,
    };
}

describe("selectionAggregationWorkflow", () => {
    it("resolves a fully specified workflow into the canonical attribute source", () => {
        const result = resolveSelectionAggregationWorkflow(createContext(), {
            workflowType: "deriveMetadataFromSelection",
            selectionId: "brush-1",
            fieldId: "betaTrack/beta",
            aggregation: "variance",
        });

        expect(result).toEqual({
            status: "resolved",
            value: expect.objectContaining({
                workflowType: "deriveMetadataFromSelection",
                aggregation: "variance",
                outputTarget: "sample_metadata",
                name: "variance_beta_brush_1",
                selection: expect.objectContaining({
                    id: "brush-1",
                }),
                field: expect.objectContaining({
                    id: "betaTrack/beta",
                    field: "beta",
                }),
            }),
        });
    });

    it("asks for the field when the selection exposes multiple candidates", () => {
        const result = resolveSelectionAggregationWorkflow(
            createContext({
                fields: [
                    {
                        id: "betaTrack/beta",
                        candidateId: "betaTrack/beta",
                        view: "betaTrack",
                        viewSelector: {
                            scope: [],
                            view: "betaTrack",
                        },
                        field: "beta",
                        viewTitle: "Beta Track",
                        dataType: "quantitative",
                        supportedAggregations: ["count", "variance"],
                        description: "Beta Track",
                        selectionIds: ["brush-1"],
                    },
                    {
                        id: "segmentTrack/segmentMean",
                        candidateId: "segmentTrack/segmentMean",
                        view: "segmentTrack",
                        viewSelector: {
                            scope: [],
                            view: "segmentTrack",
                        },
                        field: "segmentMean",
                        viewTitle: "Segment Track",
                        dataType: "quantitative",
                        description: "Segment Track",
                        supportedAggregations: ["count", "variance"],
                        selectionIds: ["brush-1"],
                    },
                ],
            }),
            {
                workflowType: "deriveMetadataFromSelection",
                selectionId: "brush-1",
                aggregation: "variance",
            }
        );

        expect(result.status).toBe("needs_clarification");
        if (result.status === "needs_clarification") {
            expect(result.request.slot).toBe("fieldId");
            expect(result.request.message).toContain("beta (Beta Track)");
            expect(result.request.message).toContain(
                "segmentMean (Segment Track)"
            );
        }
    });

    it("asks for the aggregation when the field supports multiple options", () => {
        const result = resolveSelectionAggregationWorkflow(createContext(), {
            workflowType: "deriveMetadataFromSelection",
            selectionId: "brush-1",
            fieldId: "betaTrack/beta",
        });

        expect(result.status).toBe("needs_clarification");
        if (result.status === "needs_clarification") {
            expect(result.request.slot).toBe("aggregation");
            expect(result.request.options).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ value: "weightedMean" }),
                    expect.objectContaining({ value: "variance" }),
                ])
            );
        }
    });

    it("rejects requests without an active interval selection", () => {
        const result = resolveSelectionAggregationWorkflow(
            createContext({
                selections: [],
            }),
            {
                workflowType: "createBoxplotFromSelection",
            }
        );

        expect(result).toEqual(
            expect.objectContaining({
                status: "error",
                message: expect.stringContaining(
                    "No active interval selection"
                ),
            })
        );
    });
});
