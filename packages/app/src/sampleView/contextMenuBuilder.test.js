// @ts-check
import { describe, expect, test } from "vitest";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import {
    buildIntervalAggregationMenu,
    getUnavailablePointQueryViews,
} from "./contextMenuBuilder.js";

describe("contextMenuBuilder", () => {
    test("reports unnamed categorical point-query views as unavailable", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "S1", gene: "EGFR", zScore: 1.2 },
                    { sample: "S2", gene: "TP53", zScore: -0.4 },
                ],
            },
            samples: {},
            spec: {
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "gene", type: "nominal" },
                    fill: { field: "zScore", type: "quantitative" },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
        });

        /** @type {import("@genome-spy/core/view/unitView.js").default | undefined} */
        let targetView;
        view.visit((child) => {
            const fillDef = /** @type {any} */ (child.getEncoding?.()?.fill);
            if (
                child.getEncoding &&
                fillDef &&
                "field" in fillDef &&
                fillDef.field === "zScore"
            ) {
                targetView =
                    /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
                        child
                    );
            }
        });

        expect(targetView).toBeDefined();
        expect(
            getUnavailablePointQueryViews(targetView, /** @type {any} */ (view))
        ).toEqual([targetView]);
    });

    test("adds filtered aggregation entry when filterable fields are available", () => {
        const menu = buildIntervalAggregationMenu({
            fieldInfo: /** @type {any} */ ({
                field: "VAF",
                viewSelector: { scope: [], view: "mutations" },
                supportedAggregations: [],
                filterableFields: [
                    {
                        field: "functionalCategory",
                        type: "nominal",
                    },
                ],
            }),
            selectionIntervalComplex: [1, 2],
            sample: /** @type {any} */ (undefined),
            sampleHierarchy: /** @type {any} */ ({}),
            attributeInfoSource: /** @type {any} */ ({}),
            attributeType: "VALUE_AT_LOCUS",
            sampleView: /** @type {any} */ ({}),
        });

        expect(menu).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    label: "Filter features and aggregate...",
                    callback: expect.any(Function),
                }),
            ])
        );
    });
});
