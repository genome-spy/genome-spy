import { describe, expect, test, vi } from "vitest";

import Rectangle from "../../view/layout/rectangle.js";
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
            Rectangle.create(10, 20, 100, 200)
        );
        if (!translated) {
            throw new Error("Expected a translated point mark.");
        }

        expect(translated.type).toBe("point");
        const channels = /** @type {any} */ (translated.config).channels;
        expect(channels.x).toEqual({
            data: new Float32Array([0, 2]),
            type: "f32",
            scale: {
                type: "linear",
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
                domain: [-1, 1],
                range: [220, 20],
                clamp: false,
            },
        });
        expect(channels.fill.value).toEqual([0.2, 0.4, 0.6, 1]);
        expect(channels.fillOpacity).toEqual({ value: 0.75 });
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
            scale: { type: "identity" },
        });
        expect(config.channels.y).toEqual({
            value: 20,
            scale: { type: "identity" },
        });
        expect(config.channels.text).toEqual({ data: ["A", "B"] });
        expect(config.channels.dx).toEqual({
            data: new Float32Array([2, -3]),
            type: "f32",
        });
        expect(config.channels.dy).toEqual({ value: 9 });
        expect(config.font).toBe("Lato");
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
 * @param {{scale?: any}} [options]
 */
function createEncoder(accessor, options = {}) {
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(accessor), {
                constant: false,
                scale: options.scale,
                branches: [{ accessor }],
                channelDef: {},
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
