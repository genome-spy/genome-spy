// @ts-check
import { describe, expect, test } from "vitest";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import { getUnavailablePointQueryViews } from "./contextMenuBuilder.js";

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
});
