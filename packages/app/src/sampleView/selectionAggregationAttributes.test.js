// @ts-check
import { describe, expect, it } from "vitest";
import { buildSelectionAggregationAttributeIdentifier } from "./selectionAggregationAttributes.js";

describe("selectionAggregationAttributes", () => {
    it("builds the canonical interval aggregation attribute identifier", () => {
        expect(
            buildSelectionAggregationAttributeIdentifier({
                viewSelector: {
                    scope: [],
                    view: "track",
                },
                field: "beta",
                selectionSelector: {
                    scope: [],
                    param: "brush",
                },
                aggregation: "weightedMean",
            })
        ).toEqual({
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
                    op: "weightedMean",
                },
            },
        });
    });

    it("adds record filters to selection aggregation attributes", () => {
        expect(
            buildSelectionAggregationAttributeIdentifier({
                viewSelector: {
                    scope: [],
                    view: "mutations",
                },
                field: "VAF",
                selectionSelector: {
                    scope: [],
                    param: "brush",
                },
                aggregation: "max",
                recordFilter: {
                    field: "functionalCategory",
                    operator: "in",
                    values: ["frameshift"],
                },
            })
        ).toMatchObject({
            specifier: {
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
    });
});
