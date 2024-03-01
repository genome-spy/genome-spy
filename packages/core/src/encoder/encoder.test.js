import { describe, expect, test } from "vitest";

import { createAccessor, createConditionalAccessors } from "./accessor.js";
import ParamMediator from "../view/paramMediator.js";
import { createEncoder, createSimpleOrConditionalEncoder } from "./encoder.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createSinglePointSelection } from "../selection/selection.js";
import { isArray } from "vega-util";
import { scaleLinear } from "d3-scale";

/** @type {import("../spec/channel.js").Encoding} */
const encoding = {
    x: { value: 42 },
    y: {
        field: "a",
        type: "quantitative",
        scale: { domain: [0, 100], range: [0, 1] },
    },
    size: {
        field: "a",
        type: "quantitative",
        scale: { domain: [0, 100], range: [0, 10] },
        condition: {
            param: "p",
            empty: false,
            value: 5000,
        },
    },
};

const scaleSource = (
    /** @type {import("../spec/channel.js").ChannelWithScale} */ channel
) => {
    // @ts-ignore
    const props = encoding[channel].scale ?? encoding[channel].condition?.scale;

    return Object.assign(
        scaleLinear().domain(props.domain).range(props.range),
        {
            type: "linear",
        }
    );
};

const datum = {
    a: 100,
    b: 6,
    c: "Pink Floyd",
    [UNIQUE_ID_KEY]: 1234,
};

describe("Encoder", () => {
    const pm = new ParamMediator();
    const e = Object.fromEntries(
        Object.entries(encoding).map(([channel, channelDef]) => {
            const accessor = createAccessor(channel, channelDef, pm);
            return [channel, createEncoder(accessor, scaleSource)];
        })
    );

    test("Returns a value", () => expect(e.x(datum)).toEqual(42));

    test("Accesses a field and uses a scale", () => expect(e.y(datum)).toBe(1));

    // TODO: Text ExprRef
});

describe("Conditional encoder", () => {
    const pm = new ParamMediator();
    const setter = pm.allocateSetter("p", createSinglePointSelection(null));

    const e = createSimpleOrConditionalEncoder(
        createConditionalAccessors("size", encoding.size, pm),
        scaleSource
    );

    test("has multiple accessors", () =>
        expect(isArray(e.accessor)).toBeTruthy());

    test("encodes the default when predicate is false", () => {
        setter(createSinglePointSelection(null));
        expect(e(datum)).toBe(10);
    });

    test("encodes a conditional when predicate is true", () => {
        setter(createSinglePointSelection(datum));
        expect(e(datum)).toBe(5000);
    });
});
