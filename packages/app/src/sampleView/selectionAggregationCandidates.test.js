// @ts-check
import { describe, expect, it } from "vitest";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import { getSelectionAggregationFieldInfos } from "./selectionAggregationCandidates.js";

describe("selectionAggregationCandidates", () => {
    it("discovers selector-based aggregation candidates for visible fields", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    {
                        sample: "S1",
                        gene: "EGFR",
                        zScore: 1.2,
                        consequence: "missense",
                    },
                    {
                        sample: "S2",
                        gene: "TP53",
                        zScore: -0.4,
                        consequence: "frameshift",
                    },
                ],
            },
            samples: {},
            spec: {
                name: "track",
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "gene", type: "nominal" },
                    fill: {
                        field: "zScore",
                        type: "quantitative",
                        description: "Z score",
                    },
                    stroke: {
                        field: "consequence",
                        type: "nominal",
                        description: "Variant consequence",
                    },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
        });

        const targetView = /** @type {any} */ (
            view.findDescendantByName("track")
        );
        const candidates = getSelectionAggregationFieldInfos(
            /** @type {any} */ (targetView),
            /** @type {any} */ (view),
            true
        );

        expect(candidates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    candidateId: "track:zScore",
                    viewSelector: {
                        scope: [],
                        view: "track",
                    },
                    viewTitle: expect.any(String),
                    field: "zScore",
                    type: "quantitative",
                    description: "Z score",
                    supportedAggregations: expect.arrayContaining([
                        "count",
                        "min",
                        "max",
                        "weightedMean",
                        "variance",
                    ]),
                    filterableFields: expect.arrayContaining([
                        {
                            channel: "fill",
                            field: "zScore",
                            type: "quantitative",
                            description: "Z score",
                        },
                        {
                            channel: "stroke",
                            field: "consequence",
                            type: "nominal",
                            description: "Variant consequence",
                        },
                    ]),
                }),
            ])
        );
    });

    it("uses itemCount for synthetic item aggregation candidates", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "S1", pos: 1 },
                    { sample: "S2", pos: 2 },
                ],
            },
            samples: {},
            spec: {
                name: "track",
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "pos", type: "quantitative" },
                },
            },
        };

        const { view } = await createSampleViewForTest({ spec });
        const targetView = /** @type {any} */ (
            view.findDescendantByName("track")
        );
        const candidates = getSelectionAggregationFieldInfos(
            /** @type {any} */ (targetView),
            /** @type {any} */ (view),
            true
        );

        expect(candidates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "Items",
                    supportedAggregations: ["itemCount"],
                }),
            ])
        );
    });
});
