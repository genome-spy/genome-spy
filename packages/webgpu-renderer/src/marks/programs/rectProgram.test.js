import { describe, expect, it } from "vitest";

import { determineRectAntialiasing } from "./rectProgram.js";

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
});
