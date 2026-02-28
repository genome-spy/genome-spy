import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";

/**
 * @param {import("../spec/channel.js").ChannelWithScale} [channel]
 * @param {import("../spec/scale.js").Scale} [scale]
 * @param {import("../spec/mark.js").MarkType} [markType]
 * @returns {import("./scaleResolution.js").ScaleResolutionMember}
 */
function createMember(channel = "color", scale, markType = "point") {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel,
        view: /** @type {any} */ ({
            getMarkType: () => markType,
        }),
        channelDef: scale ? { scale } : {},
        contributesToDomain: true,
    });
}

describe("scale config defaults", () => {
    test("uses nominal color scheme from config defaults", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "nominal",
            members: new Set([createMember()]),
            isExplicitDomain: false,
            configScopes: [INTERNAL_DEFAULT_CONFIG],
        });

        expect(props.scheme).toBe("tableau10");
    });

    test("allows overriding color scheme by data type", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "nominal",
            members: new Set([createMember()]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        nominalColorScheme: "category20",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("category20");
    });

    test("uses configurable shape range defaults", () => {
        const props = resolveScalePropsBase({
            channel: "shape",
            dataType: "nominal",
            members: new Set([createMember()]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    range: {
                        shape: ["triangle-up", "diamond"],
                    },
                },
            ],
        });

        expect(props.range).toEqual(["triangle-up", "diamond"]);
    });

    test("explicit scale properties override config defaults", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "nominal",
            members: new Set([
                createMember("color", {
                    scheme: "viridis",
                }),
            ]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        nominalColorScheme: "category20",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("viridis");
    });

    test("scale.zoom config overrides default zoom policy", () => {
        const props = resolveScalePropsBase({
            channel: "x",
            dataType: "index",
            members: new Set([createMember()]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        zoom: false,
                    },
                },
            ],
        });

        expect(props.zoom).toBe(false);
    });

    test("scale.clamp config can override opacity clamp default", () => {
        const props = resolveScalePropsBase({
            channel: "opacity",
            dataType: "quantitative",
            members: new Set([createMember()]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        clamp: false,
                    },
                },
            ],
        });

        expect(props.clamp).toBe(false);
    });

    test("scale.reverse config can override discrete y default reversal", () => {
        const props = resolveScalePropsBase({
            channel: "y",
            dataType: "nominal",
            members: new Set([createMember("y")]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        reverse: false,
                    },
                },
            ],
        });

        expect(props.reverse).toBe(false);
    });

    test("positional channels always use unit range even with configured range", () => {
        const props = resolveScalePropsBase({
            channel: "x",
            dataType: "quantitative",
            members: new Set([
                createMember("x", {
                    range: [10, 20],
                }),
            ]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        range: [5, 15],
                    },
                },
            ],
        });

        expect(props.range).toEqual([0, 1]);
    });

    test("quantitative color on rect uses heatmap scheme default", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            members: new Set([createMember("color", undefined, "rect")]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        quantitativeColorScheme: "viridis",
                        quantitativeHeatmapColorScheme: "magma",
                        quantitativeRampColorScheme: "blues",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("magma");
    });

    test("quantitative color on non-rect uses ramp scheme default", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            members: new Set([createMember("color", undefined, "point")]),
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        quantitativeColorScheme: "viridis",
                        quantitativeHeatmapColorScheme: "magma",
                        quantitativeRampColorScheme: "blues",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("blues");
    });

    test("quantitative color scheme falls back when heatmap/ramp keys are missing", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            members: new Set([createMember("color", undefined, "rect")]),
            isExplicitDomain: false,
            configScopes: [
                {
                    scale: {
                        quantitativeColorScheme: "inferno",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("inferno");
    });
});
