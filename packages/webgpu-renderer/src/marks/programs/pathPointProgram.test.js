import { describe, expect, it } from "vitest";

import PathPointProgram from "./pathPointProgram.js";

describe("PathPointProgram", () => {
    it("rotates positive angles clockwise in screen space", () => {
        const shaderBody = Object.getOwnPropertyDescriptor(
            PathPointProgram.prototype,
            "shaderBody"
        ).get.call({});

        expect(shaderBody).toContain(
            "let angle = getScaled_angle(i) * PI / 180.0"
        );
    });

    it("clamps strokes to the representable atlas distance", () => {
        const shaderBody = Object.getOwnPropertyDescriptor(
            PathPointProgram.prototype,
            "shaderBody"
        ).get.call({});

        expect(shaderBody).toContain("if (diameter <= 0.0)");
        expect(shaderBody).toContain(
            "params.uSpread * devicePixelsPerAtlas - AA_COVERAGE_RADIUS_PIXELS"
        );
        expect(shaderBody).toContain(
            "let halfStrokeWidth = min(strokeWidth * 0.5, maxHalfStrokeWidth)"
        );
    });
});
