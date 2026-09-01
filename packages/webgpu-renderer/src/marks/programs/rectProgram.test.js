import { describe, expect, it } from "vitest";

import RectProgram, { determineRectAntialiasing } from "./rectProgram.js";

const EDGE_CHANNELS = [
    "strokeWidth",
    "cornerRadiusTopRight",
    "cornerRadiusBottomRight",
    "cornerRadiusTopLeft",
    "cornerRadiusBottomLeft",
    "shadowOpacity",
    "hatchPattern",
];

function plainChannels() {
    return Object.fromEntries(
        EDGE_CHANNELS.map((name) => [name, { value: 0 }])
    );
}

describe("rectangle antialiasing", () => {
    it("uses multisampling only for static plain rectangles", () => {
        expect(determineRectAntialiasing(plainChannels())).toBe("multisample");

        for (const name of EDGE_CHANNELS) {
            expect(
                determineRectAntialiasing({
                    ...plainChannels(),
                    [name]: { value: 1 },
                })
            ).toBe("shader");
        }
    });

    it.each([
        ["uniform", { value: 0, dynamic: true }],
        ["series", { data: new Float32Array([0]), type: "f32" }],
        [
            "conditional",
            {
                value: 0,
                conditions: [
                    { when: { selection: "x" }, channel: { value: 1 } },
                ],
            },
        ],
        [
            "scaled",
            {
                value: 0,
                scale: { type: "identity", definition: {} },
            },
        ],
    ])("uses shader coverage for a %s edge channel", (_name, channel) => {
        expect(
            determineRectAntialiasing({
                ...plainChannels(),
                strokeWidth: /** @type {any} */ (channel),
            })
        ).toBe("shader");
    });

    it("specializes shader geometry and shading from the immutable mode", () => {
        const getShaderBody = Object.getOwnPropertyDescriptor(
            RectProgram.prototype,
            "shaderBody"
        ).get;
        const resolveAntialiasing = RectProgram.prototype._resolveAntialiasing;
        const plain = {
            _channels: plainChannels(),
            antialiasing: "multisample",
        };
        const dynamic = {
            _channels: {
                ...plainChannels(),
                strokeWidth: { value: 0, dynamic: true },
            },
            antialiasing: "shader",
        };

        expect(resolveAntialiasing.call(plain)).toBe("multisample");
        expect(getShaderBody.call(plain)).toContain(
            "const USE_MULTISAMPLE_EDGE_COVERAGE = true;"
        );
        expect(resolveAntialiasing.call(dynamic)).toBe("shader");
        expect(getShaderBody.call(dynamic)).toContain(
            "const USE_MULTISAMPLE_EDGE_COVERAGE = false;"
        );
        expect(getShaderBody.call(dynamic)).toContain(
            "decorationPadding = max(decorationPadding, 2.0 / globals.dpr);"
        );
    });
});
