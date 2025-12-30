import { createRenderer } from "../src/index.js";
import { setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runPiecewiseScene(canvas) {
    const renderer = await createRenderer(canvas);

    const count = 40;
    const padding = 20;

    const x = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        x[i] = i;
    }

    const markId = renderer.createMark("point", {
        count,
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: {
                    type: "linear",
                    domain: [0, count - 1],
                },
            },
            y: {
                value: 0,
                type: "f32",
                dynamic: true,
                scale: { type: "identity" },
            },
            size: { value: 500 },
            fill: {
                data: x,
                type: "f32",
                inputComponents: 1,
                components: 4,
                scale: {
                    type: "linear",
                    domain: [5, 10, 20, 30],
                    range: ["green", "#0050f8", "#f6f6f6", "#ff3000"],
                    clamp: true,
                },
            },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeWidth: { value: 1.0 },
        },
    });

    const updateRanges = ({ width, height }) => {
        renderer.updateScaleRanges(markId, {
            x: [padding, Math.max(padding, width - padding)],
        });
        renderer.updateValues(markId, { y: height * 0.5 });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.updateSeries(markId, { x }, count);

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
