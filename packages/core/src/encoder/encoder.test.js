import { describe, expect, test } from "vitest";

import { create } from "../view/testUtils.js";
import UnitView from "../view/unitView.js";

describe("Encoder", async () => {
    // This is an unideal solution because mark generates ChannelDefs
    // based on defaults.
    const unitView = await create(
        {
            data: { values: [{}] },
            mark: "rect",
            encoding: {
                x: { value: 0 },
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [0, 10], range: [0, 1] },
                },
            },
        },
        UnitView
    );
    unitView.mark.initializeEncoders();

    const encoders = unitView.mark.encoders;

    const datum = {
        a: 5,
        b: 6,
        c: "Pink Floyd",
    };

    test("The encoder object contains all channels", () =>
        expect(
            /** @type {import("../spec/channel.js").Channel[]} */ ([
                "x",
                "y",
            ]).every((channel) => typeof encoders[channel] === "function")
        ).toBeTruthy());

    test("Returns a value", () => expect(encoders.x(datum)).toEqual(0));

    test("Accesses a field and uses a scale", () =>
        expect(encoders.y(datum)).toBeCloseTo(0.5));

    test("Inverts a value", () => {
        expect(encoders.y.invert(0.5)).toBeCloseTo(5);
        expect(() => encoders.size.invert(123)).toThrow();
    });

    // TODO: Test indexer

    // TODO: Text ExprRef
});
