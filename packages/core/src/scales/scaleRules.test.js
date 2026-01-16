import { describe, expect, test } from "vitest";

import { applyLockedProperties, getDefaultScaleType } from "./scaleRules.js";

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
        const ordinalProps = { type: "ordinal" };
        applyLockedProperties(ordinalProps, "x");
        expect(ordinalProps.range).toBeUndefined();
    });
});
