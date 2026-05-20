// @ts-check
import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getSelectionFeatureFieldSummaryTool } from "./selectionFeatureFieldSummaryTool.js";

describe("getSelectionFeatureFieldSummaryTool", () => {
    it("summarizes quantitative raw feature fields for a selection candidate", () => {
        const getSelectionFeatureFieldValues = vi.fn(() => [2, 4, 6]);
        const runtime = createRuntime(getSelectionFeatureFieldValues);

        const result = getSelectionFeatureFieldSummaryTool(runtime, {
            candidateId: "brush@track:VAF",
            field: "CADD",
        });

        expect(getSelectionFeatureFieldValues).toHaveBeenCalledWith(
            { scope: [], view: "track" },
            { scope: [], param: "brush" },
            "CADD"
        );
        expect(result.content).toMatchObject({
            kind: "selection_feature_field_summary",
            candidateId: "brush@track:VAF",
            field: "CADD",
            dataType: "quantitative",
            featureCount: 3,
            min: 2,
            max: 6,
            mean: 4,
        });
    });

    it("rejects fields outside the candidate filterableFields", () => {
        const runtime = createRuntime(vi.fn(() => []));

        expect(() =>
            getSelectionFeatureFieldSummaryTool(runtime, {
                candidateId: "brush@track:VAF",
                field: "missing",
            })
        ).toThrow(ToolCallRejectionError);
    });
});

/**
 * @param {(viewSelector: any, selectionSelector: any, field: string) => unknown[]} getSelectionFeatureFieldValues
 * @returns {any}
 */
function createRuntime(getSelectionFeatureFieldValues) {
    return {
        agentApi: {
            getSelectionFeatureFieldValues,
        },
        getAgentVolatileContext: () => ({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:VAF",
                        view: "track",
                        viewSelector: { scope: [], view: "track" },
                        field: "VAF",
                        dataType: "quantitative",
                        selectionSelector: { scope: [], param: "brush" },
                        supportedAggregations: ["max"],
                        filterableFields: [
                            {
                                field: "CADD",
                                dataType: "quantitative",
                                description: "CADD score",
                            },
                            {
                                field: "functionalCategory",
                                dataType: "nominal",
                            },
                        ],
                    },
                ],
            },
        }),
    };
}
