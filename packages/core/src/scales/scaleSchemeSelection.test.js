import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";

/**
 * @param {import("../spec/channel.js").Type} type
 */
function resolveColorScale(type) {
    return resolveScalePropsBase({
        channel: "color",
        dataType: type,
        members: new Set([
            /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
                channel: "color",
                view: /** @type {any} */ ({}),
                channelDef: {},
                contributesToDomain: true,
            }),
        ]),
        isExplicitDomain: false,
        configScopes: [
            INTERNAL_DEFAULT_CONFIG,
            {
                scale: {
                    nominalColorScheme: "set3",
                    ordinalColorScheme: "purples",
                    quantitativeColorScheme: "inferno",
                },
            },
        ],
    });
}

describe("scale scheme selection", () => {
    test("nominal uses nominalColorScheme", () => {
        expect(resolveColorScale("nominal").scheme).toBe("set3");
    });

    test("ordinal uses ordinalColorScheme", () => {
        expect(resolveColorScale("ordinal").scheme).toBe("purples");
    });

    test("quantitative uses quantitativeColorScheme", () => {
        expect(resolveColorScale("quantitative").scheme).toBe("inferno");
    });
});
