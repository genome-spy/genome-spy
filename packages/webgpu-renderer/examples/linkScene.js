import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runLinkScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const padding = 30;
    const count = 400;

    const x = new Float32Array(count);
    const x2 = new Float32Array(count);
    const y = new Float32Array(count);
    const y2 = new Float32Array(count);
    const size = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
        const x0 = Math.random();
        const x1 = Math.random();
        const y0 = Math.random();
        const y1 = Math.random();

        x[i] = x0;
        x2[i] = x1;
        y[i] = y0;
        y2[i] = y1;
        size[i] = 1.5 + Math.pow(Math.random(), 2) * 2.5;
    }

    const markId = renderer.createMark("link", {
        count,
        segments: 64,
        linkShape: "arc",
        orient: "vertical",
        arcHeightFactor: 1.0,
        minArcHeight: 8.0,
        maxChordLength: 2000,
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
            size: { data: size, type: "f32", scale: { type: "identity" } },
            color: { value: [0.25, 0.4, 0.9, 1.0] },
            opacity: { value: 0.7 },
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

    renderer.updateSeries(markId, { x, x2, y, y2, size }, count);
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
