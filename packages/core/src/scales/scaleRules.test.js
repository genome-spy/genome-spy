import { describe, expect, test } from "vitest";

import {
    applyLockedProperties,
    getDefaultScaleType,
    validateScaleTypeCompatibility,
} from "./scaleRules.js";

describe("scaleRules", () => {
    test("default scale types follow channel and data type", () => {
        expect(getDefaultScaleType("x", "quantitative")).toBe("linear");
        expect(getDefaultScaleType("x", "index")).toBe("index");
        expect(getDefaultScaleType("color", "ordinal")).toBe("ordinal");
        expect(getDefaultScaleType("dx", "quantitative")).toBe("null");
    });

    test("incompatible channel/type combinations throw", () => {
        expect(() => getDefaultScaleType("color", "locus")).toThrow(
            "color does not support locus data type."
        );
    });

    test("explicit scale type compatibility follows index-like data types", () => {
        expect(() =>
            validateScaleTypeCompatibility(
                "x",
                "locus",
                "linear",
                "encoding.x.scale.type"
            )
        ).toThrow(
            'encoding.x.scale.type "linear" is incompatible with "locus" data.'
        );

        expect(() =>
            validateScaleTypeCompatibility(
                "color",
                "nominal",
                "locus",
                "encoding.color.scale.type"
            )
        ).toThrow(
            'Index and locus scales are only supported on positional channels (x/y). Channel "color" resolves to scale type "locus".'
        );
    });

    test("locked properties apply only for intended channels", () => {
        /** @type {import("../spec/scale.js").Scale} */
        const props = { type: "linear" };
        applyLockedProperties(props, "x");
        expect(props.range).toEqual([0, 1]);

        /** @type {import("../spec/scale.js").Scale} */
        const opacityProps = { type: "linear" };
        applyLockedProperties(opacityProps, "opacity");
        expect(opacityProps.clamp).toBe(true);

        /** @type {import("../spec/scale.js").Scale} */
        const explicitOpacityProps = { type: "linear", clamp: false };
        applyLockedProperties(explicitOpacityProps, "opacity");
        expect(explicitOpacityProps.clamp).toBe(false);

        /** @type {import("../spec/scale.js").Scale} */
        const ordinalProps = { type: "ordinal" };
        applyLockedProperties(ordinalProps, "x");
        expect(ordinalProps.range).toBeUndefined();
    });
});
