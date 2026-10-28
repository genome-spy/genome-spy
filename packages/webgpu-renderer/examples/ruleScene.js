import { createExampleRenderer, setupResize } from "./utils.js";
import { ruleMark } from "../src/marks/rule.js";
import { identityScale } from "../src/scales/identity.js";
import { linearScale } from "../src/scales/linear.js";
import { ordinalScale } from "../src/scales/ordinal.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runRuleScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const padding = 30;
    const count = 2000;
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
    const dash = new Uint32Array(count);

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
        dash[i] = color[i] % 6;
    }

    const { series, scales } = renderer.createMark(ruleMark, {
        count,
        dashPatterns: [
            [1, 0],
            [1, 3],
            [3, 1],
            [1, 1],
            [1, 5],
            [4, 2, 1, 2],
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
                scale: identityScale(),
            },
            fill: {
                data: color,
                type: "u32",
                scale: ordinalScale({ domain: colorDomain, range: palette }),
            },
            strokeDash: { data: dash, type: "u32" },
            opacity: { value: 0.9 },
            strokeCap: { value: 2, type: "u32" },
        },
    });

    // Keep the original dashed mark above a separate solid-border comparison.
    const rows = new Float32Array(Array.from({ length: 9 }, (_, i) => i / 8));
    const solid = renderer.createMark(ruleMark, {
        count: 9,
        channels: {
            x: { value: 0.15, scale: linearScale({ domain: [0, 1] }) },
            x2: { value: 0.85, scale: linearScale({ domain: [0, 1] }) },
            y: { data: rows, scale: linearScale({ domain: [0, 1] }) },
            y2: { data: rows, scale: linearScale({ domain: [0, 1] }) },
            size: { value: 10 },
            fill: { value: [1, 0.6, 0.2, 1] },
            stroke: { value: [0.15, 0.25, 0.5, 1] },
            strokeWidth: { value: 3 },
            strokeAlign: {
                data: new Uint32Array(rows.map((_, i) => i % 3)),
                type: "u32",
            },
            strokeCap: {
                data: new Uint32Array(rows.map((_, i) => Math.floor(i / 3))),
                type: "u32",
            },
        },
    });

    const updateRanges = ({ width, height }) => {
        const xRange = [padding, Math.max(padding, width - padding)];
        const yRange = [Math.max(padding, height * 0.45), padding];
        scales.x.setRange(xRange);
        scales.x2.setRange(xRange);
        scales.y.setRange(yRange);
        scales.y2.setRange(yRange);
        solid.batchUpdates(() => {
            solid.scales.x.setRange(xRange);
            solid.scales.x2.setRange(xRange);
            const lower = [
                Math.max(padding, height * 0.55),
                Math.max(padding, height - padding),
            ];
            solid.scales.y.setRange(lower);
            solid.scales.y2.setRange(lower);
        });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    series.replace(
        { x, x2, y, y2, size, fill: color, strokeDash: dash },
        count
    );
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
