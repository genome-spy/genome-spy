import AccessorFactory from "./accessor";
import { scaleLinear } from "d3-scale";

import createEncoders from "./encoder";

describe("Encoder", () => {

    /** @type {import("../view/viewUtils").EncodingSpecs} */
    const encodingSpecs = {
        x: { value: 0 },
        y: { field: "a" },
        y2: { field: "b" },
        z: { constant: 2 },
        size: { value: 5 }
    };

    const scales = {
        y: scaleLinear().domain([0, 10]),
        z: scaleLinear().domain([0, 20])
    };

    const scaleSource = channel => scales[channel];
    
    const accessorFactory = new AccessorFactory();
    const accesorSource = channel => 
        accessorFactory.createAccessor(encodingSpecs[channel]);

    const encoders = createEncoders(encodingSpecs, scaleSource, accesorSource);

    const datum = {
        a: 5,
        b: 6,
        c: "Pink Floyd"
    };

    test("Throws on a broken spec", () =>
        expect(() => createEncoders({ x: {} }, x => null, accesorSource)).toThrow());

    test("The encoder object contains all channels", () =>
        expect(["x", "y", "z", "size"].every(channel => typeof encoders[channel] === "function"))
            .toBeTruthy());

    test("Returns a value", () => 
        expect(encoders.x(datum)).toEqual(0));

    test("Encodes and returns a constant using a scale", () =>
        expect(encoders.z(datum)).toBeCloseTo(0.1));

    test("Accesses a field and uses a scale", () =>
        expect(encoders.y(datum)).toBeCloseTo(0.5));

    test("Accesses a field on a secondary channel and uses the scale from the primary", () =>
        expect(encoders.y2(datum)).toBeCloseTo(0.6));
    
    test("Constant encoder is annotated", () => {
        expect(encoders.y.constant).toBeFalsy();
        expect(encoders.z.constant).toBeTruthy();
        expect(encoders.size.constant).toBeTruthy();
    });

    test("Inverts a value", () => {
        expect(encoders.y.invert(0.5)).toBeCloseTo(5);
        expect(encoders.z.invert(0.5)).toBeCloseTo(10);
        // A value, no scale, can't invert
        expect(() => encoders.size.invert(123)).toThrow();
    });

    test.todo("Test access to accessor");


});