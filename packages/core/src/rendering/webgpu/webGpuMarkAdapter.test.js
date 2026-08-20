import { describe, expect, test, vi } from "vitest";

import Rectangle from "../../view/layout/rectangle.js";
import { bandScaleDefinition } from "@genome-spy/webgpu-renderer/scales/band";
import { identityScaleDefinition } from "@genome-spy/webgpu-renderer/scales/identity";
import { indexScaleDefinition } from "@genome-spy/webgpu-renderer/scales/index";
import { linearScaleDefinition } from "@genome-spy/webgpu-renderer/scales/linear";
import { thresholdScaleDefinition } from "@genome-spy/webgpu-renderer/scales/threshold";
import { createWebGpuMarkConfig } from "./webGpuMarkAdapter.js";

describe("WebGPU mark adapter", () => {
    test("keeps raw point data and maps unit scale ranges to view pixels", () => {
        const data = [
            { x: 0, y: -1 },
            { x: 2, y: 1 },
        ];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createLinearScale([0, 2]),
            }),
            y: createEncoder((datum) => datum.y, {
                scale: createLinearScale([-1, 1]),
            }),
            size: createConstantEncoder(64),
            shape: createConstantEncoder("circle"),
            strokeWidth: createConstantEncoder(0),
            xOffset: createConstantEncoder(0),
            yOffset: createConstantEncoder(0),
            fill: createConstantEncoder("#336699"),
            stroke: createConstantEncoder(null),
            fillOpacity: createConstantEncoder(0.75),
            strokeOpacity: createConstantEncoder(1),
            angle: createConstantEncoder(0),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(10, 20, 100, 200),
            0.5
        );
        if (!translated) {
            throw new Error("Expected a translated point mark.");
        }

        expect(translated.definition.type).toBe("point");
        const channels = /** @type {any} */ (translated.config).channels;
        expect(channels.x).toEqual({
            data: new Float32Array([0, 2]),
            type: "f32",
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [0, 2],
                range: [10, 110],
                clamp: false,
            },
        });
        expect(channels.y).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [-1, 1],
                range: [220, 20],
                clamp: false,
            },
        });
        expect(channels.fill.value).toEqual([0.2, 0.4, 0.6, 1]);
        expect(channels.fillOpacity).toEqual({ value: 0.375 });
    });

    test("combines text offsets and uses the embedded font for Core defaults", () => {
        const data = [
            { label: "A", offset: 2 },
            { label: "B", offset: -3 },
        ];
        const mark = createMark(
            "text",
            data,
            {
                x: createConstantEncoder(0.5),
                y: createConstantEncoder(1),
                text: createEncoder((datum) => datum.label),
                size: createConstantEncoder(11),
                angle: createConstantEncoder(0),
                xOffset: createEncoder((datum) => datum.offset),
                yOffset: createConstantEncoder(9),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "center",
                baseline: "top",
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(10, 20, 100, 200)
        );
        if (!translated) {
            throw new Error("Expected a translated text mark.");
        }

        const config = /** @type {any} */ (translated.config);
        expect(config.channels.x).toEqual({
            value: 60,
            scale: {
                type: "identity",
                definition: identityScaleDefinition,
            },
        });
        expect(config.channels.y).toEqual({
            value: 20,
            scale: {
                type: "identity",
                definition: identityScaleDefinition,
            },
        });
        expect(config.channels.text).toEqual({ data: ["A", "B"] });
        expect(config.channels.dx).toEqual({
            data: new Float32Array([2, -3]),
            type: "f32",
        });
        expect(config.channels.dy).toEqual({ value: 9 });
        expect(config.font).toBe("Lato");
    });

    test("applies the text channel number format", () => {
        const data = [{ value: 1.2345 }, { value: -0.5 }];
        const mark = createMark(
            "text",
            data,
            {
                x: createConstantEncoder(0),
                y: createConstantEncoder(0),
                text: createEncoder((datum) => datum.value, {
                    channelDef: { field: "value", format: ".2f" },
                }),
                size: createConstantEncoder(11),
                angle: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "center",
                baseline: "middle",
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.text.data
        ).toEqual(["1.23", "−0.50"]);
    });

    test("maps categorical positions to stable band-scale identifiers", () => {
        const data = [{ category: "A" }, { category: "B" }];
        const domain = ["A", "B"];
        const xOptions = {
            scale: createBandScale(domain),
            channelDef: {
                field: "category",
                type: "nominal",
                band: 0.5,
            },
        };
        const mark = createMark(
            "rule",
            data,
            {
                x: createEncoder((datum) => datum.category, xOptions),
                x2: createEncoder((datum) => datum.category, xOptions),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                size: createConstantEncoder(1),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                strokeDash: null,
                minLength: 0,
                strokeCap: "butt",
                strokeDashOffset: 0,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        domain.reverse();
        const updated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const updatedX = /** @type {any} */ (updated).config.channels.x;

        expect(x.data).toEqual(new Uint32Array([0, 1]));
        expect(x.type).toBe("u32");
        expect(x.scale).toEqual({
            type: "band",
            definition: bandScaleDefinition,
            domain: [0, 1],
            range: [10, 110],
            paddingInner: 0.2,
            paddingOuter: 0.1,
            align: 0.5,
            band: 0.5,
        });
        expect(updatedX.data).toBe(x.data);
        expect(updatedX.scale.domain).toEqual([1, 0]);
    });

    test("maps index positions to packed high-precision series", () => {
        const data = [{ x: 4 }, { x: 9 }];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createIndexScale([3, 10]),
                channelDef: {
                    field: "x",
                    type: "index",
                    band: 0.25,
                },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        expect(x).toEqual({
            data: new Float64Array([4, 9]),
            type: "u32",
            inputComponents: 2,
            scale: {
                type: "index",
                definition: indexScaleDefinition,
                domain: [3, 10],
                range: [10, 110],
                paddingInner: 0.2,
                paddingOuter: 0.1,
                align: 0.5,
                band: 0.25,
            },
        });
    });

    test("maps sequential and threshold color encodings", () => {
        const data = [{ value: -1 }, { value: 1 }];
        const interpolator = (/** @type {number} */ t) =>
            t < 0.5 ? "purple" : "yellow";
        const sequentialMark = createMark("point", data, {
            fill: createEncoder((datum) => datum.value, {
                scale: createSequentialScale([-1, 1], interpolator),
                channelDef: {
                    field: "value",
                    type: "quantitative",
                },
            }),
        });
        const thresholdMark = createMark("point", data, {
            fill: createEncoder((datum) => datum.value, {
                scale: createThresholdScale([0], ["white", "black"]),
                channelDef: {
                    field: "value",
                    type: "quantitative",
                },
            }),
        });

        const sequential = createWebGpuMarkConfig(
            sequentialMark,
            {},
            Rectangle.ZERO
        );
        const threshold = createWebGpuMarkConfig(
            thresholdMark,
            {},
            Rectangle.ZERO
        );

        expect(/** @type {any} */ (sequential).config.channels.fill).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            inputComponents: 1,
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [-1, 1],
                range: interpolator,
                clamp: true,
            },
        });
        expect(/** @type {any} */ (threshold).config.channels.fill).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            inputComponents: 1,
            scale: {
                type: "threshold",
                definition: thresholdScaleDefinition,
                domain: [0],
                range: ["white", "black"],
            },
        });
    });

    test("translates a categorical bar to the generic rect mark", () => {
        const data = [
            { category: "A", value: 28 },
            { category: "B", value: 55 },
        ];
        /** @param {number} band */
        const categorical = (band) => ({
            scale: createBandScale(["A", "B"]),
            channelDef: {
                field: "category",
                type: "nominal",
                band,
            },
        });
        const mark = createMark(
            "rect",
            data,
            {
                x: createEncoder((datum) => datum.category, categorical(0)),
                x2: createEncoder((datum) => datum.category, categorical(1)),
                y: createEncoder((datum) => datum.value, {
                    scale: createLinearScale([0, 100]),
                    channelDef: { field: "value", type: "quantitative" },
                }),
                y2: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                fill: createConstantEncoder("#336699"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            {
                cornerRadius: 0,
                minWidth: 0.5,
                minHeight: 0.5,
                minOpacity: 1,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const channels = /** @type {any} */ (translated).config.channels;

        expect(translated?.definition.type).toBe("rect");
        expect(channels.x.data).toEqual(new Uint32Array([0, 1]));
        expect(channels.x.scale.band).toBe(0);
        expect(channels.x2.scale.band).toBe(1);
        expect(channels.y.data).toEqual(new Float32Array([28, 55]));
        expect(channels.y2.value).toBe(220);
        expect(channels.fill.value).toEqual([0.2, 0.4, 0.6, 1]);
        expect(channels.hatchPattern).toEqual({ value: 0, type: "u32" });
    });

    test("keeps rectangle endpoint offsets as independently scaled channels", () => {
        const data = [
            { xOffset: -1, x2Offset: 0.5, yOffset: 0.25, y2Offset: 1 },
        ];
        const offsetScale = {
            type: "linear",
            domain: () => [0, 1],
            range: () => [0, 20],
            clamp: () => false,
        };
        const mark = createMark(
            "rect",
            data,
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createEncoder((datum) => datum.xOffset, {
                    scale: offsetScale,
                }),
                x2Offset: createEncoder((datum) => datum.x2Offset, {
                    scale: offsetScale,
                }),
                yOffset: createEncoder((datum) => datum.yOffset, {
                    scale: offsetScale,
                }),
                y2Offset: createEncoder((datum) => datum.y2Offset, {
                    scale: offsetScale,
                }),
                fill: createConstantEncoder("black"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            { cornerRadius: 0, minWidth: 0, minHeight: 0, minOpacity: 0 }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const channels = /** @type {any} */ (translated).config.channels;

        expect(channels.x.value).toBe(10);
        expect(channels.x2.value).toBe(110);
        expect(channels.xOffset.data).toEqual(new Float32Array([-1]));
        expect(channels.x2Offset.data).toEqual(new Float32Array([0.5]));
        expect(channels.xOffset.scale.range).toEqual([0, 20]);
        expect(channels.yOffset.scale.range).toEqual([0, 20]);
    });

    test.each([
        ["alphabetic", 0],
        ["baseline", 0],
        ["middle", 1],
        ["top", 2],
        ["bottom", 3],
    ])("maps the %s text baseline to renderer code %i", (baseline, code) => {
        const mark = createMark(
            "text",
            [{ label: "3.0" }],
            {
                x: createConstantEncoder(0),
                y: createConstantEncoder(0),
                text: createEncoder((datum) => datum.label),
                size: createConstantEncoder(12),
                angle: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "left",
                baseline,
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.baseline
        ).toEqual({ value: code, type: "u32" });
    });

    test("reports unsupported semantics with the Core view path", () => {
        const mark = createMark("point", [{ color: "red" }], {
            fill: createEncoder((datum) => datum.color),
        });

        expect(() =>
            createWebGpuMarkConfig(
                mark,
                /** @type {any} */ ({}),
                Rectangle.ZERO
            )
        ).toThrow(
            'Data-driven "fill" is not supported. Mark: point. View: root/plot'
        );
    });

    test.each(["link", "arrow"])(
        "reports unsupported mark type %s with the Core view path",
        (type) => {
            const mark = createMark(type, [{ value: 1 }], {});

            expect(() =>
                createWebGpuMarkConfig(
                    mark,
                    /** @type {any} */ ({}),
                    Rectangle.ZERO
                )
            ).toThrow(
                `Mark type "${type}" is not supported. Mark: ${type}. View: root/plot`
            );
        }
    );

    test("reuses field-backed columns across scale-only updates", () => {
        const data = [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
        ];
        const x = vi.fn((datum) => datum.x);
        const y = vi.fn((datum) => datum.y);
        const mark = createMark("point", data, {
            x: createEncoder(x, {
                scale: createLinearScale([0, 4]),
                channelDef: { field: "x", type: "quantitative" },
            }),
            y: createEncoder(y, {
                scale: createLinearScale([0, 4]),
                channelDef: { field: "y", type: "quantitative" },
            }),
        });
        const first = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(0, 0, 100, 100)
        );
        const second = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 0, 100, 100)
        );
        if (!first || !second) {
            throw new Error("Expected translated point marks.");
        }

        const firstChannels = /** @type {any} */ (first.config).channels;
        const secondChannels = /** @type {any} */ (second.config).channels;
        expect(secondChannels.x.data).toBe(firstChannels.x.data);
        expect(secondChannels.y.data).toBe(firstChannels.y.data);
        expect(secondChannels.x.scale.range).toEqual([10, 110]);
        expect(x).toHaveBeenCalledTimes(data.length);
        expect(y).toHaveBeenCalledTimes(data.length);
    });

    test("recomputes expression-backed columns for parameter changes", () => {
        const data = [{ x: 1 }];
        let offset = 0;
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x + offset, {
                scale: createLinearScale([0, 4]),
                channelDef: {
                    expr: "datum.x + offset",
                    type: "quantitative",
                },
            }),
        });
        const coords = Rectangle.create(0, 0, 100, 100);

        const first = createWebGpuMarkConfig(mark, {}, coords);
        offset = 2;
        const second = createWebGpuMarkConfig(mark, {}, coords);
        if (!first || !second) {
            throw new Error("Expected translated point marks.");
        }

        expect(/** @type {any} */ (first.config).channels.x.data).toEqual(
            new Float32Array([1])
        );
        expect(/** @type {any} */ (second.config).channels.x.data).toEqual(
            new Float32Array([3])
        );
    });
});

/**
 * @param {string} type
 * @param {object[]} data
 * @param {Record<string, any>} encoders
 * @param {Record<string, any>} [properties]
 */
function createMark(type, data, encoders, properties = {}) {
    const defaultEncoders =
        type == "point"
            ? {
                  x: createConstantEncoder(0),
                  y: createConstantEncoder(0),
                  size: createConstantEncoder(64),
                  shape: createConstantEncoder("circle"),
                  strokeWidth: createConstantEncoder(0),
                  xOffset: createConstantEncoder(0),
                  yOffset: createConstantEncoder(0),
                  fill: createConstantEncoder("black"),
                  stroke: createConstantEncoder(null),
                  fillOpacity: createConstantEncoder(1),
                  strokeOpacity: createConstantEncoder(1),
                  angle: createConstantEncoder(0),
              }
            : {};
    return /** @type {import("../../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            encoders: { ...defaultEncoders, ...encoders },
            properties: {
                dx: 0,
                dy: 0,
                fillGradientStrength: 0,
                inwardStroke: false,
                ...properties,
            },
            getType: () => type,
            unitView: {
                getCollector: () => ({
                    facetBatches: new Map([[undefined, data]]),
                }),
                getPathString: () => "root/plot",
            },
        })
    );
}

/**
 * @param {(datum: any) => any} accessor
 * @param {{scale?: any, channelDef?: any}} [options]
 */
function createEncoder(accessor, options = {}) {
    const channelDef = options.channelDef ?? {};
    Object.assign(accessor, { channelDef });
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(accessor), {
                constant: false,
                scale: options.scale,
                branches: [{ accessor }],
                channelDef,
            })
        )
    );
}

/** @param {any} value */
function createConstantEncoder(value) {
    const accessor = () => value;
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(accessor), {
                constant: true,
                branches: [{ accessor }],
                channelDef: { value },
            })
        )
    );
}

/** @param {[number, number]} domain */
function createLinearScale(domain) {
    return {
        type: "linear",
        domain: () => domain,
        clamp: () => false,
    };
}

/** @param {string[]} domain */
function createBandScale(domain) {
    return {
        type: "band",
        domain: () => domain,
        paddingInner: () => 0.2,
        paddingOuter: () => 0.1,
        align: () => 0.5,
    };
}

/** @param {[number, number]} domain */
function createIndexScale(domain) {
    return {
        type: "index",
        domain: () => domain,
        paddingInner: () => 0.2,
        paddingOuter: () => 0.1,
        align: () => 0.5,
    };
}

/**
 * @param {[number, number]} domain
 * @param {(t: number) => string} interpolator
 */
function createSequentialScale(domain, interpolator) {
    return {
        type: "sequential-linear",
        domain: () => domain,
        interpolator: () => interpolator,
        clamp: () => true,
    };
}

/**
 * @param {number[]} domain
 * @param {string[]} range
 */
function createThresholdScale(domain, range) {
    return {
        type: "threshold",
        domain: () => domain,
        range: () => range,
    };
}
