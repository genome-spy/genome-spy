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
});
