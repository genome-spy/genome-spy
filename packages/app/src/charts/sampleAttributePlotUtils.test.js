// @ts-check
import { describe, expect, it } from "vitest";
import { getGroupColorScale } from "./sampleAttributePlotUtils.js";

describe("getGroupColorScale", () => {
    it("accepts numeric categorical domains and returns group-label strings", () => {
        const sampleView = createSampleView({
            type: "ordinal",
            domain: [1, 2],
            range: ["#111111", "#222222"],
        });

        expect(getGroupColorScale(sampleView)).toEqual({
            domain: ["1", "2"],
            range: ["#111111", "#222222"],
        });
    });
});

/**
 * @param {{
 *     type: string,
 *     domain: import("@genome-spy/core/spec/channel.js").Scalar[],
 *     range: string[]
 * }} params
 */
function createSampleView(params) {
    return /** @type {any} */ ({
        sampleHierarchy: {
            groupMetadata: [
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "category",
                    },
                },
            ],
        },
        compositeAttributeInfoSource: {
            getAttributeInfo: () => ({
                type: params.type,
                scale: {
                    domain: () => params.domain,
                    range: () => params.range,
                },
            }),
        },
    });
}
