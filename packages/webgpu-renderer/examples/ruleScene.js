import { createExampleRenderer, setupResize } from "./utils.js";

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

    const markId = renderer.createMark("rule", {
        count,
        packedSeries: true,
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
                scale: { type: "linear", domain: [0, 1] },
            },
            x2: {
                data: x2,
                type: "f32",
                scale: { type: "linear", domain: [0, 1] },
            },
            y: {
                data: y,
                type: "f32",
                scale: { type: "linear", domain: [0, 1] },
            },
            y2: {
                data: y2,
                type: "f32",
                scale: { type: "linear", domain: [0, 1] },
            },
            size: {
                data: size,
                type: "f32",
                scale: { type: "identity" },
            },
            color: {
                data: color,
                type: "u32",
                scale: { type: "ordinal", domain: colorDomain, range: palette },
            },
            strokeDash: { data: dash, type: "u32" },
            opacity: { value: 0.9 },
            strokeCap: { value: 2, type: "u32" },
        },
    });

    const updateRanges = ({ width, height }) => {
        const xRange = [padding, Math.max(padding, width - padding)];
        const yRange = [Math.max(padding, height - padding), padding];
        renderer.updateScaleRanges(markId, {
            x: xRange,
            x2: xRange,
            y: yRange,
            y2: yRange,
        });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.updateSeries(markId, { x, x2, y, y2, size, color, dash }, count);
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
