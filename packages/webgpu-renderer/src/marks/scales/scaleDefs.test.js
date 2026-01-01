import { describe, expect, it } from "vitest";
import {
    getScaleInputRule,
    getScaleOutputType,
    getScaleUniformDef,
    isContinuousScale,
    isScaleSupported,
} from "./scaleDefs.js";
import {
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../wgsl/prefixes.js";

describe("scaleDefs", () => {
    it("recognizes supported scales", () => {
        expect(isScaleSupported("linear")).toBe(true);
        expect(isScaleSupported("nope")).toBe(false);
    });

    it("tracks continuous scales", () => {
        expect(isContinuousScale("linear")).toBe(true);
        expect(isContinuousScale("band")).toBe(false);
    });

    it("derives output types", () => {
        expect(getScaleOutputType("linear", "u32")).toBe("f32");
        expect(getScaleOutputType("ordinal", "u32")).toBe("u32");
    });

    it("exposes uniform params per scale", () => {
        const logDef = getScaleUniformDef("log");
        expect(logDef.domainRange).toBe(true);
        expect(logDef.params.map((param) => param.prefix)).toEqual([
            SCALE_BASE_PREFIX,
        ]);

        const powDef = getScaleUniformDef("pow");
        expect(powDef.params.map((param) => param.prefix)).toEqual([
            SCALE_EXPONENT_PREFIX,
        ]);

        const symlogDef = getScaleUniformDef("symlog");
        expect(symlogDef.params.map((param) => param.prefix)).toEqual([
            SCALE_CONSTANT_PREFIX,
        ]);

        const bandDef = getScaleUniformDef("band");
        expect(bandDef.params.map((param) => param.prefix)).toEqual([
            SCALE_PADDING_INNER_PREFIX,
            SCALE_PADDING_OUTER_PREFIX,
            SCALE_ALIGN_PREFIX,
            SCALE_BAND_PREFIX,
        ]);
    });

    it("defaults input rules for unknown scale types", () => {
        expect(getScaleInputRule("identity")).toBe("any");
    });

    it("treats band scales as u32 input", () => {
        expect(getScaleInputRule("band")).toBe("u32");
    });
});
