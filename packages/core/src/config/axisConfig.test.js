import { describe, expect, test } from "vitest";
import { getConfiguredAxisDefaults } from "./axisConfig.js";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";

describe("axisConfig", () => {
    test("merges axis buckets in precedence order", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axis: { tickColor: "blue" },
                    axisX: { tickSize: 11 },
                    axisBottom: { labelColor: "orange" },
                    axisQuantitative: { domainColor: "pink" },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).toBe("blue");
        expect(defaults.tickSize).toBe(11);
        expect(defaults.labelColor).toBe("orange");
        expect(defaults.domainColor).toBe("pink");
    });

    test("closest scope wins for same axis bucket", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                { axisX: { tickSize: 7 } },
                { axisX: { tickSize: 13 } },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickSize).toBe(13);
    });

    test("locus bucket contributes genome-specific defaults", () => {
        const defaults = getConfiguredAxisDefaults([INTERNAL_DEFAULT_CONFIG], {
            channel: "x",
            orient: "bottom",
            type: "locus",
        });

        expect(defaults.chromTicks).toBe(true);
        expect(defaults.chromGridDash).toEqual([1, 5]);
    });
});
