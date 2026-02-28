import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";

/**
 * @param {import("../spec/scale.js").Scale} [scale]
 * @returns {import("./scaleResolution.js").ScaleResolutionMember}
 */
function createMember(scale) {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel: /** @type {import("../spec/channel.js").ChannelWithScale} */ (
            "color"
        ),
        view: /** @type {any} */ ({}),
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
                createMember({
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
});
