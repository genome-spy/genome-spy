import { describe, expect, test } from "vitest";
import LayerView from "../view/layerView.js";
import { create } from "../view/testUtils.js";

/** @typedef {import("../view/unitView.js").default} UnitView */

/**
 * @param {import("../spec/channel.js").PositionDef | import("../spec/channel.js").Position2Def} channelDef
 */
function getBand(channelDef) {
    return /** @type {import("../spec/channel.js").BandMixins} */ (channelDef)
        .band;
}

describe("TextMark", () => {
    test("uses interval edges for ranged index text", async () => {
        const view = await create(
            {
                data: {
                    values: [{ from: 0, to: 2, label: "[0, 2)" }],
                },
                encoding: {
                    x: { field: "from", type: "index" },
                    x2: { field: "to" },
                },
                layer: [
                    {
                        mark: "text",
                        encoding: {
                            text: { field: "label", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const textView = /** @type {UnitView} */ (view.children[0]);
        textView.mark.initializeEncoders();

        // Ranged text on index/band-like scales must use interval edges rather
        // than band centers so the label is centered inside the rect span.
        expect(getBand(textView.mark.encoding.x)).toBe(0);
        expect(getBand(textView.mark.encoding.x2)).toBe(0);
    });

    test("keeps centered band positioning for ranged nominal text", async () => {
        const view = await create(
            {
                data: {
                    values: [{ start: "A", end: "B", label: "A-B" }],
                },
                encoding: {
                    x: { field: "start", type: "nominal" },
                    x2: { field: "end" },
                },
                layer: [
                    {
                        mark: "text",
                        encoding: {
                            text: { field: "label", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const textView = /** @type {UnitView} */ (view.children[0]);
        textView.mark.initializeEncoders();

        expect(getBand(textView.mark.encoding.x)).toBeUndefined();
        expect(getBand(textView.mark.encoding.x2)).toBeUndefined();
    });
});
