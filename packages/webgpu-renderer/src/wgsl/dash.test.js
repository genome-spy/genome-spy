import { describe, expect, it } from "vitest";
import DASH_WGSL from "./dash.wgsl.js";

describe("dash shader", () => {
    it("interprets dash patterns and offsets as logical pixels", () => {
        expect(DASH_WGSL).toContain("distancePx: f32, dashOffset: f32");
        expect(DASH_WGSL).toContain("let lenPx = f32(lenUnits);");
        expect(DASH_WGSL).toContain("let t = distancePx + dashOffset;");
        expect(DASH_WGSL).not.toContain("strokeWidth");
    });
});
