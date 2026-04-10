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
});
