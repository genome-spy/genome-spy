// @ts-check
import { describe, expect, test } from "vitest";
import {
    createSelectionExpansionIntentOptions,
    MULTIPLE_POINT_SELECTION_PARAMS_REASON,
    resolveSelectionExpansionContext,
} from "./selectionExpansionContext.js";

/**
 * @param {{
 *   explicitName?: string,
 *   encoding: any,
 *   params: [string, any][]
 * }} config
 */
function createMockUnitView(config) {
    const explicitName = config.explicitName ?? "mutations";
    const { encoding, params } = config;

    /** @type {any} */
    const view = {
        explicitName,
        paramRuntime: {
            paramConfigs: new Map(params),
        },
        getEncoding: () => encoding,
        getDataAncestors: () => [],
        visit: (visitor) => visitor(view),
    };

    return view;
}

describe("selectionExpansionContext", () => {
    test("resolves context for a single multi-point selection parameter", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
                sample: { field: "sample" },
                color: { field: "Func", type: "nominal" },
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        const hover = {
            mark: { unitView: hoveredView },
            datum: {
                id: "v1",
                sample: "S1",
                Func: "missense",
            },
        };

        const resolution = resolveSelectionExpansionContext(hoveredView, hover);
        expect(resolution.status).toBe("available");
        if (resolution.status !== "available") {
            return;
        }

        expect(resolution.context.selector).toEqual({
            scope: [],
            param: "variantClick",
        });
        expect(resolution.context.originViewSelector).toEqual({
            scope: [],
            view: "mutations",
        });
        expect(resolution.context.originKeyFields).toEqual(["id"]);
        expect(resolution.context.originKeyTuple).toEqual(["v1"]);
        expect(resolution.context.defaultPartitionBy).toEqual(["sample"]);
        expect(resolution.context.defaultScopeLabel).toBe("this sample");
    });

    test("returns disabled when multiple multi-point selection parameters exist", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
                [
                    "secondClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        const hover = {
            mark: { unitView: hoveredView },
            datum: {
                id: "v1",
            },
        };

        const resolution = resolveSelectionExpansionContext(hoveredView, hover);
        expect(resolution).toEqual({
            status: "disabled",
            reason: MULTIPLE_POINT_SELECTION_PARAMS_REASON,
        });
    });

    test("uses encoded categorical fields first when building options", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
                sample: { field: "sample" },
                color: { field: "Func", type: "nominal" },
                x: { field: "POS", type: "quantitative" },
                shape: {
                    condition: { field: "Consequence", type: "nominal" },
                    value: "circle",
                },
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        const options = createSelectionExpansionIntentOptions({
            hoveredView,
            hoveredDatum: {
                id: "v1",
                sample: "S1",
                CHROM: "chr7",
                Func: "genic_other",
                Consequence: "missense",
                POS: 42,
            },
            selector: { scope: [], param: "variantClick" },
            originViewSelector: { scope: [], view: "mutations" },
            originKeyFields: ["id"],
            originKeyTuple: ["v1"],
            defaultPartitionBy: ["sample"],
            defaultScopeLabel: "this sample",
        });

        expect(options.map((option) => option.label)).toEqual([
            "Match Func = genic_other in this sample",
            "Match Func = genic_other across all",
            "Match Consequence = missense in this sample",
            "Match Consequence = missense across all",
        ]);
        expect(options[0].payload.partitionBy).toEqual(["sample"]);
        expect(options[1].payload.partitionBy).toBeUndefined();
    });

    test("falls back to non-empty string and boolean fields", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
                x: { field: "POS", type: "quantitative" },
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        const options = createSelectionExpansionIntentOptions({
            hoveredView,
            hoveredDatum: {
                id: "v1",
                category: "hotspot",
                flagged: true,
                empty: "   ",
                _private: "hidden",
            },
            selector: { scope: [], param: "variantClick" },
            originViewSelector: { scope: [], view: "mutations" },
            originKeyFields: ["id"],
            originKeyTuple: ["v1"],
            defaultPartitionBy: undefined,
            defaultScopeLabel: "this scope",
        });

        expect(options.map((option) => option.label)).toEqual([
            "Match category = hotspot in this scope",
            "Match flagged = true in this scope",
        ]);
    });
});
