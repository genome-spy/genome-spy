// @ts-check
import { describe, expect, it } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";

describe("buildSelectionAggregationAttribute", () => {
    it("materializes record filters into selection aggregation attributes", () => {
        const result = buildSelectionAggregationAttribute(
            createVolatileContext(),
            "brush@mutations:VAF",
            "max",
            {
                field: "functionalCategory",
                operator: "in",
                values: ["frameshift"],
            }
        );

        expect(result.attribute).toMatchObject({
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: {
                    scope: [],
                    view: "mutations",
                },
                field: "VAF",
                aggregation: {
                    op: "max",
                },
                recordFilter: {
                    field: "functionalCategory",
                    operator: "in",
                    values: ["frameshift"],
                },
            },
        });
        expect(result.title).toBe(
            "max(VAF where functionalCategory in [frameshift])"
        );
    });

    it("rejects record filters using fields outside filterableFields", () => {
        expect(() =>
            buildSelectionAggregationAttribute(
                createVolatileContext(),
                "brush@mutations:VAF",
                "max",
                {
                    field: "missing",
                    operator: "in",
                    values: ["frameshift"],
                }
            )
        ).toThrow(ToolCallRejectionError);
    });
});

/**
 * @returns {import("./types.js").AgentVolatileContext}
 */
function createVolatileContext() {
    return /** @type {import("./types.js").AgentVolatileContext} */ ({
        selectionAggregation: {
            fields: [
                {
                    candidateId: "brush@mutations:VAF",
                    view: "mutations",
                    viewSelector: {
                        scope: [],
                        view: "mutations",
                    },
                    field: "VAF",
                    dataType: "quantitative",
                    selectionSelector: {
                        scope: [],
                        param: "brush",
                    },
                    supportedAggregations: ["max"],
                    filterableFields: [
                        {
                            field: "functionalCategory",
                            dataType: "nominal",
                        },
                    ],
                },
            ],
        },
    });
}
