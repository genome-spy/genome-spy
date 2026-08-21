import { describe, expect, it, vi } from "vitest";
import BaseProgram from "./baseProgram.js";
import { createMockRenderer } from "../../../testUtils/mockRenderer.js";
import { attachScaleDefinitions } from "../../../../testUtils/scaleDefinitions.js";

const TEST_SHADER_BODY = /* wgsl */ `
struct VSOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    var out: VSOut;
    out.pos = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return out;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}
`;

/** @type {Record<string, import("../../utils/channelSpecUtils.js").ChannelSpec>} */
const TEST_CHANNEL_SPECS = {
    id: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1 },
    vec: { type: "f32", components: 4 },
};

class TestProgram extends BaseProgram {
    get channelOrder() {
        return ["id", "x", "vec"];
    }

    get optionalChannels() {
        return ["id"];
    }

    get channelSpecs() {
        return TEST_CHANNEL_SPECS;
    }

    get shaderBody() {
        return TEST_SHADER_BODY;
    }
}

/**
 * @param {Record<string, import("../../../index.js").ChannelConfigInput>} channels
 * @param {Record<string, unknown>} [options]
 */
function createProgram(channels, options = {}) {
    return new TestProgram(createMockRenderer(), {
        channels: attachScaleDefinitions(channels),
        count: 1,
        ...options,
    });
}

/** @type {Record<string, import("../../utils/channelSpecUtils.js").ChannelSpec>} */
const SERIES_CHANNEL_SPECS = {
    xF32: { type: "f32", components: 1 },
    xU32: { type: "u32", components: 1 },
    xI32: { type: "i32", components: 1 },
};

class SeriesTypeProgram extends BaseProgram {
    get channelOrder() {
        return ["xF32", "xU32", "xI32"];
    }

    get channelSpecs() {
        return SERIES_CHANNEL_SPECS;
    }

    get shaderBody() {
        return TEST_SHADER_BODY;
    }
}

/**
 * @param {Record<string, import("../../../index.js").ChannelConfigInput>} channels
 * @param {number} count
 */
function createSeriesProgram(channels, count) {
    return new SeriesTypeProgram(createMockRenderer(), {
        channels: attachScaleDefinitions(channels),
        count,
    });
}

describe("BaseProgram channel validation", () => {
    it("retains scalar inputs and validates scalar slot updates", () => {
        const program = createProgram(
            {
                x: { value: 0.5, type: "f32" },
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            },
            {
                inputs: {
                    score: {
                        data: new Float32Array([0]),
                        type: "f32",
                    },
                },
                scalarSlots: {
                    threshold: { value: 0.5, type: "f32" },
                },
            }
        );

        expect(program._channels.score.type).toBe("f32");
        expect(program.getSlotHandles().scalarSlots.threshold).toBeDefined();
        expect(() =>
            program.getSlotHandles().scalarSlots.threshold.set(Number.NaN)
        ).toThrow("must not contain NaN");
        expect(() =>
            program.getSlotHandles().scalarSlots.threshold.set(Infinity)
        ).not.toThrow();
    });

    it("does not expose synthetic conditional channels to predicates", () => {
        expect(() =>
            createProgram(
                {
                    id: { value: 1, type: "u32" },
                    x: { value: 0.5, type: "f32" },
                    vec: {
                        value: [1, 0, 0, 1],
                        type: "f32",
                        components: 4,
                        conditions: [
                            {
                                when: {
                                    selection: "chosen",
                                    type: "interval",
                                    targets: [{ input: "x" }],
                                },
                                channel: {
                                    value: [0, 1, 0, 1],
                                    type: "f32",
                                    components: 4,
                                },
                            },
                        ],
                    },
                },
                {
                    visibleWhen: {
                        compare: ">=",
                        left: { channel: "vec__cond0" },
                        right: { channel: "x" },
                    },
                }
            )
        ).toThrow('unknown channel "vec__cond0"');
    });

    it("allows optional channels to be omitted", () => {
        expect(() =>
            createProgram({
                x: { value: 0.5, type: "f32" },
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).not.toThrow();
    });

    it("rejects missing data/value for required channels", () => {
        expect(() =>
            createProgram({
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).toThrow('Channel "x" must specify either data or value.');
    });

    it("rejects channels with both data and value", () => {
        const invalidChannel =
            /** @type {import("../../../index.js").ChannelConfigInput} */ (
                /** @type {unknown} */ ({
                    data: new Float32Array([1]),
                    value: 0.5,
                    type: "f32",
                })
            );

        expect(() =>
            createProgram({
                x: invalidChannel,
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).toThrow('Channel "x" must not specify both data and value.');
    });

    it("rejects series channels missing type", () => {
        expect(() =>
            createProgram({
                x: { data: new Float32Array([1]) },
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).toThrow('Channel "x" requires a series data type.');
    });

    it("rejects type mismatches against channel specs", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "u32" },
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).toThrow('Channel "x" must use type "f32"');
    });

    it("rejects component mismatches against channel specs", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                vec: { value: [1, 0], type: "f32", components: 2 },
            })
        ).toThrow('Channel "vec" must use 4 components');
    });

    it("rejects mismatched input/output components without threshold scales", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                vec: {
                    data: new Float32Array([0]),
                    type: "f32",
                    components: 4,
                    inputComponents: 1,
                },
            })
        ).toThrow(
            'Channel "vec" uses vector components but scale "identity" only supports scalars.'
        );
    });

    it("allows mismatched input/output components with threshold scales", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                vec: {
                    data: new Float32Array([0]),
                    type: "f32",
                    components: 4,
                    inputComponents: 1,
                    scale: {
                        type: "threshold",
                        domain: [0],
                        range: [
                            [0, 0, 0, 1],
                            [1, 1, 1, 1],
                        ],
                    },
                },
            })
        ).not.toThrow();
    });

    it("allows numeric threshold inputs for enum outputs", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                shape: {
                    data: new Float32Array([0.25]),
                    type: "f32",
                    scale: {
                        type: "threshold",
                        domain: [0.5],
                        range: [0, 1],
                    },
                },
                vec: { value: [1, 0, 0, 1], type: "f32", components: 4 },
            })
        ).not.toThrow();
    });

    it("allows mismatched input/output components with ordinal scales", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                vec: {
                    data: new Uint32Array([0]),
                    type: "u32",
                    components: 4,
                    inputComponents: 1,
                    scale: {
                        type: "ordinal",
                        domain: [0, 1],
                        range: [
                            [0, 0, 0, 1],
                            [1, 1, 1, 1],
                        ],
                    },
                },
            })
        ).not.toThrow();
    });

    it("rejects ordinal scales with empty ranges", () => {
        expect(() =>
            createProgram({
                x: { value: 1, type: "f32" },
                vec: {
                    data: new Uint32Array([0]),
                    type: "u32",
                    components: 4,
                    inputComponents: 1,
                    scale: { type: "ordinal", range: [] },
                },
            })
        ).toThrow('Ordinal scale on "vec" requires a non-empty range.');
    });

    it("copies interval targets without adding hit testing to scalar inputs", () => {
        const targets = Object.freeze([Object.freeze({ input: "x" })]);
        const predicate = Object.freeze({
            selection: "brush",
            type: "interval",
            targets,
        });
        const program = createProgram({
            x: { value: 0.5, type: "f32" },
            vec: {
                value: [1, 0, 0, 1],
                type: "f32",
                components: 4,
                conditions: [
                    {
                        when: predicate,
                        value: [0, 1, 0, 1],
                    },
                ],
            },
        });

        const when = program._channels.vec.conditions[0].when;
        expect(when.type).toBe("interval");
        if (when.type === "interval") {
            expect(when.targets).toEqual([{ input: "x" }]);
        }
        expect(predicate.targets).toEqual([{ input: "x" }]);
    });

    it("inherits logical channel components for conditional channels", () => {
        const program = createProgram({
            x: { value: 0.5, type: "f32" },
            vec: {
                value: [1, 0, 0, 1],
                type: "f32",
                components: 4,
                conditions: [
                    {
                        when: {
                            selection: "brush",
                            type: "interval",
                            targets: [{ input: "x" }],
                        },
                        channel: {
                            data: new Float32Array([0, 1, 0, 1]),
                            type: "f32",
                            inputComponents: 4,
                        },
                    },
                ],
            },
        });

        expect(program._channels.vec__cond0.components).toBe(4);
    });

    it.each(
        /** @type {Array<[string, Record<string, unknown>, string]>} */ ([
            [
                "empty target arrays",
                { targets: [] },
                "must specify a non-empty targets array",
            ],
            [
                "duplicate targets",
                { targets: [{ input: "x" }, { input: "x" }] },
                'cannot target "x" more than once',
            ],
            [
                "unknown targets",
                { targets: [{ input: "missing" }] },
                "references unknown selection input",
            ],
            [
                "hit tests without endpoints",
                { targets: [{ input: "x", hitTest: "endpoints" }] },
                "cannot specify a hit-test mode without a secondary input",
            ],
        ])
    )("rejects %s", (_label, interval, message) => {
        const when =
            /** @type {import("../../../index.d.ts").SelectionPredicate} */ (
                /** @type {unknown} */ ({
                    selection: "brush",
                    type: "interval",
                    ...interval,
                })
            );
        expect(() =>
            createProgram({
                x: { value: 0.5, type: "f32" },
                vec: {
                    value: [1, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    conditions: [
                        {
                            when,
                            value: [0, 1, 0, 1],
                        },
                    ],
                },
            })
        ).toThrow(message);
    });

    it("rejects the obsolete singular interval channel form", () => {
        expect(() =>
            createProgram({
                x: { value: 0.5, type: "f32" },
                vec: {
                    value: [1, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    conditions: [
                        {
                            when: /** @type {import("../../../index.d.ts").SelectionPredicate} */ (
                                /** @type {unknown} */ ({
                                    selection: "brush",
                                    type: "interval",
                                    channel: "x",
                                })
                            ),
                            value: [0, 1, 0, 1],
                        },
                    ],
                },
            })
        ).toThrow('uses the obsolete "channel" form');
    });

    it("rejects an interval uniform layout over the device limit", () => {
        const renderer = createMockRenderer();
        Object.defineProperty(renderer.device, "limits", {
            value: { maxUniformBufferBindingSize: 15 },
        });
        const createBuffer = vi.spyOn(renderer.device, "createBuffer");

        expect(
            () =>
                new TestProgram(renderer, {
                    channels: attachScaleDefinitions({
                        x: { value: 0.5, type: "f32" },
                        vec: {
                            value: [1, 0, 0, 1],
                            type: "f32",
                            components: 4,
                            conditions: [
                                {
                                    when: {
                                        selection: "brush",
                                        type: "interval",
                                        targets: [{ input: "x" }],
                                    },
                                    value: [0, 1, 0, 1],
                                },
                            ],
                        },
                    }),
                    count: 1,
                })
        ).toThrow(
            'interval selection "brush" (1 targets) requires 16 bytes, exceeding the device limit of 15 bytes'
        );
        expect(createBuffer).not.toHaveBeenCalled();
    });
});

describe("BaseProgram series type validation", () => {
    it("rejects non-f32 arrays for f32 series channels", () => {
        const program = createSeriesProgram(
            {
                xF32: { data: new Float32Array([1]), type: "f32" },
                xU32: { data: new Uint32Array([1]), type: "u32" },
                xI32: { data: new Int32Array([1]), type: "i32" },
            },
            1
        );

        expect(() =>
            program.updateSeries(
                {
                    xF32: new Uint32Array([1]),
                    xU32: new Uint32Array([1]),
                    xI32: new Int32Array([1]),
                },
                1
            )
        ).toThrow('Channel "xF32" expects a Float32Array for f32 data');
    });

    it("rejects non-u32 arrays for u32 series channels", () => {
        const program = createSeriesProgram(
            {
                xF32: { data: new Float32Array([1]), type: "f32" },
                xU32: { data: new Uint32Array([1]), type: "u32" },
                xI32: { data: new Int32Array([1]), type: "i32" },
            },
            1
        );

        expect(() =>
            program.updateSeries(
                {
                    xF32: new Float32Array([1]),
                    xU32: new Float32Array([1]),
                    xI32: new Int32Array([1]),
                },
                1
            )
        ).toThrow('Channel "xU32" expects a Uint32Array for u32 data');
    });

    it("rejects non-i32 arrays for i32 series channels", () => {
        const program = createSeriesProgram(
            {
                xF32: { data: new Float32Array([1]), type: "f32" },
                xU32: { data: new Uint32Array([1]), type: "u32" },
                xI32: { data: new Int32Array([1]), type: "i32" },
            },
            1
        );

        expect(() =>
            program.updateSeries(
                {
                    xF32: new Float32Array([1]),
                    xU32: new Uint32Array([1]),
                    xI32: new Uint32Array([1]),
                },
                1
            )
        ).toThrow('Channel "xI32" expects an Int32Array for i32 data');
    });

    it("rejects series arrays shorter than count * components", () => {
        const program = createSeriesProgram(
            {
                xF32: { data: new Float32Array([1]), type: "f32" },
                xU32: { data: new Uint32Array([1]), type: "u32" },
                xI32: { data: new Int32Array([1]), type: "i32" },
            },
            1
        );

        expect(() =>
            program.updateSeries(
                {
                    xF32: new Float32Array([1]),
                    xU32: new Uint32Array([1]),
                    xI32: new Int32Array([1]),
                },
                2
            )
        ).toThrow('Channel "xF32" length (1) is less than count (2)');
    });
});
