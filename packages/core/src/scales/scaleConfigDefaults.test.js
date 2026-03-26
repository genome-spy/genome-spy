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
            orderedMembers: [createMember()],
            isExplicitDomain: false,
            configScopes: [INTERNAL_DEFAULT_CONFIG],
        });

        expect(props.scheme).toBe("tableau10");
    });

    test("allows overriding color scheme by data type", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "nominal",
            orderedMembers: [createMember()],
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
            orderedMembers: [createMember()],
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
            orderedMembers: [
                createMember("color", {
                    scheme: "viridis",
                }),
            ],
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
            orderedMembers: [createMember()],
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
            orderedMembers: [createMember()],
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
            orderedMembers: [createMember("y")],
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
            orderedMembers: [
                createMember("x", {
                    range: [10, 20],
                }),
            ],
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
            orderedMembers: [createMember("color", undefined, "rect")],
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        quantitativeColorScheme: "viridis",
                    },
                    range: {
                        heatmap: "magma",
                        ramp: "blues",
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
            orderedMembers: [createMember("color", undefined, "point")],
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        quantitativeColorScheme: "viridis",
                    },
                    range: {
                        heatmap: "magma",
                        ramp: "blues",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("blues");
    });

    test("quantitative color scheme falls back when range slots are missing", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            orderedMembers: [createMember("color", undefined, "rect")],
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

    test("quantitative color with domainMid uses diverging range slot", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            orderedMembers: [
                createMember(
                    "color",
                    /** @type {import("../spec/scale.js").Scale} */ ({
                        domainMid: 0,
                    }),
                    "rect"
                ),
            ],
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    scale: {
                        quantitativeColorScheme: "inferno",
                    },
                    range: {
                        diverging: "redblue",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("redblue");
    });

    test("named color range resolves through config.range and overrides scheme", () => {
        const props = resolveScalePropsBase({
            channel: "color",
            dataType: "quantitative",
            orderedMembers: [
                createMember("color", {
                    range: "heatmap",
                    scheme: "inferno",
                }),
            ],
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    range: {
                        heatmap: "magma",
                    },
                },
            ],
        });

        expect(props.scheme).toBe("magma");
        expect(props.range).toBeUndefined();
    });

    test("named shape range resolves through config.range", () => {
        const props = resolveScalePropsBase({
            channel: "shape",
            dataType: "nominal",
            orderedMembers: [
                createMember("shape", {
                    range: "shape",
                }),
            ],
            isExplicitDomain: false,
            configScopes: [
                INTERNAL_DEFAULT_CONFIG,
                {
                    range: {
                        shape: ["diamond", "square"],
                    },
                },
            ],
        });

        expect(props.range).toEqual(["diamond", "square"]);
    });

    test("unknown named range throws a clear error", () => {
        expect(() =>
            resolveScalePropsBase({
                channel: "color",
                dataType: "quantitative",
                orderedMembers: [
                    createMember("color", {
                        range: "no-such-range",
                    }),
                ],
                isExplicitDomain: false,
                configScopes: [INTERNAL_DEFAULT_CONFIG],
            })
        ).toThrow('Unknown named scale range "no-such-range"');
    });
});
