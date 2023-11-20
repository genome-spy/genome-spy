import { describe, expect, test } from "vitest";
import AccessorFactory from "./accessor.js";
import { scale as vegaScale } from "vega-scale";

import { createEncoder } from "./encoder.js";

describe("Encoder", () => {
    /** @type {Record<string, import("../view/viewUtils.js").ChannelDef>} */
    const encodingSpecs = {
        x: { value: 0 },
        y: { field: "a" },
        z: { datum: 2 },
        size: { value: 5 },
    };

    const scaleLinear = vegaScale("linear");

    /** @type {Record<string, import("./encoder.js").VegaScale>} */
    const scales = {
        y: scaleLinear().domain([0, 10]),
        z: scaleLinear().domain([0, 20]),
    };

    const accessorFactory = new AccessorFactory();

    /** @param {Record<string, import("../view/viewUtils.js").ChannelDef>} encoding */
    function createEncoders(encoding) {
        /** @type {Record<string, import("./encoder.js").Encoder>} */
        const encoders = {};
        for (const [channel, channelDef] of Object.entries(encoding)) {
            encoders[channel] = createEncoder(
                channelDef,
                scales[channel],
                accessorFactory.createAccessor(encodingSpecs[channel]),
                channel
            );
        }
        return encoders;
    }

    const datum = {
        a: 5,
        b: 6,
        c: "Pink Floyd",
    };

    test("Throws on a broken spec", () =>
        expect(() => createEncoders({ x: {} })).toThrow());

    const encoders = createEncoders(encodingSpecs);

    test("The encoder object contains all channels", () =>
        expect(
            ["x", "y", "z", "size"].every(
                (channel) => typeof encoders[channel] === "function"
            )
        ).toBeTruthy());

    test("Returns a value", () => expect(encoders.x(datum)).toEqual(0));

    test("Encodes and returns a constant using a scale", () =>
        expect(encoders.z(datum)).toBeCloseTo(0.1));

    test("Accesses a field and uses a scale", () =>
        expect(encoders.y(datum)).toBeCloseTo(0.5));

    /*
    test("Accesses a field on a secondary channel and uses the scale from the primary", () =>
        expect(encoders.y2(datum)).toBeCloseTo(0.6));
        */

    test("Constant encoder is annotated", () => {
        expect(encoders.y.constant).toBeFalsy();
        expect(encoders.z.constant).toBeTruthy();
        expect(encoders.size.constant).toBeTruthy();
    });

    test("Constant value encoder is annotated", () => {
        expect(encoders.y.constantValue).toBeFalsy();
        expect(encoders.z.constantValue).toBeFalsy();
        expect(encoders.size.constantValue).toBeTruthy();
    });

    test("Inverts a value", () => {
        expect(encoders.y.invert(0.5)).toBeCloseTo(5);
        expect(encoders.z.invert(0.5)).toBeCloseTo(10);
        // A value, no scale, can't invert
        expect(() => encoders.size.invert(123)).toThrow();
    });

    test("Accessors are provided", () => {
        expect(encoders.y.accessor).toBeDefined();
        expect(encoders.z.accessor).toBeDefined();
        expect(encoders.x.accessor).toBeUndefined();
    });

    // TODO: Test indexer
});
