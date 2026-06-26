import { describe, expect, test } from "vitest";
import { getConfiguredAxisDefaults } from "./axisConfig.js";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import { resolveThemeSelection } from "./themes.js";

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

    test("internal defaults express adaptive tick counts through axis length", () => {
        const xDefaults = getConfiguredAxisDefaults([INTERNAL_DEFAULT_CONFIG], {
            channel: "x",
            orient: "bottom",
            type: "quantitative",
        });
        const yDefaults = getConfiguredAxisDefaults([INTERNAL_DEFAULT_CONFIG], {
            channel: "y",
            orient: "left",
            type: "quantitative",
        });
        const locusDefaults = getConfiguredAxisDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            {
                channel: "x",
                orient: "bottom",
                type: "locus",
            }
        );

        expect(xDefaults.tickCount).toEqual({
            expr: "round(axisLength / (30 + 55 * smoothstep(100, 700, axisLength)))",
        });
        expect(yDefaults.tickCount).toEqual(xDefaults.tickCount);
        expect(locusDefaults.tickCount).toEqual({
            expr: "round(axisLength / 85)",
        });
    });

    test("vegalite theme uses Vega-Lite axis tick count spacing", () => {
        const theme = resolveThemeSelection("vegalite");
        const xDefaults = getConfiguredAxisDefaults(
            [INTERNAL_DEFAULT_CONFIG, theme],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );
        const yDefaults = getConfiguredAxisDefaults(
            [INTERNAL_DEFAULT_CONFIG, theme],
            {
                channel: "y",
                orient: "left",
                type: "quantitative",
            }
        );

        expect(xDefaults.tickCount).toEqual({
            expr: "ceil(axisLength / 40)",
        });
        expect(yDefaults.tickCount).toEqual(xDefaults.tickCount);
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

    test("style buckets merge after axis buckets", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axis: { tickColor: "blue" },
                    axisBottom: { labelColor: "orange" },
                    style: {
                        emphasis: { tickColor: "purple" },
                        override: { tickColor: "black", domainColor: "pink" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
                style: ["emphasis", "override"],
            }
        );

        expect(defaults.tickColor).toBe("black");
        expect(defaults.labelColor).toBe("orange");
        expect(defaults.domainColor).toBe("pink");
    });

    test("axis bucket styles contribute defaults", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axisX: { style: "emphasis" },
                    style: {
                        emphasis: { tickColor: "purple", labelColor: "orange" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).toBe("purple");
        expect(defaults.labelColor).toBe("orange");
    });

    test("axis bucket styles resolve inherited style buckets", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    style: {
                        emphasis: { tickColor: "purple" },
                    },
                },
                { axisX: { style: "emphasis" } },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).toBe("purple");
    });

    test("local style buckets override inherited axis bucket styles", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    style: {
                        emphasis: { tickColor: "purple" },
                    },
                },
                {
                    axisX: { style: "emphasis" },
                    style: {
                        emphasis: { tickColor: "red", labelColor: "orange" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).toBe("red");
        expect(defaults.labelColor).toBe("orange");
    });

    test("axis bucket properties override axis bucket style", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axisX: { style: "emphasis", tickColor: "blue" },
                    style: {
                        emphasis: { tickColor: "purple", labelColor: "orange" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).toBe("blue");
        expect(defaults.labelColor).toBe("orange");
    });

    test("null axis bucket style clears inherited style defaults", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axisX: { style: "emphasis" },
                    style: {
                        emphasis: { tickColor: "purple" },
                    },
                },
                { axisX: { style: null } },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
            }
        );

        expect(defaults.tickColor).not.toBe("purple");
    });

    test("explicit axis style overrides bucket styles", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axisX: { style: "emphasis" },
                    style: {
                        emphasis: { tickColor: "purple" },
                        override: { tickColor: "black" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
                style: "override",
            }
        );

        expect(defaults.tickColor).toBe("black");
    });

    test("null explicit axis style clears inherited bucket styles", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    axisX: { style: "emphasis" },
                    style: {
                        emphasis: { tickColor: "purple" },
                    },
                },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
                style: null,
            }
        );

        expect(defaults.tickColor).not.toBe("purple");
    });

    test("closest scope wins for the same style bucket", () => {
        const defaults = getConfiguredAxisDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                { style: { emphasis: { tickColor: "blue" } } },
                { style: { emphasis: { tickColor: "red" } } },
            ],
            {
                channel: "x",
                orient: "bottom",
                type: "quantitative",
                style: "emphasis",
            }
        );

        expect(defaults.tickColor).toBe("red");
    });
});
