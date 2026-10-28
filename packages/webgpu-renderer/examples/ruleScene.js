import { createExampleRenderer, setupResize } from "./utils.js";
import { ruleMark } from "../src/marks/rule.js";
import { color as parseColor } from "d3-color";
import { linearScale } from "../src/scales/linear.js";
import { ordinalScale } from "../src/scales/ordinal.js";

/**
 * @typedef {object} RuleOptions
 * @prop {number} [size]
 * @prop {number} [strokeWidth]
 * @prop {number} [strokeOpacity]
 * @prop {number} [fillOpacity]
 * @prop {number} [opacity]
 * @prop {string} [stroke]
 * @prop {"butt" | "square" | "round"} [cap]
 * @prop {"inside" | "center" | "outside"} [alignment]
 * @prop {boolean} [dashed]
 * @prop {number} [dashPattern]
 * @prop {number} [dashOffset]
 */

/** @type {Required<RuleOptions>} */
export const ruleDefaults = {
    size: 8,
    strokeWidth: 1,
    strokeOpacity: 1,
    fillOpacity: 1,
    opacity: 0.9,
    stroke: "#ffffff",
    cap: "butt",
    alignment: "outside",
    dashed: true,
    dashPattern: 1,
    dashOffset: 0,
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {RuleOptions} [options]
 * @returns {Promise<{cleanup: () => void, update: (next: RuleOptions) => void}>}
 */
export default async function runRuleScene(canvas, options = {}) {
    const renderer = await createExampleRenderer(canvas);

    const padding = 30;
    const count = 200;
    const palette = [
        "#1f77b4",
        "#aec7e8",
        "#ff7f0e",
        "#ffbb78",
        "#2ca02c",
        "#98df8a",
        "#d62728",
        "#ff9896",
        "#9467bd",
        "#c5b0d5",
        "#8c564b",
        "#c49c94",
        "#e377c2",
        "#f7b6d2",
        "#7f7f7f",
        "#c7c7c7",
        "#bcbd22",
        "#dbdb8d",
        "#17becf",
        "#9edae5",
    ];
    const colorDomain = palette.map((_, idx) => idx);

    const x = new Float32Array(count);
    const x2 = new Float32Array(count);
    const y = new Float32Array(count);
    const y2 = new Float32Array(count);
    const size = new Float32Array(count);
    const color = new Uint32Array(count);

    for (let i = 0; i < count; i += 1) {
        const x0 = Math.random();
        const x1 = x0 + Math.random() * 0.3 - 0.15;
        const y0 = Math.random();
        const y1 = y0 + Math.random() * 0.3 - 0.15;

        x[i] = Math.min(1, Math.max(0, x0));
        x2[i] = Math.min(1, Math.max(0, x1));
        y[i] = Math.min(1, Math.max(0, y0));
        y2[i] = Math.min(1, Math.max(0, y1));
        size[i] = Math.pow(Math.random(), 2) * 15.0;
        color[i] = Math.min(
            palette.length - 1,
            Math.floor(x[i] * palette.length)
        );
    }

    const mark = renderer.createMark(ruleMark, {
        count,
        dashPatterns: [
            [1, 0],
            [8, 4],
            [2, 4],
            [8, 3, 2, 3],
        ],
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            x2: {
                data: x2,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            y2: {
                data: y2,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            size: {
                data: size,
                type: "f32",
                scale: linearScale({
                    domain: [0, 15],
                    range: [0, ruleDefaults.size],
                }),
            },
            fill: {
                data: color,
                type: "u32",
                scale: ordinalScale({ domain: colorDomain, range: palette }),
            },
            strokeDash: { value: 1, type: "u32", dynamic: true },
            strokeDashOffset: { value: 0, dynamic: true },
            opacity: { value: ruleDefaults.opacity, dynamic: true },
            fillOpacity: { value: 1, dynamic: true },
            stroke: { value: [1, 1, 1, 1], dynamic: true },
            strokeWidth: { value: 1, dynamic: true },
            strokeOpacity: { value: 1, dynamic: true },
            strokeCap: { value: 0, type: "u32", dynamic: true },
            strokeAlign: { value: 2, type: "u32", dynamic: true },
        },
    });

    const { scales, values } = mark;

    const updateRanges = ({ width, height }) => {
        const xRange = [padding, Math.max(padding, width - padding)];
        const yRange = [Math.max(padding, height - padding), padding];
        scales.x.setRange(xRange);
        scales.x2.setRange(xRange);
        scales.y.setRange(yRange);
        scales.y2.setRange(yRange);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    /** @param {RuleOptions} next */
    const update = (next) => {
        const state = { ...ruleDefaults, ...next };
        mark.batchUpdates(() => {
            scales.size.setRange([0, state.size]);
            const stroke = parseColor(state.stroke).rgb();
            values.stroke.set([
                stroke.r / 255,
                stroke.g / 255,
                stroke.b / 255,
                stroke.opacity,
            ]);
            values.strokeWidth.set(state.strokeWidth);
            values.strokeOpacity.set(state.strokeOpacity);
            values.fillOpacity.set(state.fillOpacity);
            values.opacity.set(state.opacity);
            values.strokeCap.set({ butt: 0, square: 1, round: 2 }[state.cap]);
            values.strokeAlign.set(
                { inside: 0, center: 1, outside: 2 }[state.alignment]
            );
            values.strokeDash.set(state.dashed ? state.dashPattern : 0);
            values.strokeDashOffset.set(state.dashOffset);
        });
        renderer.render();
    };
    update(options);

    return {
        update,
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
