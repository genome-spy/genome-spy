// @ts-check
import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getSelectionRecordFieldSummaryTool } from "./selectionRecordFieldSummaryTool.js";

describe("getSelectionRecordFieldSummaryTool", () => {
    it("summarizes quantitative raw record fields for a selection candidate", () => {
        const getSelectionRecordFieldValues = vi.fn(() => [2, 4, 6]);
        const runtime = createRuntime(getSelectionRecordFieldValues);

        const result = getSelectionRecordFieldSummaryTool(runtime, {
            candidateId: "brush@track:VAF",
            field: "CADD",
        });

        expect(getSelectionRecordFieldValues).toHaveBeenCalledWith(
            { scope: [], view: "track" },
            { scope: [], param: "brush" },
            "CADD"
        );
        expect(result.content).toMatchObject({
            kind: "selection_record_field_summary",
            candidateId: "brush@track:VAF",
            field: "CADD",
            dataType: "quantitative",
            recordCount: 3,
            min: 2,
            max: 6,
            mean: 4,
        });
    });

    it("rejects fields outside the candidate filterableFields", () => {
        const runtime = createRuntime(vi.fn(() => []));

        expect(() =>
            getSelectionRecordFieldSummaryTool(runtime, {
                candidateId: "brush@track:VAF",
                field: "missing",
            })
        ).toThrow(ToolCallRejectionError);
    });
});

/**
 * @param {(viewSelector: any, selectionSelector: any, field: string) => unknown[]} getSelectionRecordFieldValues
 * @returns {any}
 */
function createRuntime(getSelectionRecordFieldValues) {
    return {
        agentApi: {
            getSelectionRecordFieldValues,
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
