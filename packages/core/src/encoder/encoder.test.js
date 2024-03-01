import { describe, expect, test } from "vitest";

import ScaleResolution from "../view/scaleResolution.js";
import { createAccessor } from "./accessor.js";
import ParamMediator from "../view/paramMediator.js";
import { createEncoder } from "./encoder.js";

describe("Encoder", async () => {
    /** @type {import("../spec/channel.js").Encoding} */
    const encoding = {
        x: { value: 42 },
        y: {
            field: "a",
            type: "quantitative",
            scale: { domain: [0, 100], range: [0, 1] },
        },
    };

    const xAccessor = createAccessor("x", encoding.x, new ParamMediator());
    const yAccessor = createAccessor("y", encoding.y, new ParamMediator());

    const scaleSource = (
        /** @type {import("../spec/channel.js").ChannelWithScale} */ channel
    ) => {
        const resolution = new ScaleResolution(channel);
        // @ts-ignore
        resolution.pushUnitView(undefined, channel, encoding[channel]);
        return resolution.scale;
    };

    const xEncoder = createEncoder(xAccessor, scaleSource);
    const yEncoder = createEncoder(yAccessor, scaleSource);

    const datum = {
        a: 100,
        b: 6,
        c: "Pink Floyd",
    };

    test("Returns a value", () => expect(xEncoder(datum)).toEqual(42));

    test("Accesses a field and uses a scale", () =>
        expect(yEncoder(datum)).toBe(1));

    test("Inverts a value", () => {
        expect(yEncoder.invert(0.5)).toBeCloseTo(50);
        expect(() => xEncoder.invert(123)).toThrow();
    });

    // TODO: Test indexer

    // TODO: Text ExprRef
});
