import { describe, expect, test } from "vitest";

import { createAccessor } from "./accessor.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import {
    createEncoder,
    createConditionalBranches,
    createSimpleOrConditionalEncoder,
    getDiscreteRange,
    getDiscreteRangeMapper,
    getEncoderAccessors,
    getEncoderDataAccessor,
    isNonMarkPropertyChannel,
} from "./encoder.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import {
    createIntervalSelection,
    createSinglePointSelection,
} from "../selection/selection.js";
import { scaleLinear } from "d3-scale";
import {
    createHeadlessEngine,
    createHeadlessViewContext,
} from "../genomeSpy/headlessBootstrap.js";
import { getSpecErrorLocation } from "../utils/specError.js";

/** @type {import("../spec/channel.js").Encoding} */
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
    const pm = new ViewParamRuntime();
    /** @type {Partial<Record<import("../spec/channel.js").Channel, import("../types/encoder.js").Encoder>>} */
    const e = Object.fromEntries(
        Object.entries(encoding).map(([channel, channelDef]) => {
            const accessor = createAccessor(
                channel,
                /** @type {import("../spec/channel.js").ChannelDef} */ (
                    channelDef
                ),
                pm
            );
            return [channel, createEncoder(accessor, scaleSource)];
        })
    );

    test("has a single branch accessor", () => {
        expect(getEncoderAccessors(e.x)).toHaveLength(1);
    });

    test("provides a data accessor for a FieldDef", () =>
        expect(getEncoderDataAccessor(e.y).fields).toContain("a"));

    test("doesn't provide a data accessor for a ValueDef", () =>
        expect(getEncoderDataAccessor(e.x)).toBeUndefined());

    test("returns a value", () => expect(e.x(datum)).toEqual(42));

    test("accesses a field and uses a scale", () => expect(e.y(datum)).toBe(1));

    // TODO: Text ExprRef
});

describe("isNonMarkPropertyChannel", () => {
    test("identifies non-mark-property metadata channels", () => {
        expect(isNonMarkPropertyChannel("key")).toBe(true);
        expect(isNonMarkPropertyChannel("search")).toBe(true);
        expect(isNonMarkPropertyChannel("tooltip")).toBe(true);
        expect(isNonMarkPropertyChannel("x")).toBe(false);
    });
});

describe("shape channel", () => {
    test("supports the stroke-only x shape", () => {
        expect(getDiscreteRange("shape")).toContain("x");
        expect(getDiscreteRangeMapper("shape")("x")).toBe(12);
        expect(getDiscreteRangeMapper("shape")("+")).toBe(13);
    });
});

describe("direction channel", () => {
    test("maps the stable direction codes", () => {
        const mapper = getDiscreteRangeMapper("direction");

        expect(getDiscreteRange("direction")).toEqual([
            "forward",
            "reverse",
            "both",
        ]);
        expect(mapper("forward")).toBe(0);
        expect(mapper("reverse")).toBe(1);
        expect(mapper("both")).toBe(2);
    });

    test("rejects unknown directions", () => {
        expect(() => getDiscreteRangeMapper("direction")("sideways")).toThrow(
            'Invalid value for "direction" channel: sideways'
        );
    });
});

describe("Conditional encoder with a field and a conditional value", () => {
    const pm = new ViewParamRuntime();
    const setter = pm.allocateSetter("p", createSinglePointSelection(null));

    const e = createSimpleOrConditionalEncoder(
        createConditionalBranches("size", encoding.size, encoding, pm),
        scaleSource
    );

    test("has multiple branch accessors", () => {
        expect(getEncoderAccessors(e)).toHaveLength(2);
    });

    test("accesses the field using the dataAccessor", () =>
        expect(getEncoderDataAccessor(e)(datum)).toBe(100));

    test("encodes the default when a predicate is false", () => {
        setter(createSinglePointSelection(null));
        expect(e(datum)).toBe(10);
    });

    test("encodes the conditional value when a predicate is true", () => {
        setter(createSinglePointSelection(datum));
        expect(e(datum)).toBe(5000);
    });
});

describe("Conditional encoder with interval selection", () => {
    const pm = new ViewParamRuntime();
    const setBrush = pm.allocateSetter("brush", createIntervalSelection(["x"]));

    const encoder = createSimpleOrConditionalEncoder(
        createConditionalBranches(
            "opacity",
            {
                value: 0.1,
                condition: {
                    param: "brush",
                    empty: false,
                    value: 1,
                },
            },
            {
                x: {
                    field: "a",
                    type: "quantitative",
                },
                opacity: {
                    value: 0.1,
                    condition: {
                        param: "brush",
                        empty: false,
                        value: 1,
                    },
                },
            },
            pm
        ),
        () =>
            Object.assign(scaleLinear().domain([0, 1]).range([0, 1]), {
                type: "linear",
            })
    );

    test("uses the fallback when interval selection is empty and empty is false", () => {
        setBrush(createIntervalSelection(["x"]));
        expect(encoder(datum)).toBe(0.1);
    });
});

test.each(["mark", "inherited encoding", "conditional encoding"])(
    "locates an invalid literal color in a %s",
    async (kind) => {
        const mark = { type: /** @type {const} */ ("point"), color: "reed" };
        const value = { value: "reed" };
        const condition = { ...value, param: "selected" };
        /** @type {import("../spec/root.js").RootSpec} */
        let spec;
        if (kind === "mark") {
            spec = { mark };
        } else if (kind === "inherited encoding") {
            spec = { encoding: { color: value }, layer: [{ mark: "point" }] };
        } else {
            spec = {
                mark: "point",
                params: [{ name: "selected", select: "point" }],
                encoding: {
                    color: { condition, value: null },
                },
            };
        }
        const declaration =
            kind === "mark"
                ? mark
                : kind === "inherited encoding"
                  ? value
                  : condition;
        const context = createHeadlessViewContext();
        context.getSpecOrigin = (fragment) =>
            fragment === declaration ? "declaration" : undefined;

        await expect(
            createHeadlessEngine({ data: { values: [] }, ...spec }, { context })
        ).rejects.toSatisfy((error) => {
            expect(error.message).toBe('Invalid color: "reed"');
            expect(getSpecErrorLocation(error)).toEqual({
                origin: "declaration",
                path: [kind === "mark" ? "color" : "value"],
            });
            return true;
        });
    }
);

test.each(["mark", "encoding"])(
    "ignores an overridden %s color after normalization",
    async (kind) => {
        const { view } = await createHeadlessEngine({
            data: { values: [] },
            mark: {
                type: "point",
                fill: "red",
                stroke: "blue",
                ...(kind === "mark" ? { color: "reed" } : {}),
            },
            ...(kind === "encoding"
                ? { encoding: { color: { value: "reed" } } }
                : {}),
        });
        try {
            const unit = /** @type {import("../view/unitView.js").default} */ (
                view
            );
            expect(unit.mark.encoders.fill({})).toBe("red");
            expect(unit.mark.encoders.stroke({})).toBe("blue");
        } finally {
            view.disposeSubtree();
        }
    }
);

test("defers a domain-dependent color expression until data is loaded", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ label: "red" }] },
        mark: { type: "point", color: { expr: "domain('x')[0]" } },
        encoding: {
            x: { field: "label", type: "nominal", scale: { type: "point" } },
        },
    });
    try {
        const unit = /** @type {import("../view/unitView.js").default} */ (
            view
        );
        expect(unit.mark.encoders.fill({})).toBe("red");
    } finally {
        view.disposeSubtree();
    }
});

test("conditional encoders retain their branch behavior and current scale metadata", () => {
    const runtime = new ViewParamRuntime();
    const select = runtime.allocateSetter(
        "p",
        createSinglePointSelection(null)
    );
    /** @type {((scale: import("../types/encoder.js").VegaScale) => void)[]} */
    const listeners = [];
    const encoder = createSimpleOrConditionalEncoder(
        createConditionalBranches("size", encoding.size, encoding, runtime),
        scaleSource,
        (_channel, listener) => listeners.push(listener)
    );
    const replacement = scaleSource("size");
    replacement.range([0, 40]);
    for (const listener of listeners) listener(replacement);

    expect(encoder(datum)).toBe(40);
    expect(encoder.scale).toBe(replacement);
    select(createSinglePointSelection(datum));
    expect(encoder(datum)).toBe(5000);
    runtime.dispose();
});
